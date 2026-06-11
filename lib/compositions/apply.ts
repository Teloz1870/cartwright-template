import "server-only";

import { withAudit, type AuditActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { mutateGenome, readGenomeJson } from "@/lib/genome/store";
import { validateIdentity } from "@/lib/genome/identity";
import { invalidateThemeCache } from "@/lib/theme";
import { invalidateThreeDCache, parseThreeDConfig } from "@/lib/three/resolve";
import { CompositionSchema, type Composition } from "./spec";
import type { GenomeAnchorKey } from "@/lib/genome/types";

/**
 * Apply a cartwright-composition-v1 artifact to the shop — ONE audited atomic
 * operation (follows applyVertical's structure, lib/verticals/apply.ts):
 *
 *   1. Validate the whole composition up front (Zod spec incl. referential
 *      checks + the strict server-side identity-enum check), so a malformed
 *      artifact is rejected wholesale rather than half-applied.
 *   2. Inside a single withAudit("composition.apply") with a full before-
 *      snapshot (branding blobs + genomeJson + homepage layoutJson — drives
 *      the best-effort audit.revert):
 *        - BrandingSettings upsert: designSlug + themeJson + chromeJson +
 *          threeDConfigJson (scene merged over the existing 3D config) in one
 *          write.
 *        - mutateGenome: merge voice.identity + voice.genomeOverrides.
 *        - Optional Page.layoutJson upsert for the homepage slug (fail-soft:
 *          a failure here is recorded as skipped, never aborts the look).
 *   3. Cache invalidations (theme + 3D; mutateGenome busts its own cache).
 *
 * Idempotent: re-applying the same composition yields the same DB state.
 * Omitted optional parts (palette/voice/chrome/scene/homepageLayout) leave the
 * corresponding shop state UNTOUCHED — a composition only asserts what it
 * carries (same merge semantics as applyVertical).
 */

export type ApplyCompositionOpts = {
  /** Page slug the homepageLayout is upserted to. Default "home". */
  homepageSlug?: string;
};

export type ApplyCompositionResult =
  | {
      ok: true;
      name: string;
      appliedSkin: string;
      appliedPalette: boolean;
      appliedChrome: { headerKey?: string; footerKey?: string } | null;
      appliedScene: string | null;
      /** Number of genome copy fields merged. */
      fields: number;
      identityKeys: string[];
      /** Page slug the homepage layout was written to, null when none. */
      appliedHomepage: string | null;
      /** Optional parts that failed fail-soft (e.g. "homepageLayout"). */
      skipped: string[];
    }
  | { ok: false; error: string };

export async function applyComposition(
  input: unknown,
  opts: ApplyCompositionOpts,
  actor: AuditActor,
): Promise<ApplyCompositionResult> {
  // 1) Validate wholesale (spec = structural + referential: skin in registry,
  // chrome keys selectable vs skin, genome keys allowlisted + per-field schema,
  // scene registered, palette hex, layout against the section whitelist).
  const parsed = CompositionSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `Invalid composition: ${first ? `${first.path.join(".") || "(root)"}: ${first.message}` : "validation failed"}`,
    };
  }
  const comp: Composition = parsed.data;

  // Strict identity-anchor enums (tone/audience/formality; vibe free-form) —
  // server-side authority, exactly like applyVertical.
  const idEntries = Object.entries(comp.voice?.identity ?? {}).filter(
    ([, v]) => v !== undefined,
  ) as [GenomeAnchorKey, string][];
  for (const [k, v] of idEntries) {
    const err = validateIdentity(k, v);
    if (err) return { ok: false, error: `Composition identity.${k}: ${err}` };
  }

  const ovEntries = Object.entries(comp.voice?.genomeOverrides ?? {});
  const homepageSlug = opts.homepageSlug?.trim() || "home";
  const chrome =
    comp.chrome && (comp.chrome.headerKey || comp.chrome.footerKey)
      ? {
          ...(comp.chrome.headerKey ? { headerKey: comp.chrome.headerKey } : {}),
          ...(comp.chrome.footerKey ? { footerKey: comp.chrome.footerKey } : {}),
        }
      : null;
  const skipped: string[] = [];

  // 2) ONE audited atomic operation. The before-snapshot captures every blob
  // this tool can touch, so audit.revert can restore the previous look
  // (best-effort: a homepage Page CREATED by this apply is reverted to a
  // null layout, not deleted).
  try {
    await withAudit(
      {
        actor,
        tool: "composition.apply",
        args: {
          name: comp.name,
          skin: comp.skin,
          palette: Boolean(comp.palette),
          chrome,
          scene: comp.scene ?? null,
          voiceFields: ovEntries.length,
          identityKeys: idEntries.map(([k]) => k),
          homepageSlug: comp.homepageLayout ? homepageSlug : null,
        },
        before: async () => {
          const branding = await prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: {
              designSlug: true,
              themeJson: true,
              chromeJson: true,
              threeDConfigJson: true,
            },
          });
          const page = comp.homepageLayout
            ? await prisma.page.findUnique({
                where: { slug: homepageSlug },
                select: { layoutJson: true },
              })
            : null;
          return {
            branding: branding ?? null,
            genomeJson: await readGenomeJson(),
            page: comp.homepageLayout
              ? { slug: homepageSlug, layoutJson: page?.layoutJson ?? null }
              : null,
          };
        },
      },
      async () => {
        // 2a) BrandingSettings — designSlug + themeJson + chromeJson +
        // threeDConfigJson in ONE upsert. The scene merges over the existing
        // 3D config (fail-soft parse) so intensity/paletteSource survive.
        const update: {
          designSlug: string;
          themeJson?: string;
          chromeJson?: string;
          threeDConfigJson?: string;
        } = { designSlug: comp.skin };
        if (comp.palette) update.themeJson = JSON.stringify(comp.palette);
        if (chrome) update.chromeJson = JSON.stringify(chrome);
        if (comp.scene) {
          const row = await prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: { threeDConfigJson: true },
          });
          update.threeDConfigJson = JSON.stringify({
            ...(parseThreeDConfig(row?.threeDConfigJson) ?? {}),
            scene: comp.scene,
          });
        }
        await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update,
          create: {
            id: 1,
            storeName: "Cartwright",
            heroImage: "",
            announcement: "",
            ...update,
          },
        });

        // 2b) Voice — merge identity anchors + pre-written genome copy
        // (instant re-tone, no LLM — same merge as applyVertical).
        if (idEntries.length || ovEntries.length) {
          await mutateGenome((cur) => ({
            ...cur,
            ...(idEntries.length
              ? { identity: { ...(cur.identity ?? {}), ...Object.fromEntries(idEntries) } }
              : {}),
            ...(ovEntries.length
              ? { overrides: { ...(cur.overrides ?? {}), ...Object.fromEntries(ovEntries) } }
              : {}),
          }));
        }

        // 2c) Homepage section-tree → Page.layoutJson (fail-soft: optional
        // part — a DB shape that predates the Visual Builder column must not
        // abort the whole look).
        if (comp.homepageLayout) {
          try {
            const layoutJson = JSON.stringify(comp.homepageLayout);
            await prisma.page.upsert({
              where: { slug: homepageSlug },
              update: { layoutJson },
              create: {
                slug: homepageSlug,
                title: comp.name,
                body: "",
                showInNav: false,
                layoutJson,
              },
            });
          } catch {
            skipped.push("homepageLayout");
          }
        }
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not apply the composition.",
    };
  }

  // 3) Bust caches so the new look renders on the next request.
  invalidateThemeCache();
  if (comp.scene) invalidateThreeDCache();

  return {
    ok: true,
    name: comp.name,
    appliedSkin: comp.skin,
    appliedPalette: Boolean(comp.palette),
    appliedChrome: chrome,
    appliedScene: comp.scene ?? null,
    fields: ovEntries.length,
    identityKeys: idEntries.map(([k]) => k),
    appliedHomepage:
      comp.homepageLayout && !skipped.includes("homepageLayout") ? homepageSlug : null,
    skipped,
  };
}
