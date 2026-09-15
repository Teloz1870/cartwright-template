import { allVerticals } from "@/verticals";
import type { VerticalPreset } from "@/verticals/types";
import { LOOKS, type LookEntry } from "@/verticals/looks";
import { pageLayoutSchema, type PageLayout } from "@/lib/builder/section-schema";

/**
 * Magic Builder — the INSTANT preset path (Mixer 2.0 Phase 3, "magic speed").
 *
 * Before any LLM call, the page prompt is matched against the shipped Vertical
 * (Voice) presets + curated Looks with a deterministic keyword match — no LLM,
 * no network, ~0ms. On a STRONG match the preset's pre-written, on-voice genome
 * copy is assembled into a ready PageLayout (hero → value props → features →
 * CTA, with tasteful PART 4 motion) and returned instantly; the admin can then
 * "re-tone with AI" to run the full plan+generate pass. A weak/ambiguous match
 * returns null so the governed LLM path runs as before — the preset path only
 * ever short-circuits when the intent obviously names an industry we ship.
 *
 * Pure data + Zod only (verticals are plain objects; type-only genome imports
 * erase) → deterministically unit-testable, importable from the SSE route.
 */

export type PresetMatch = {
  vertical: VerticalPreset;
  /** A curated Look whose name matched and whose Voice is this vertical, if any. */
  look: LookEntry | null;
  /** Deterministic match score (see weights in matchPreset). */
  score: number;
  /** The intent terms that hit — surfaced in the admin UI note. */
  matched: string[];
};

/** Generic words that appear in preset names but must never drive a match. */
const STOPWORDS = new Set([
  "shop",
  "store",
  "site",
  "page",
  "model",
  "launch",
  "the",
  "and",
  "for",
  "med",
  "och",
  "og",
]);

/** Lowercase, strip diacritics, split to a unique word set. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9æøå]+/)
      .filter((w) => w.length >= 2),
  );
}

/** Weighted term map for one vertical: slug/name/alias words = 2, keywords = 1. */
function termWeights(v: VerticalPreset): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (term: string, w: number) => {
    const t = term.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.length < 2 || STOPWORDS.has(t)) return;
    weights.set(t, Math.max(weights.get(t) ?? 0, w));
  };
  for (const word of tokenize(v.slug)) add(word, 2);
  for (const word of tokenize(v.name)) add(word, 2);
  // Localized industry nouns ("t\u00f8mrer", "b\u00f8rnehave") weigh like name words so
  // a Danish prompt strong-matches even though display names are English-first.
  for (const alias of v.aliases ?? []) for (const word of tokenize(alias)) add(word, 2);
  for (const kw of v.keywords) for (const word of tokenize(kw)) add(word, 1);
  return weights;
}

/** A match is STRONG (instant-path worthy) at this score or above. */
export const STRONG_MATCH_SCORE = 2;

/**
 * Match an intent against vertical presets + curated Looks. Returns the best
 * STRONG match or null (→ caller falls through to the LLM path). Deterministic:
 * ties resolve to registry order.
 */
export function matchPreset(intent: string): PresetMatch | null {
  const words = tokenize(intent);
  if (words.size === 0) return null;

  let best: PresetMatch | null = null;

  for (const vertical of allVerticals()) {
    const weights = termWeights(vertical);
    let score = 0;
    const matched: string[] = [];
    for (const [term, weight] of weights) {
      if (words.has(term)) {
        score += weight;
        matched.push(term);
      }
    }

    // A curated Look's distinctive name (e.g. "Metamorphosis", "Canopy") is a
    // direct ask for that composition — strong signal for the Look's Voice.
    let look: LookEntry | null = null;
    for (const candidate of LOOKS) {
      if (candidate.voiceSlug !== vertical.slug) continue;
      const nameTokens = [...tokenize(candidate.name)].filter((t) => !STOPWORDS.has(t));
      if (nameTokens.length > 0 && nameTokens.every((t) => words.has(t))) {
        score += 3;
        matched.push(...nameTokens.filter((t) => !matched.includes(t)));
        look = candidate;
        break;
      }
    }

    if (score >= STRONG_MATCH_SCORE && (!best || score > best.score)) {
      best = { vertical, look, score, matched };
    }
  }

  return best;
}

/** Try to parse a genome `…items` override (JSON array of {title, body}). */
function parseItems(raw: string | undefined): { title: string; body: string }[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const items = parsed.filter(
      (x): x is { title: string; body: string } =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as { title?: unknown }).title === "string" &&
        typeof (x as { body?: unknown }).body === "string",
    );
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

/**
 * Assemble a ready PageLayout from a Voice preset's pre-written genome copy —
 * deterministic, zero LLM. Sections whose copy is missing/invalid are skipped
 * (fail-soft); the result is validated against the real pageLayoutSchema and
 * null is returned if nothing valid could be assembled (caller falls through
 * to the LLM path). Below-the-fold sections carry a tasteful "fade-up" (PART 4
 * vocabulary) — inert until brand.features.motionEffects resolves data-motion.
 */
export function presetLayout(vertical: VerticalPreset): PageLayout | null {
  const g = vertical.genomeOverrides;
  const sections: PageLayout["sections"] = [];

  const headline = g["home.hero.headline"];
  const tagline = g["home.hero.tagline"];
  if (headline && tagline) {
    sections.push({
      id: "hero-0",
      key: "hero",
      enabled: true,
      props: {
        ...(g["home.hero.eyebrow"] ? { eyebrow: g["home.hero.eyebrow"] } : {}),
        headline,
        tagline,
        ctaLabel: g["home.hero.cta"] ?? "Learn more",
        ctaHref: "/kontakt",
      },
    });
  }

  const valueItems = parseItems(g["home.valueProps.items"]);
  if (g["home.valueProps.title"] && valueItems) {
    sections.push({
      id: "valueProps-1",
      key: "valueProps",
      enabled: true,
      effect: "fade-up",
      props: {
        title: g["home.valueProps.title"],
        ...(g["home.valueProps.description"]
          ? { description: g["home.valueProps.description"] }
          : {}),
        // valueProps' schema names them `items` (max 6) — featureGrid uses `features`.
        items: valueItems.slice(0, 6),
      },
    });
  }

  const featureItems = parseItems(g["home.features.items"]);
  if (g["home.features.title"] && featureItems) {
    sections.push({
      id: "featureGrid-2",
      key: "featureGrid",
      enabled: true,
      effect: "fade-up",
      props: {
        title: g["home.features.title"],
        ...(g["home.features.description"]
          ? { description: g["home.features.description"] }
          : {}),
        features: featureItems,
      },
    });
  }

  if (g["home.ctaFooter.title"]) {
    sections.push({
      id: "ctaFooter-3",
      key: "ctaFooter",
      enabled: true,
      effect: "fade-up",
      props: {
        title: g["home.ctaFooter.title"],
        ...(g["home.ctaFooter.description"]
          ? { description: g["home.ctaFooter.description"] }
          : {}),
        ctaLabel: g["home.ctaFooter.cta"] ?? "Contact us",
        ctaHref: "/kontakt",
      },
    });
  }

  if (sections.length === 0) return null;
  const parsed = pageLayoutSchema.safeParse({ sections });
  return parsed.success ? parsed.data : null;
}

export type InstantPresetResult = {
  layout: PageLayout;
  vertical: { slug: string; name: string; suggestedDesignSlug: string | null };
  look: { slug: string; name: string; designSlug: string } | null;
  matched: string[];
};

/**
 * The one-call instant path: strong preset match + assembled layout, or null
 * (→ run the LLM plan+generate as before).
 */
export function instantPresetResult(intent: string): InstantPresetResult | null {
  const match = matchPreset(intent);
  if (!match) return null;
  const layout = presetLayout(match.vertical);
  if (!layout) return null;
  return {
    layout,
    vertical: {
      slug: match.vertical.slug,
      name: match.vertical.name,
      suggestedDesignSlug: match.vertical.suggestedDesignSlug ?? null,
    },
    look: match.look
      ? { slug: match.look.slug, name: match.look.name, designSlug: match.look.designSlug }
      : null,
    matched: match.matched,
  };
}
