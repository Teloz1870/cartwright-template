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

/** Designs that own a chrome.tsx, with display names for labels. */
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
  { slug: "agentic-showcase", name: "Agentic Showcase" },
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

/** Why `isChromeSelectable` said no — stable, machine-readable. */
export type ChromeRejectionReason =
  /** Locked-theme chrome; its own design is not the target. */
  | "locked-to-design"
  /** Locked-theme chrome that owns no design at all — selectable nowhere. */
  | "locked-standalone"
  /** The chrome is mixable, but there is no target design to render it on. */
  | "no-target-design"
  /** The chrome is mixable; the target design is not installed on this shop. */
  | "target-not-registered"
  /** The chrome is mixable; the TARGET design is what refuses foreign chrome. */
  | "design-not-mixable";

export type ChromeRejection = {
  reason: ChromeRejectionReason;
  /** One English sentence: the cause, then the remedy that actually works. */
  message: string;
};

/**
 * Explain a refusal from `isChromeSelectable` — returns `null` when the chrome
 * IS selectable, so callers can use it as the gate itself and never drift from
 * the predicate they are narrating.
 *
 * Every surface that rejects a chrome (chrome.set, /admin/designs'
 * setChromeAction, the composition validator) used to write its own sentence,
 * and all three said the same wrong thing: `only renders on the
 * "${meta.designSlug}" design`. That blames the CHROME for a refusal the TARGET
 * DESIGN can just as easily be the cause of, and for a neutral Part
 * (components/chrome-parts/ — no owning design) it interpolated the literal
 * string "undefined". A shop on a locked-theme design that asked for
 * "mega-footer" was told:
 *
 *   "mega-footer" is a locked-theme chrome that only renders on the
 *   "undefined" design … Pick a mixable chrome or switch design first.
 *
 * — every clause of which is false or useless: mega-footer IS mixable, there is
 * no "undefined" design, and "pick a mixable chrome" is the one remedy that
 * cannot work, because the caller already picked one. An AI agent driving the
 * tool surface (the moat) takes that literally and retries the other mixable
 * Parts, each failing identically. The four reasons below are distinguishable
 * precisely so the remedy is actionable.
 *
 * `targetNoun` names the design in prose: "active design" for the shop-local
 * surfaces, "skin" for the composition validator, which validates against a
 * composition's declared skin rather than whatever is live. `targetMixable` is
 * the target pack's own `mixable` field and is threaded straight through to
 * `isChromeSelectable` — omit it exactly where that caller omits it, or the
 * explanation can contradict the decision.
 */
export function explainChromeRejection(
  meta: ChromeMeta,
  targetDesignSlug: string | null | undefined,
  opts: { targetMixable?: boolean; targetNoun?: string } = {},
): ChromeRejection | null {
  const { targetMixable, targetNoun = "active design" } = opts;
  if (isChromeSelectable(meta, targetDesignSlug, targetMixable)) return null;

  const target = targetDesignSlug ?? null;
  const where = `(${targetNoun}: ${target ?? "none"})`;
  // Whether the target design accepts foreign mixable chrome at all — the
  // exact predicate the design-not-mixable branch below narrates. When it is
  // false, "pick a mixable chrome" is an EMPTY cure-set: the caller would pick
  // one, land in that branch, and be told "picking a different chrome will not
  // help" — the retry loop this helper exists to close, re-created between two
  // of its own branches. So the locked-theme remedies only offer that route
  // when it can actually succeed.
  const targetAcceptsMixable = target != null && resolveMixable(target, targetMixable);

  // Locked-theme chrome: the CHROME is the constraint.
  if (!meta.mixable) {
    if (meta.designSlug != null) {
      return {
        reason: "locked-to-design",
        message: `"${meta.key}" is a locked-theme chrome that only renders on the "${meta.designSlug}" design ${where}. Switch to "${meta.designSlug}"${targetAcceptsMixable ? ", or pick a mixable chrome" : ""}.`,
      };
    }
    // No shipped entry is both non-mixable and design-less, but ChromeMeta
    // allows it — and it is the shape that produced the "undefined" design.
    return {
      reason: "locked-standalone",
      message: `"${meta.key}" is a locked-theme chrome that owns no design, so no ${targetNoun} can render it ${where}. ${targetAcceptsMixable ? "Pick a mixable chrome." : `Pick chrome from the ${targetNoun}'s own pack, or leave the slot on its default.`}`,
    };
  }

  // Mixable chrome: the TARGET DESIGN is the constraint.
  if (target == null) {
    return {
      reason: "no-target-design",
      message: `"${meta.key}" is a mixable chrome, but there is no ${targetNoun} to render it on. Choose a design first.`,
    };
  }
  // The target design is not installed here at all. Reachable through the
  // composition validator, which does NOT return after flagging an unknown
  // skin (lib/compositions/spec.ts:109-115) — so a composition authored on a
  // shop that has a pack you lack reaches this line with a foreign slug. That
  // is the ordinary portability case, and telling that installer to "declare
  // the pack mixable" would repeat exactly the impossible-remedy defect this
  // helper exists to fix, one level down: they cannot edit a pack they do not
  // have. The write paths reach it only in a genuinely broken state — a pack
  // uninstalled while BrandingSettings.designSlug still names it — and the
  // wording holds there too: "install that design, or choose one you have" is
  // exactly the remedy for a shop pointing at a pack that is gone.
  if (!REGISTERED_DESIGN_SLUGS.has(target)) {
    return {
      reason: "target-not-registered",
      message: `"${meta.key}" is a mixable chrome, but "${target}" is not a registered design on this shop, so nothing can render it. Install that design first (npx cartwright design install ${target}), or choose a design you have.`,
    };
  }

  // Deliberately does NOT call the target "locked-theme". Two very different
  // packs land here: a genuinely locked-theme design (nocturne, halo — own
  // token prefix, so a cw-* Part would render in the DEFAULT cw palette), and
  // a pack that simply never declared itself — Blank Canvas, or any bespoke
  // pack a customer wrote. Telling the second group to "switch to a mixable
  // design" tells them to throw their design away, when the real remedy is one
  // line in their own pack (designs/blank/index.ts documents it). Naming both
  // routes, and making the second conditional on the tokens actually tracking
  // the palette, is correct for both groups.
  return {
    reason: "design-not-mixable",
    message: `"${meta.key}" is a mixable chrome, but the ${targetNoun} "${target}" does not accept chrome from other packs — picking a different chrome will not help. Switch to a mixable design, or, if this pack's own tokens track the palette, declare it mixable (set \`mixable: true\` on the pack, or add its slug to MIXABLE_DESIGN_SLUGS in designs/options.ts).`,
  };
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
