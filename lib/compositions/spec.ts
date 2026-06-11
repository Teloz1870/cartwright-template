/**
 * cartwright-composition-v1 — the composed-look artifact (Mixer 2.0 Phase 2).
 *
 * A composition captures EVERYTHING the Mixer composes — Skin (design slug),
 * palette, Voice (identity anchors + pre-written genome copy), chrome parts
 * (header/footer), 3D scene and an optional homepage section-tree — as ONE
 * downloadable/uploadable JSON file, installable on any shop in one atomic
 * action (`applyComposition`, lib/compositions/apply.ts).
 *
 * Sibling of lib/designs/spec.ts (cartwright-design-v1): same philosophy —
 * a Zod schema with a `schema` literal version string, validated wholesale on
 * import with readable error messages. Where design-v1 describes a CODE
 * scaffold (a DesignPack), composition-v1 describes pure GOVERNED DATA: every
 * field maps onto an existing, validated runtime blob (BrandingSettings
 * designSlug/themeJson/chromeJson/threeDConfigJson/genomeJson +
 * Page.layoutJson), so applying one never writes code.
 *
 * CLIENT-SAFE: no `server-only` imports — referential validation runs against
 * the client-safe registries only (designs/options, chrome-catalog, genome
 * fields, scene registry, section schema). Identity-anchor ENUM strictness
 * (tone/audience/formality) lives server-side in applyComposition via
 * validateIdentity (lib/genome/identity.ts is server-only); the spec checks
 * shape + length here.
 */
import { z } from "zod";
import { DESIGN_OPTIONS } from "@/designs/options";
import {
  getChromeMeta,
  isChromeSelectable,
  type ChromeKind,
} from "@/lib/builder/chrome-catalog";
import { GENOME_FIELDS, isGenomeFieldKey } from "@/lib/genome/fields";
import { isSceneId } from "@/lib/three/scenes/registry";
import { pageLayoutSchema } from "@/lib/builder/section-schema";

export const COMPOSITION_SCHEMA_ID = "cartwright-composition-v1" as const;

// ── Building blocks ─────────────────────────────────────────────────────────

/** #rgb / #rrggbb — mirror of lib/theme.ts HEX_RE (server-only, so inlined). */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hexColor = z
  .string()
  .regex(HEX_RE, { message: "must be a hex color (#rgb or #rrggbb)" });

/** The 6-token brand palette — same shape as ThemePalette / themeJson. */
const paletteSchema = z.object({
  accent: hexColor,
  accentDeep: hexColor,
  cream: hexColor,
  sand: hexColor,
  ink: hexColor,
  muted: hexColor,
});

/**
 * Identity anchors (Partial<Record<GenomeAnchorKey, string>>). Shape/length
 * here; the strict enum check (IDENTITY_OPTIONS) is enforced server-side in
 * applyComposition before any write.
 */
const identitySchema = z
  .object({
    tone: z.string().min(1).max(40).optional(),
    audience: z.string().min(1).max(40).optional(),
    formality: z.string().min(1).max(40).optional(),
    vibe: z.string().min(2).max(40).optional(),
  })
  .strict();

const voiceSchema = z
  .object({
    identity: identitySchema.optional(),
    /** Pre-written genome copy — keys validated against the GENOME_FIELDS allowlist below. */
    genomeOverrides: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const chromeSchema = z
  .object({
    /** Header chrome-registry key, e.g. "fable-header" or "minimal-header". */
    headerKey: z.string().min(1).optional(),
    /** Footer chrome-registry key, e.g. "mega-footer". */
    footerKey: z.string().min(1).optional(),
  })
  .strict();

// ── Top-level composition schema ────────────────────────────────────────────

export const CompositionSchema = z
  .object({
    schema: z.literal(COMPOSITION_SCHEMA_ID),
    name: z.string().min(1).max(80),
    description: z.string().max(280).optional(),
    /** The Skin — a design slug from the registry (designs/options.ts). */
    skin: z.string().min(1).max(50),
    /** Brand palette → BrandingSettings.themeJson (omitted = keep/design default). */
    palette: paletteSchema.optional(),
    /** The Voice — identity anchors + pre-written genome copy → genomeJson. */
    voice: voiceSchema.optional(),
    /** Selected chrome parts → BrandingSettings.chromeJson. */
    chrome: chromeSchema.optional(),
    /** Live Canvas 3D scene id → BrandingSettings.threeDConfigJson.scene. */
    scene: z.string().optional(),
    /** Homepage section-tree (Visual Builder vocabulary) → Page.layoutJson. */
    homepageLayout: pageLayoutSchema.optional(),
  })
  .superRefine((comp, ctx) => {
    // Skin must be an installed/registered design.
    if (!DESIGN_OPTIONS.some((d) => d.slug === comp.skin)) {
      ctx.addIssue({
        code: "custom",
        path: ["skin"],
        message: `Unknown design slug "${comp.skin}" — not in the design registry. Install it first (npx cartwright design install <slug>).`,
      });
    }

    // Chrome keys must exist in the catalogue, match their slot's kind, and be
    // selectable on the composition's skin (two-sided mixability — same rule
    // as chrome.set / parseChromeConfig).
    const checkChrome = (key: string | undefined, kind: ChromeKind) => {
      if (!key) return;
      const meta = getChromeMeta(key);
      if (!meta || meta.kind !== kind) {
        ctx.addIssue({
          code: "custom",
          path: ["chrome", `${kind}Key`],
          message: `"${key}" is not a registered ${kind} chrome key.`,
        });
        return;
      }
      if (!isChromeSelectable(meta, comp.skin)) {
        ctx.addIssue({
          code: "custom",
          path: ["chrome", `${kind}Key`],
          message: `"${key}" is a locked-theme chrome that only renders on the "${meta.designSlug}" design — not selectable with skin "${comp.skin}".`,
        });
      }
    };
    checkChrome(comp.chrome?.headerKey, "header");
    checkChrome(comp.chrome?.footerKey, "footer");

    // Genome overrides: allowlisted keys + each value must satisfy that
    // field's own schema (mirror of applyVertical's preset validation).
    for (const [key, value] of Object.entries(comp.voice?.genomeOverrides ?? {})) {
      if (!isGenomeFieldKey(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["voice", "genomeOverrides", key],
          message: `Unknown genome field "${key}" — not in the GENOME_FIELDS allowlist.`,
        });
        continue;
      }
      const parsed = GENOME_FIELDS[key].schema.safeParse(value);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["voice", "genomeOverrides", key],
          message: `Invalid value for genome field "${key}": ${parsed.error.issues[0]?.message ?? "validation failed"}`,
        });
      }
    }

    // Scene must be a registered Live Canvas scene id.
    if (comp.scene !== undefined && !isSceneId(comp.scene)) {
      ctx.addIssue({
        code: "custom",
        path: ["scene"],
        message: `Unknown 3D scene "${comp.scene}" — not in the scene registry.`,
      });
    }
  });

export type Composition = z.infer<typeof CompositionSchema>;

// ── Parse helper ────────────────────────────────────────────────────────────

export type ParseCompositionResult =
  | { ok: true; composition: Composition }
  | { ok: false; error: string };

/**
 * Parse a raw composition JSON string → validated Composition. Readable,
 * path-prefixed error messages (the import dry-run preview surfaces them
 * verbatim — mirror of parseDesignMd's contract).
 */
export function parseComposition(raw: string): ParseCompositionResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  const parsed = CompositionSchema.safeParse(json);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return {
      ok: false,
      error: `Not a valid ${COMPOSITION_SCHEMA_ID} file:\n${lines.join("\n")}`,
    };
  }
  return { ok: true, composition: parsed.data };
}
