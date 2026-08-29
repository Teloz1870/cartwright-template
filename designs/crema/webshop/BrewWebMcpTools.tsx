"use client";

import { useEffect } from "react";
import {
  registerWebMcpTools,
  resolveModelContext,
  type WebMcpToolDescriptor,
} from "@/lib/model-context";
import { formatPrice } from "@/lib/format";
import { computeBrew, STRENGTH_RATIO, type Strength } from "./brew-math";
import {
  buildBrewRecommendation,
  type CandidateProduct,
} from "./brew-recommendation";

/**
 * Crema — the DESIGN PACK ships its own WebMCP tool: the homepage's brew
 * calculator becomes `calculate_brew_ratio`. A page capability the human
 * uses with sliders is the same capability an agent gets as a typed tool —
 * computed from the SAME math module (brew-math.ts), so the two can never
 * disagree.
 *
 * This is the first pack-registered tool, so it also carries the pattern's
 * safety wiring: the pack declares its bindings in `DesignPack.
 * webMcpToolBindings` (designs/crema/index.ts imports the const below), and
 * the moat test aggregates EVERY registered pack's bindings into the global
 * uniqueness + families check.
 *
 * The tool began as the moat's PURE_COMPUTE class — page-local math, binding
 * []. It now also RESOLVES the recipe against the live catalogue, so it binds
 * ["products.search"] and has left that class. It performs no mutation and
 * stays `readOnlyHint`; the mutation deliberately remains where the shop
 * already put it, on the product page the recommendation points at.
 */

/** Moat bindings — aggregated via DesignPack.webMcpToolBindings. */
export const CREMA_WEBMCP_TOOL_BINDINGS = {
  // Was `[]` — the moat's PURE_COMPUTE class. The tool now READS the catalogue
  // to name the coffee it is recommending, so the binding says so. It is still
  // read-only (no mutation, `readOnlyHint` intact); the change is that the
  // enumeration now describes what the tool actually touches instead of
  // understating it.
  calculate_brew_ratio: ["products.search"],
} as const;

const STRENGTHS = Object.keys(STRENGTH_RATIO) as Strength[];

/** The locale prefix of the page the agent is on, read at call time. */
function localePrefix(): string {
  if (typeof window === "undefined") return "";
  const segment = window.location.pathname.split("/")[1] ?? "";
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(segment) ? `/${segment}` : "";
}

/**
 * Ask the shop which coffee suits this brew, and turn the answer into a
 * buyable line.
 *
 * The query is the STRENGTH WORD, searched against the catalogue — not a
 * title match. "bright" finds the coffee whose own description calls itself
 * bright, so the shop's copy decides, not a hardcoded slug. (This relies on
 * descriptive prose; a `brewStrengths` attribute would be sturdier and is
 * worth adding when the catalogue can be edited safely.)
 */
/**
 * The words to look for, per strength, in the shop's own copy — in order.
 *
 * The tool used to search for the strength name itself, which worked for two
 * of the three and silently failed for the third: measured against the live
 * catalogue, "bright" found the Yirgacheffe and "balanced" the Colombia, but
 * "strong" found NOTHING, so every `strength: "strong"` call quietly degraded
 * to the bare recipe. The shop does stock the coffee — it just calls it
 * "earthy, full-bodied … dark chocolate" rather than strong.
 *
 * So each strength carries the words a roaster actually writes, tried in
 * order until one matches. The shop's own copy still decides which product it
 * is; this only stops one of three advertised options from being a dead end.
 * (A `brewStrengths` attribute would be sturdier and is worth adding when the
 * catalogue can be edited safely — the same note the header already carries.)
 */
export const STRENGTH_TERMS: Record<Strength, readonly string[]> = {
  bright: ["bright", "floral", "acidity"],
  balanced: ["balanced", "sweet", "caramel"],
  strong: ["strong", "full-bodied", "dark"],
};

async function searchCatalogue(term: string, locale: string) {
  const res = await fetch(
    `/api/products/search?q=${encodeURIComponent(term)}&limit=5` +
      (locale ? `&locale=${encodeURIComponent(locale)}` : ""),
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { products?: Array<Record<string, unknown>> };
  return data.products ?? [];
}

async function resolveRecommendation(cups: number, strength: Strength) {
  const locale = localePrefix().replace(/^\//, "");
  let found: Array<Record<string, unknown>> | null = null;
  for (const term of STRENGTH_TERMS[strength]) {
    const products = await searchCatalogue(term, locale);
    if (products === null) return null; // the shop errored — say nothing
    if (products.length > 0) {
      found = products;
      break;
    }
  }
  if (!found) return null;
  const data = { products: found };
  const candidates: CandidateProduct[] = (data.products ?? []).map((p) => ({
    title: String(p.title ?? ""),
    // Read, not reverse-engineered. This used to split `url` on "/product/",
    // so changing that route segment would have emptied every slug — and
    // `usable.length === 0` would have made the recommendation vanish on 100%
    // of calls with no field name changed and no test failing.
    slug: String(p.slug ?? ""),
    description: typeof p.description === "string" ? p.description : null,
    inStock: p.inStock !== false,
    priceMinor: Number(
      (p.unitPrice as { amountMinor?: unknown } | undefined)?.amountMinor ?? p.price ?? 0,
    ),
    currency: String(p.currency ?? ""),
    formattedPrice:
      typeof (p.unitPrice as { formatted?: unknown } | undefined)?.formatted === "string"
        ? ((p.unitPrice as { formatted: string }).formatted)
        : String(p.price ?? ""),
    packSizeGrams:
      typeof p.packSizeGrams === "number" ? p.packSizeGrams : null,
  }));
  const usable = candidates.filter((c) => c.slug);
  if (usable.length === 0) return null;
  return buildBrewRecommendation(
    cups,
    strength,
    usable,
    localePrefix(),
    // The shop's OWN formatter — the same `formatPrice` behind every price on
    // the storefront and behind the `unitPrice.formatted` this same response
    // carries. It was briefly a hand-rolled `toFixed(2) + currency`, which put
    // two spellings of one currency inside a single item: unitPrice
    // "149,00 kr." beside subtotal "149.00 DKK". That is the exact ambiguity
    // `unitPrice` was added to remove. (It also read the FIRST candidate's
    // currency rather than the chosen one — wrong the moment the first is out
    // of stock.)
    // The READER's locale, not the currency's. Passing bare `formatPrice` was
    // the same defect one layer in: `unitPrice` came back from the route
    // rendered in the request locale ("DKK 149.00" on /en) while the subtotal
    // was rendered here with formatPrice's currency default ("149,00 kr.") —
    // two spellings of one currency inside a single item, which is exactly
    // what the previous commit claimed to have removed.
    (minor) => formatPrice(minor, locale ? { locale } : {}),
  );
}



function buildBrewTools(): WebMcpToolDescriptor[] {
  return [
    {
      name: "calculate_brew_ratio",
      description:
        "Calculate this roastery's recommended pour-over recipe: cups of coffee → grams of ground coffee and grams of water. " +
        "Uses the shop's own brewing guide (1 cup = 200 g water; strong 1:15, balanced 1:16, bright 1:17). " +
        "Pure, instant calculation.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: {
          cups: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "How many cups to brew (1–12). One cup = 2 dl.",
          },
          strength: {
            type: "string",
            enum: STRENGTHS,
            description: "strong = 1:15, balanced = 1:16, bright = 1:17. Defaults to balanced.",
          },
        },
        required: ["cups"],
      },
      async execute(input) {
        const cups = Number(input.cups);
        if (!Number.isInteger(cups) || cups < 1 || cups > 12) {
          return { error: "cups must be an integer between 1 and 12." };
        }
        const strength = input.strength === undefined ? "balanced" : input.strength;
        if (typeof strength !== "string" || !(strength in STRENGTH_RATIO)) {
          return { error: `strength must be one of: ${STRENGTHS.join(", ")}.` };
        }
        const recipe = {
          strength,
          ...computeBrew(cups, STRENGTH_RATIO[strength as Strength]),
        };

        // The recipe alone is backwards compatible; `recommendation` is added
        // beside it. A catalogue hiccup must never cost the caller the maths
        // it actually asked for, so resolution failing degrades to the recipe.
        try {
          const recommendation = await resolveRecommendation(
            cups,
            strength as Strength,
          );
          return recommendation ? { ...recipe, recommendation } : recipe;
        } catch {
          return recipe;
        }
      },
    },
  ];
}

export default function BrewWebMcpTools() {
  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) return;
    const controller = new AbortController();
    void registerWebMcpTools(resolved.context, buildBrewTools(), controller.signal);
    return () => controller.abort();
  }, []);

  return null;
}
