import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { withAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getActiveDesign, invalidateThemeCache } from "@/lib/theme";
import { applyVertical } from "@/lib/verticals/apply";
import { getVertical } from "@/verticals";
import { DESIGN_OPTIONS } from "@/designs/options";
import { getChromeMeta, explainChromeRejection } from "@/lib/builder/chrome-catalog";
import { CompositionSchema } from "@/lib/compositions/spec";
import { applyComposition } from "@/lib/compositions/apply";
import { exportComposition } from "@/lib/compositions/export";
import { brand } from "@/brand.config";
import { brandingCreateDefaults } from "@/lib/branding-defaults";
import { SCENE_IDS } from "@/lib/three/scenes/registry";

const identityKeyOutput = z.enum(["tone", "audience", "formality", "vibe"]);
const sceneOutput = z.enum(SCENE_IDS as [string, ...string[]]);

const appliedVerticalOutput = z
  .object({
    ok: z.literal(true),
    slug: z.string(),
    appliedSkin: z.string().nullable(),
    skinSkipped: z.string().nullable(),
    appliedPalette: z.boolean(),
    appliedScene: sceneOutput.nullable(),
    fields: z.number().int().nonnegative(),
    identityKeys: z.array(identityKeyOutput),
  })
  .strict();

const setDesignSlugOutput = z
  .object({ designSlug: z.string().nullable() })
  .strict();

const composedLookOutput = z
  .object({
    appliedVertical: z.string().nullable(),
    appliedDesign: z.string().nullable(),
    voiceDetail: appliedVerticalOutput.nullable(),
    previewUrl: z.string(),
  })
  .strict();

const chromeOutput = z
  .object({
    headerKey: z.string().nullable(),
    footerKey: z.string().nullable(),
    previewUrl: z.string(),
  })
  .strict();

const appliedChromeOutput = z
  .object({
    headerKey: z.string().optional(),
    footerKey: z.string().optional(),
  })
  .strict();

const appliedCompositionOutput = z
  .object({
    ok: z.literal(true),
    name: z.string(),
    appliedSkin: z.string(),
    appliedPalette: z.boolean(),
    appliedChrome: appliedChromeOutput.nullable(),
    appliedScene: sceneOutput.nullable(),
    fields: z.number().int().nonnegative(),
    identityKeys: z.array(identityKeyOutput),
    appliedHomepage: z.string().nullable(),
    skipped: z.array(z.literal("homepageLayout")),
    previewUrl: z.string(),
  })
  .strict();

const exportedCompositionOutput = CompositionSchema.strict().describe(
  "Portable composition. homepageLayout section props are polymorphic and validated against each section key's registry schema.",
);

/**
 * Compose tools — let a BUILD agent (the admin AI chat or an MCP client with
 * the right scopes) assemble a complete on-brand "look" from a prompt: a Skin
 * (design) × a Voice (vertical). These wrap the existing, audited business
 * logic (`applyVertical`, the design-slug write) and add nothing but Zod +
 * confirm + scope on top — same contract as every other tool.
 *
 * NOT exposed to the shopper storefront assistant (CUSTOMER_TOOL_ALLOWLIST is
 * untouched): composing a site look is an owner/build task, never a shopper one.
 *
 * Speed: applying a Voice uses its PRE-WRITTEN genome overrides (no LLM), so a
 * "compose from a vertical" is instant and on-brand — the fast path. The slower
 * per-section generator stays in magic.generate_page + pages.set_layout.
 */

/** Build the (gated) mixer-preview URL for a Skin × Voice composition. */
function previewUrl(design: string | null, vertical: string | null): string {
  const params = new URLSearchParams();
  if (design) params.set("design", design);
  if (vertical) params.set("vertical", vertical);
  const qs = params.toString();
  return `/${brand.defaultLocale}/mixer-preview${qs ? `?${qs}` : ""}`;
}

/** Validate + write BrandingSettings.designSlug, audited + theme-cache busted. */
async function setActiveDesign(
  designSlug: string,
  ctx: { actor: Parameters<typeof withAudit>[0]["actor"]; requestId?: string; ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const slug = designSlug.trim() || null;
  if (slug && !DESIGN_OPTIONS.some((d) => d.slug === slug)) {
    throw new Error(
      `Design "${slug}" is not in the registry. Install it first (npx cartwright design install <slug>) or pick a known slug.`,
    );
  }
  await withAudit(
    {
      actor: ctx.actor,
      tool: "design.set_slug",
      args: { designSlug: slug },
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      before: async () => {
        const r = await prisma.brandingSettings.findUnique({
          where: { id: 1 },
          select: { designSlug: true },
        });
        return r?.designSlug ?? null;
      },
    },
    async () => {
      await prisma.brandingSettings.upsert({
        where: { id: 1 },
        update: { designSlug: slug },
        create: { ...brandingCreateDefaults(), designSlug: slug },
      });
    },
  );
  invalidateThemeCache();
}

export const applyVerticalTool = defineTool({
  name: "vertical.apply",
  description:
    "Apply a Vertical / Voice preset to the shop: merges the preset's identity anchors + pre-written, on-voice genome copy (the page re-tones immediately — no LLM), and optionally its suggested Skin + palette + 3D scene when applySkin is true. Requires confirm: true. Revertible via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    slug: z.string().min(1).describe("Vertical/Voice slug, e.g. 'cafe' or 'kindergarten'"),
    applySkin: z
      .boolean()
      .optional()
      .describe("Also set the preset's suggested design + palette + 3D scene (default false)"),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  output: appliedVerticalOutput,
  examples: [
    { name: "Apply the café voice + its skin", body: { slug: "cafe", applySkin: true, confirm: true } },
  ],
  handler: async (args, ctx) => {
    const r = await applyVertical(args.slug, { applySkin: args.applySkin ?? false }, ctx.actor);
    if (!r.ok) throw new Error(r.error);
    return r;
  },
});

export const setDesignSlugTool = defineTool({
  name: "design.set_slug",
  description:
    "Set the shop's active design (Skin) by slug — writes BrandingSettings.designSlug and busts the theme cache. Pass an empty string to reset to 'Auto' (inferred). Requires confirm: true. Revertible via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    designSlug: z.string().describe("A design slug from the registry, e.g. 'apex' or 'aurora-shop'; empty = Auto"),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  output: setDesignSlugOutput,
  examples: [{ name: "Switch to Apex", body: { designSlug: "apex", confirm: true } }],
  handler: async (args, ctx) => {
    await setActiveDesign(args.designSlug, ctx);
    return { designSlug: args.designSlug.trim() || null };
  },
});

export const composeLookTool = defineTool({
  name: "magic.compose_look",
  description:
    "Compose a complete on-brand look in one step: pick a Skin (design) and/or a Voice (vertical) and apply them together. Applying a Voice uses its pre-written on-brand copy + palette + 3D scene — instant, no LLM — so this is the fast way to dress the whole homepage for an industry. Returns a mixer-preview URL to see the result. To then build a bespoke page from a prompt, use magic.generate_page + pages.set_layout. Requires confirm: true. Revertible via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z
    .object({
      vertical: z.string().optional().describe("Voice/vertical slug, e.g. 'cafe'"),
      design: z.string().optional().describe("Skin/design slug, e.g. 'apex' — overrides the Voice's suggested skin"),
      applySkin: z
        .boolean()
        .optional()
        .describe("When only a Voice is given, also apply its suggested skin + palette + scene (default true)"),
      confirm: z.literal(true, { error: "Requires confirm: true" }),
    })
    .refine((v) => Boolean(v.vertical) || Boolean(v.design), {
      message: "Provide at least one of: vertical, design.",
    }),
  output: composedLookOutput,
  examples: [
    { name: "Dress the shop as a café", body: { vertical: "cafe", confirm: true } },
    { name: "Café voice on the Apex flagship", body: { vertical: "cafe", design: "apex", confirm: true } },
  ],
  handler: async (args, ctx) => {
    let appliedVertical: Awaited<ReturnType<typeof applyVertical>> | null = null;
    let appliedDesign: string | null = null;

    if (args.vertical) {
      // If an explicit design is also given, we set it separately below, so the
      // Voice should NOT also apply its own suggested skin (avoid a tug-of-war).
      const applySkin = args.design ? false : args.applySkin ?? true;
      appliedVertical = await applyVertical(args.vertical, { applySkin }, ctx.actor);
      if (!appliedVertical.ok) throw new Error(appliedVertical.error);
    }

    if (args.design) {
      await setActiveDesign(args.design, ctx);
      appliedDesign = args.design.trim() || null;
    }

    // Resolve the design used for the preview: explicit design → the Voice's
    // suggested skin (if applied) → none (preview falls back to its default).
    const previewDesign =
      appliedDesign ??
      (args.vertical ? getVertical(args.vertical)?.suggestedDesignSlug ?? null : null);

    return {
      appliedVertical: appliedVertical?.ok ? appliedVertical.slug : null,
      appliedDesign,
      voiceDetail: appliedVertical?.ok ? appliedVertical : null,
      previewUrl: previewUrl(previewDesign, args.vertical ?? null),
    };
  },
});

export const setChromeTool = defineTool({
  name: "chrome.set",
  description:
    "Select the shop's header and/or footer chrome parts (Mixer 2.0): writes BrandingSettings.chromeJson with validated chrome-registry keys (e.g. 'fable-header', 'mega-footer'). Mixable (cw-* palette-adaptive) chromes work on any design; a locked-theme design chrome only on its own design. Pass an empty string (or omit both) to reset to the active design's default chrome. Requires confirm: true. Revertible via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    headerKey: z
      .string()
      .optional()
      .describe("Header chrome key from the registry, e.g. 'minimal-header'; empty/omitted = design default"),
    footerKey: z
      .string()
      .optional()
      .describe("Footer chrome key from the registry, e.g. 'mega-footer'; empty/omitted = design default"),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  output: chromeOutput,
  examples: [
    {
      name: "Fable header + mega footer",
      body: { headerKey: "fable-header", footerKey: "mega-footer", confirm: true },
    },
    { name: "Reset to the design's own chrome", body: { confirm: true } },
  ],
  handler: async (args, ctx) => {
    const headerKey = args.headerKey?.trim() || null;
    const footerKey = args.footerKey?.trim() || null;

    // Validate against the catalogue + the ACTIVE design's mixability before
    // writing, so the agent gets a real error instead of a silently dropped
    // key (parseChromeConfig stays fail-soft on the render path).
    const activeDesign = await getActiveDesign();
    const activeSlug = activeDesign?.slug ?? null;
    const check = (key: string | null, kind: "header" | "footer") => {
      if (!key) return;
      const meta = getChromeMeta(key);
      if (!meta || meta.kind !== kind) {
        throw new Error(
          `"${key}" is not a registered ${kind} chrome. Pick a key from the chrome registry (lib/builder/chrome-catalog.ts).`,
        );
      }
      const rejection = explainChromeRejection(meta, activeSlug, {
        targetMixable: activeDesign?.mixable,
      });
      if (rejection) throw new Error(rejection.message);
    };
    check(headerKey, "header");
    check(footerKey, "footer");

    const chromeJson =
      headerKey || footerKey
        ? JSON.stringify({
            ...(headerKey ? { headerKey } : {}),
            ...(footerKey ? { footerKey } : {}),
          })
        : null;

    await withAudit(
      {
        actor: ctx.actor,
        tool: "chrome.set",
        args: { headerKey, footerKey },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: async () => {
          const r = await prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: { chromeJson: true },
          });
          return r?.chromeJson ?? null;
        },
      },
      async () => {
        await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: { chromeJson },
          create: { ...brandingCreateDefaults(), chromeJson },
        });
      },
    );
    invalidateThemeCache();
    return { headerKey, footerKey, previewUrl: previewUrl(activeSlug, null) };
  },
});

export const applyCompositionTool = defineTool({
  name: "composition.apply",
  description:
    "Install a cartwright-composition-v1 artifact (a complete downloadable look: skin + palette + voice + chrome + 3D scene + optional homepage layout) on this shop in ONE atomic, audited operation. Validates the whole composition up front (registry references, genome allowlist, chrome mixability vs the skin) and rejects it wholesale on any error. Omitted optional parts leave the corresponding shop state untouched. Requires confirm: true. Revertible (best-effort) via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    composition: CompositionSchema.describe(
      "The parsed cartwright-composition-v1 JSON object (schema: 'cartwright-composition-v1')",
    ),
    homepageSlug: z
      .string()
      .optional()
      .describe("Page slug the homepageLayout is written to (default 'home')"),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  output: appliedCompositionOutput,
  examples: [
    {
      name: "Install a minimal composition (skin only)",
      body: {
        composition: {
          schema: "cartwright-composition-v1",
          name: "Apex look",
          skin: "apex",
        },
        confirm: true,
      },
    },
  ],
  handler: async (args, ctx) => {
    const r = await applyComposition(
      args.composition,
      { homepageSlug: args.homepageSlug },
      ctx.actor,
    );
    if (!r.ok) throw new Error(r.error);
    return { ...r, previewUrl: previewUrl(r.appliedSkin, null) };
  },
});

export const exportCompositionTool = defineTool({
  name: "composition.export",
  description:
    "Export the CURRENT shop state (resolved skin, palette/chrome/scene/voice/homepage-layout overrides) as a cartwright-composition-v1 JSON artifact — the read-only inverse of composition.apply. The result can be saved as a file and installed on any other shop via composition.apply or /api/admin/compositions/import.",
  scope: "settings:read",
  skipAudit: true,
  input: z.object({
    homepageSlug: z
      .string()
      .optional()
      .describe("Page slug to read the homepage layout from (default 'home')"),
  }),
  output: exportedCompositionOutput,
  examples: [{ name: "Export the current look", body: {} }],
  handler: async (args) => {
    return exportComposition({ homepageSlug: args.homepageSlug });
  },
});

export const composeTools = [
  applyVerticalTool,
  setDesignSlugTool,
  composeLookTool,
  setChromeTool,
  applyCompositionTool,
  exportCompositionTool,
];
