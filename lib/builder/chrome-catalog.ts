/**
 * Chrome registry — CLIENT-SAFE catalogue (Mixer 2.0 Phase 1).
 *
 * Headers and footers become SELECTABLE parts: a shop can pick any *mixable*
 * header × footer independent of its active design (Skin). This file is the
 * pure-data half of the registry — key/kind/label/designSlug/mixable — safe to
 * import from Client Components, the marketplace-manifest gen-script and the
 * admin picker. The React components live in the SERVER-only sibling,
 * `lib/builder/chrome-registry.tsx` (the design chromes import design CSS +
 * `next/font`, so they must never reach a client bundle through a data file).
 *
 * Mixability follows the exact same rule as MIXABLE_DESIGN_SLUGS
 * (designs/options.ts): a chrome is mixable across designs ONLY when all its
 * paint reads the palette-adaptive cw-* token chains (paletteToFullThemeCss
 * re-tones them to any shop palette). Locked-theme chromes (own CSS file + own
 * token prefix: halo, flux, drive, aerospace, engineered, nocturne, meridian,
 * editorial-ink, brutalist) only render correctly on their OWN design, so they
 * carry `mixable: false` and are only selectable when their design is active.
 *
 * The ACTIVE design's half of that rule is `resolveMixable` — the pack's own
 * `mixable` field (designs/types.ts) when it sets one, the built-in slug set
 * otherwise. This file stays client-safe, so it can't load packs itself: the
 * callers that already hold the active pack pass its field in (see
 * `isChromeSelectable`'s third parameter). Callers that only know a slug get
 * the slug-set answer, exactly as before.
 *
 * Keep in sync with designs/chrome-slugs.ts (CHROME_DESIGN_SLUGS) — the
 * chrome-registry unit test pins the two sets against each other.
 */

import { DESIGN_OPTIONS, resolveMixable } from "@/designs/options";

export type ChromeKind = "header" | "footer";

export type ChromeMeta = {
  /** Stable registry key, e.g. "fable-header" or "mega-footer". */
  key: string;
  /** Human label for pickers/galleries. */
  label: string;
  kind: ChromeKind;
  /**
   * Owning design slug for design chromes; undefined for the neutral,
   * design-agnostic chrome parts (components/chrome-parts/).
   */
  designSlug?: string;
  /**
   * True ⇒ selectable on ANY mixable design (cw-* palette-adaptive paint).
   * False ⇒ locked-theme chrome, only selectable on its own design.
   */
  mixable: boolean;
};

/** Design slugs whose chrome is cw-* palette-adaptive (⇒ mixable cross-design). */
const CW_CHROME_DESIGNS: ReadonlySet<string> = new Set([
  "studio",
  "apex",
  "jungle",
  "fable",
  "stillwater",
  "ember",
]);

/** The 16 designs that own a chrome.tsx, with display names for labels. */
const DESIGN_CHROMES: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: "studio", name: "Studio" },
  { slug: "apex", name: "Apex" },
  { slug: "jungle", name: "Jungle" },
  { slug: "fable", name: "Fable" },
  { slug: "stillwater", name: "Stillwater" },
  { slug: "ember", name: "Ember" },
  { slug: "halo", name: "Halo" },
  { slug: "flux", name: "Flux" },
  { slug: "drive", name: "Drive" },
  { slug: "aerospace", name: "Aerospace" },
  { slug: "engineered", name: "Engineered" },
  { slug: "nocturne", name: "Nocturne" },
  { slug: "meridian", name: "Meridian" },
  { slug: "editorial-ink", name: "Editorial Ink" },
  { slug: "brutalist", name: "Brutalist" },
  // Blank Canvas: bare token-free chrome, made to be rewritten — not mixable
  // (a cw-* Part wouldn't cohere with whatever the customer builds here).
  { slug: "blank", name: "Blank Canvas" },
];

/** Neutral, design-agnostic chrome parts (components/chrome-parts/). */
const NEUTRAL_CHROMES: ReadonlyArray<ChromeMeta> = [
  {
    key: "minimal-header",
    label: "Minimal header (mark + 3 links + CTA)",
    kind: "header",
    mixable: true,
  },
  {
    key: "centered-header",
    label: "Centered header (name above, centered nav)",
    kind: "header",
    mixable: true,
  },
  {
    key: "mega-footer",
    label: "Mega footer (4-column grid + newsletter)",
    kind: "footer",
    mixable: true,
  },
  {
    key: "slim-footer",
    label: "Slim footer (one line)",
    kind: "footer",
    mixable: true,
  },
];

/**
 * Only designs that are actually REGISTERED get catalogue entries. A scaffold
 * profile (create-cartwright light) prunes design packs by codemodding
 * designs/{index,options}.ts — the catalogue must follow that single source of
 * truth, never advertise chrome whose pack is gone (the registry would have no
 * component for it, and pickers would offer ghosts).
 */
const REGISTERED_DESIGN_SLUGS: ReadonlySet<string> = new Set(DESIGN_OPTIONS.map((d) => d.slug));

export const CHROME_CATALOG: ReadonlyArray<ChromeMeta> = [
  ...DESIGN_CHROMES.filter(({ slug }) => REGISTERED_DESIGN_SLUGS.has(slug)).flatMap(({
    slug,
    name,
  }): ChromeMeta[] => [
    {
      key: `${slug}-header`,
      label: `${name} header`,
      kind: "header",
      designSlug: slug,
      mixable: CW_CHROME_DESIGNS.has(slug),
    },
    {
      key: `${slug}-footer`,
      label: `${name} footer`,
      kind: "footer",
      designSlug: slug,
      mixable: CW_CHROME_DESIGNS.has(slug),
    },
  ]),
  ...NEUTRAL_CHROMES,
];

const CATALOG_INDEX: ReadonlyMap<string, ChromeMeta> = new Map(
  CHROME_CATALOG.map((m) => [m.key, m]),
);

export function getChromeMeta(key: string): ChromeMeta | undefined {
  return CATALOG_INDEX.get(key);
}

/**
 * Is this chrome selectable on the shop whose active design is
 * `activeDesignSlug`? Two-sided mixability (same rationale as the Parts
 * contract in designs/options.ts):
 *
 *  - A design's OWN chrome is always selectable on that design.
 *  - A mixable (cw-*) chrome is selectable only when the ACTIVE design is
 *    itself mixable (cw-coherent — its tokens track the palette). On a
 *    locked-theme design (nocturne, halo, …) a cw-* part would render in the
 *    DEFAULT cw palette — visually off — so it is not offered/honoured there.
 *  - A locked-theme chrome is never selectable on a foreign design.
 *
 * `activeDesignMixable` is the ACTIVE pack's own `mixable` field, for callers
 * that have the pack loaded. It exists because the built-in slug set can only
 * ever answer for built-in slugs: a pack a customer writes (the Blank Canvas /
 * premium-design path) is not in that set, so declaring `mixable: true` on the
 * pack used to buy it nothing here and every neutral Part was refused on it.
 * (The other route — adding the slug to MIXABLE_DESIGN_SLUGS, which is what
 * designs/blank/index.ts suggests — always worked; this makes the pack-local
 * route work too. A pack that arrives through `cartwright-design-v1` still
 * cannot declare it: neither lib/designs/spec.ts nor lib/designs/codegen.ts
 * carries the field, so it has to be hand-added.) Omit the argument and the
 * answer is the slug set's, byte-for-byte as before.
 */
export function isChromeSelectable(
  meta: ChromeMeta,
  activeDesignSlug: string | null | undefined,
  activeDesignMixable?: boolean,
): boolean {
  if (meta.designSlug != null && meta.designSlug === activeDesignSlug) return true;
  if (!meta.mixable) return false;
  return activeDesignSlug != null && resolveMixable(activeDesignSlug, activeDesignMixable);
}

export type ChromeConfig = {
  headerKey?: string;
  footerKey?: string;
};

/**
 * Parse BrandingSettings.chromeJson — FAIL-SOFT, like every other cosmetic
 * runtime blob (parseThemeJson pattern): junk JSON, unknown keys, kind
 * mismatches and non-selectable keys (a locked chrome persisted for a design
 * that is no longer active) are silently dropped. Returns null when nothing
 * valid remains, so the layout renders byte-identical to an unset config.
 */
export function parseChromeConfig(
  raw: string | null | undefined,
  activeDesignSlug: string | null | undefined,
  activeDesignMixable?: boolean,
): ChromeConfig | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const { headerKey, footerKey } = obj as Record<string, unknown>;

  const valid = (value: unknown, kind: ChromeKind): string | undefined => {
    if (typeof value !== "string" || value.length === 0) return undefined;
    const meta = CATALOG_INDEX.get(value);
    if (!meta || meta.kind !== kind) return undefined;
    if (!isChromeSelectable(meta, activeDesignSlug, activeDesignMixable)) return undefined;
    return value;
  };

  const config: ChromeConfig = {};
  const h = valid(headerKey, "header");
  const f = valid(footerKey, "footer");
  if (h) config.headerKey = h;
  if (f) config.footerKey = f;
  return h || f ? config : null;
}
