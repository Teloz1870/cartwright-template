"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { invokeTool } from "@/lib/tools/registry";
import { ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import type { PageLayout } from "@/lib/builder/section-schema";
import type { SectionKey } from "@/lib/builder/section-registry";
import { isSectionKey } from "@/lib/builder/section-registry";
import { generateSectionProps } from "@/lib/builder/section-generator";
import { getBrand } from "@/lib/brand";
import {
  generateV0Section,
  V0ApiError,
  V0QuotaExceeded,
  V0RateLimit,
} from "@/lib/v0/client";
import { extractHtmlFromV0Files } from "@/lib/v0/transform/extract";
import { sanitizeUserHtml } from "@/lib/v0/transform/sanitize-strict";
import { planPage } from "@/lib/magic/plan";
import { SOURCE_ADAPTERS } from "@/lib/magic/sources";
import type { MagicSource, PagePlanNode } from "@/lib/magic/plan-schema";
import type { GeneratedSection } from "@/lib/magic/types";

/**
 * Visual Builder server-actions — al mutation går gennem tool-registry-
 * chokepointet (`invokeTool`), så scope-check + Zod-validering + audit
 * (withAudit i pages.set_layout) altid kører. Ingen direkte prisma-writes her.
 *
 * Tema-redigering genbruger setup-wizardens eksisterende actions
 * (`saveThemeStep`/`generateThemeAction`) direkte fra klienten — derfor ligger
 * de IKKE her.
 */

export type BuilderActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function publishPageLayout(
  slug: string,
  layout: PageLayout,
): Promise<BuilderActionResult> {
  const session = await requireAdmin();

  const result = await invokeTool(
    "pages.set_layout",
    { slug, confirm: true, layout },
    { actor: `user:${session.user.id}`, requestId: randomUUID() },
    ADMIN_CHAT_SCOPES,
  );

  if (!result.ok) return { ok: false, error: result.error };

  // Storefront-siden /[locale]/info/[slug] er dynamisk (server-rendered on
  // demand), men revalider rute-mønstret eksplicit så evt. cache-lag tømmes.
  revalidatePath("/[locale]/info/[slug]", "page");
  return { ok: true };
}

export async function loadPageLayout(
  slug: string,
): Promise<
  | { ok: true; layout: PageLayout | null }
  | { ok: false; error: string }
> {
  const session = await requireAdmin();

  const result = await invokeTool(
    "pages.get_layout",
    { slug },
    { actor: `user:${session.user.id}`, requestId: randomUUID() },
    ADMIN_CHAT_SCOPES,
  );

  if (!result.ok) return { ok: false, error: result.error };
  const layout = (result.result as { layout: PageLayout | null }).layout;
  return { ok: true, layout };
}

/**
 * Fase 3 — AI-genererede sektioner. Returnerer en valideret props-payload til
 * den valgte sektion (aldrig vilkårlig JSX). Output er garanteret gyldigt mod
 * sektionens schema, så det kan apply'es direkte i inspectoren og senere
 * publiceres uændret gennem pages.set_layout.
 *
 * To generatorer:
 *  - `vibe`-sektionen er v0-broen: v0 genererer fri-form HTML → extract +
 *    sanitize → `{ html }`-props (gated bag brand.features.v0Generator).
 *  - Alle andre sektioner bruger den strukturerede props-generator (Anthropic
 *    generateObject mod sektionens egen Zod-schema).
 * Begge stier ender som validerede props der publiceres gennem pages.set_layout.
 */
export async function generateSectionAction(
  key: string,
  prompt: string,
): Promise<
  | { ok: true; props: Record<string, unknown> }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!isSectionKey(key)) return { ok: false, error: "Unknown section type" };
  if (prompt.trim().length < 3) {
    return { ok: false, error: "Describe what the section should contain (min. 3 characters)" };
  }

  // v0-broen: fri-form HTML-sektion genereret af Vercel v0.
  if (key === "vibe") {
    const brand = await getBrand();
    if (!brand.features.v0Generator) {
      return {
        ok: false,
        error:
          "v0 generation is not enabled. Turn on 'v0 UI generation' in /admin/features.",
      };
    }
    const system = `You are an expert frontend developer building ONE self-contained section for ${brand.storeName}.
Output ONLY raw HTML with Tailwind CSS classes — no React, no <html>/<body>, no markdown fences.
Use class= (not className=). Ensure every tag is closed. Return only the section markup.`;
    try {
      const result = await generateV0Section({ message: prompt, system });
      // Strict allowlist sanitizer at the INGEST boundary (the render-time
      // VibeSection still re-sanitizes via the regex as a last-defense).
      const html = sanitizeUserHtml(extractHtmlFromV0Files(result.files));
      if (!html) {
        return {
          ok: false,
          error: "v0 returned no usable HTML. Try a more specific prompt.",
        };
      }
      return { ok: true, props: { html } };
    } catch (err) {
      if (
        err instanceof V0QuotaExceeded ||
        err instanceof V0RateLimit ||
        err instanceof V0ApiError
      ) {
        return { ok: false, error: err.message };
      }
      return {
        ok: false,
        error:
          err instanceof Error ? `v0 generation failed: ${err.message}` : "v0 generation failed",
      };
    }
  }

  try {
    const props = await generateSectionProps(key as SectionKey, prompt);
    return { ok: true, props };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? `AI generation failed: ${err.message}` : "AI generation failed",
    };
  }
}

/**
 * Magic Builder — STEP 1: planlæg siden. Returnerer en ordnet plan af
 * whitelisted section-nodes (key + source + prompt) UDEN at generere eller
 * skrive noget. Gated bag magicBuilder.
 *
 * NB (Mixer 2.0 Fase 3): admin-UI'et bruger nu den STREAMENDE rute
 * `/api/admin/magic/stream` (instant preset-sti + plan + parallelle sektioner
 * over SSE). Disse to actions bevares som den ikke-streamende sti (samme
 * kontrakt som magic.plan_page/magic.generate_page-tools).
 */
export async function magicPlanAction(
  intent: string,
): Promise<
  | { ok: true; plan: PagePlanNode[] }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const brand = await getBrand();
  if (!brand.features.magicBuilder) {
    return {
      ok: false,
      error: "Magic Builder is not enabled. Turn on 'Magic Builder' (requires redeploy).",
    };
  }
  if (intent.trim().length < 8) {
    return { ok: false, error: "Describe the page in a bit more detail (min. 8 characters)." };
  }
  try {
    const plan = await planPage(intent);
    return { ok: true, plan: plan.sections };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? `Planning failed: ${err.message}` : "Planning failed",
    };
  }
}

/**
 * Magic Builder — STEP 2: generér ÉN node via dens source-adapter. Klienten
 * kalder denne pr. plan-node, så hver sektion popper live ind i preview når den
 * er klar (fail-soft: en fejlende node rapporteres, de øvrige fortsætter).
 * Skriver INTET — review + publish går gennem publishPageLayout som altid.
 */
export async function magicGenerateNodeAction(node: {
  key: string;
  source: MagicSource;
  prompt: string;
}): Promise<
  | { ok: true; section: GeneratedSection }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const brand = await getBrand();
  if (!brand.features.magicBuilder) {
    return { ok: false, error: "Magic Builder is not enabled." };
  }
  if (!isSectionKey(node.key)) {
    return { ok: false, error: `Unknown section type: ${node.key}` };
  }
  const adapter = SOURCE_ADAPTERS[node.source];
  if (!adapter) {
    return { ok: false, error: `Unknown source: ${node.source}` };
  }
  try {
    const section = await adapter(node.key as SectionKey, node.prompt);
    return { ok: true, section };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Generation failed",
    };
  }
}
