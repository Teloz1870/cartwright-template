import "server-only";

import { sovereignStoreName } from "@/lib/identity";
import { prisma } from "@/lib/db";
import { resolveStoreIdentity } from "@/lib/brand";
import { parseThemeJson } from "@/lib/theme";
import { parseChromeConfig } from "@/lib/builder/chrome-catalog";
import { parseThreeDConfig } from "@/lib/three/resolve";
import { parseGenome } from "@/lib/genome/store";
import { GENOME_FIELDS, isGenomeFieldKey } from "@/lib/genome/fields";
import { parsePageLayout } from "@/lib/builder/section-schema";
import {
  COMPOSITION_SCHEMA_ID,
  CompositionSchema,
  type Composition,
} from "./spec";

/**
 * Export the CURRENT shop state as a cartwright-composition-v1 artifact — the
 * read-only inverse of applyComposition. Every part is read through the same
 * fail-soft parser the render path uses (parseThemeJson, parseChromeConfig,
 * parseGenome, parseThreeDConfig, parsePageLayout), so the exported file only
 * ever carries VALID state:
 *
 *  - skin: the resolved active design (resolveStoreIdentity — same resolution
 *    as the storefront, so an inferred design exports as its concrete slug
 *    and the artifact reproduces the look on any other shop).
 *  - palette/chrome/scene/voice/homepageLayout: included ONLY when the shop
 *    actually overrides them (null DB blobs are omitted, so applying the
 *    export elsewhere asserts exactly what this shop asserts — no more).
 *
 * The result is validated against CompositionSchema before returning, so an
 * export can never produce a file its own import would reject (round-trip
 * guarantee).
 */

export type ExportCompositionOpts = {
  /** Page slug to read the homepage layout from. Default "home". */
  homepageSlug?: string;
};

export async function exportComposition(
  opts: ExportCompositionOpts = {},
): Promise<Composition> {
  const homepageSlug = opts.homepageSlug?.trim() || "home";

  const settings = await prisma.brandingSettings
    .findFirst({
      select: {
        storeName: true,
        designSlug: true,
        industryTemplate: true,
        ecommerceEnabled: true,
        themeJson: true,
        chromeJson: true,
        threeDConfigJson: true,
        genomeJson: true,
      },
    })
    .catch(() => null);

  // Resolved skin — identical resolution to the storefront render path.
  const { designSlug: skin } = resolveStoreIdentity(settings);

  // Palette: only when the shop overrides themeJson (otherwise the skin's own
  // tokens carry the look). Extended fonts/radius are dropped — the spec's
  // palette is the 6-token brand palette, same as a Voice's.
  const theme = parseThemeJson(settings?.themeJson);
  const palette = theme
    ? {
        accent: theme.accent,
        accentDeep: theme.accentDeep,
        cream: theme.cream,
        sand: theme.sand,
        ink: theme.ink,
        muted: theme.muted,
      }
    : undefined;

  // Chrome: validated against the resolved skin (a stale locked key is
  // dropped by parseChromeConfig — fail-soft, like the layout resolution).
  const chrome = parseChromeConfig(settings?.chromeJson, skin) ?? undefined;

  // Scene: only when the shop explicitly overrides the 3D config.
  const scene = parseThreeDConfig(settings?.threeDConfigJson)?.scene;

  // Voice: identity anchors + genome overrides. Overrides are filtered
  // through the allowlist + per-field schema so the export always re-imports
  // (an orphaned key from a removed field is silently dropped).
  const genome = parseGenome(settings?.genomeJson);
  const identity = genome.identity && Object.keys(genome.identity).length
    ? genome.identity
    : undefined;
  const genomeOverrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(genome.overrides ?? {})) {
    if (isGenomeFieldKey(key) && GENOME_FIELDS[key].schema.safeParse(value).success) {
      genomeOverrides[key] = value;
    }
  }
  const voice =
    identity || Object.keys(genomeOverrides).length
      ? {
          ...(identity ? { identity } : {}),
          ...(Object.keys(genomeOverrides).length ? { genomeOverrides } : {}),
        }
      : undefined;

  // Homepage section-tree: only when the homepage Page carries a VALID
  // Visual Builder layout.
  const page = await prisma.page
    .findUnique({ where: { slug: homepageSlug }, select: { layoutJson: true } })
    .catch(() => null);
  const homepageLayout = parsePageLayout(page?.layoutJson) ?? undefined;

  // Through the sovereign resolver — an exported look carries the shop's name
  // into another install, so a contaminated row would travel with it.
  const storeName = sovereignStoreName(settings?.storeName);
  const candidate = {
    schema: COMPOSITION_SCHEMA_ID,
    name: `${storeName} look`.slice(0, 80),
    description: `Exported composition from ${storeName} (skin: ${skin}).`.slice(0, 280),
    skin,
    ...(palette ? { palette } : {}),
    ...(voice ? { voice } : {}),
    ...(chrome ? { chrome } : {}),
    ...(scene ? { scene } : {}),
    ...(homepageLayout ? { homepageLayout } : {}),
  };

  // Round-trip guarantee: an export must always pass its own import schema.
  const parsed = CompositionSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `Export produced an invalid composition (${first?.path.join(".")}: ${first?.message}). ` +
        "This indicates registry drift — re-run after `pnpm db:push` / a clean install.",
    );
  }
  return parsed.data;
}
