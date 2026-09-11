/**
 * Normalised token matching — the lexical half of product search.
 *
 * The bug this replaces was one expression:
 * `${name} ${description} ${slug}`.toLowerCase().includes(query.toLowerCase())
 * — a verbatim CONTIGUOUS substring test of the whole query. Measured against
 * the live demo, it made search punctuation-exact:
 *
 *   "bright, floral single-origin"  → 1 hit   (the exact substring, comma and all)
 *   "bright floral"                 → 0 hits  (only the comma is missing)
 *   "bright single-origin"          → 0 hits
 *   "Dripper Hario"                 → 0 hits  (word order mattered)
 *   "pour over"                     → 0 hits  ("pour-over" → 3)
 *
 * An agent asking for "a bright single-origin for pour-over" — the way a person
 * actually phrases it — got nothing, while the shop had exactly that product.
 *
 * Three different implementations of free-text search existed, over three
 * different field sets (the REST route searched name/description/slug, the tool
 * registry searched name/brand/description, the storefront PLP searched
 * name/brand only). This module is the one they share, so a query cannot mean
 * different things depending on which door it came through.
 */

/**
 * Lowercase, strip diacritics, and reduce every separator to a single space.
 *
 * Hyphens and slashes become spaces on BOTH sides, so "single-origin" in a
 * description and "single origin" in a query are the same three-token sequence.
 * That is the whole reason "pour over" used to miss "pour-over".
 */
export function normaliseForSearch(input: string): string {
  return input
    .normalize("NFD")
    // Combining marks: "Café" and "Cafe" must be one word, and a Danish shop's
    // "søde" should be findable as "sode" by a keyboard that lacks the key.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Danish letters have no decomposition, so they are mapped explicitly.
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    // Every non-alphanumeric becomes a separator — hyphens, commas, en dashes,
    // slashes, the lot.
    // Unicode-aware, NOT /[^a-z0-9]/. The ASCII version silently emptied any
    // query written in a non-Latin script — "кофе" normalised to "", which
    // tokenised to [] and (before the guard in matchesAllTokens) reported the
    // ENTIRE catalogue as matching. On a Cyrillic, Greek, CJK or Arabic shop
    // the haystack collapsed too, so every query returned everything. That is
    // not a defensible default on a branch about speaking more than one
    // language.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The query's meaningful tokens, in no particular order. */
export function searchTokens(query: string): string[] {
  const normalised = normaliseForSearch(query);
  return normalised ? normalised.split(" ").filter(Boolean) : [];
}

/**
 * Everything about a product a person might type. Attribute VALUES are
 * included because a shop's structured vocabulary is exactly what a person
 * searches by — the coffee seed records `process: "Washed"`, and before this
 * a search for "washed" could not find it.
 *
 * Keys are deliberately excluded: nobody searches for "weightG".
 */
export function productHaystack(product: {
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  brand?: string | null;
  attributes?: unknown;
}): string {
  const parts = [
    product.name,
    product.description,
    product.slug,
    product.brand,
    attributeValues(product.attributes),
  ];
  return normaliseForSearch(parts.filter(Boolean).join(" "));
}

/** Flatten attribute VALUES (strings, numbers, arrays, one nested level). */
function attributeValues(attributes: unknown): string {
  if (!attributes || typeof attributes !== "object") return "";
  const out: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 2) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      for (const v of value) visit(v, depth + 1);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) visit(v, depth + 1);
    }
  };
  visit(attributes, 0);
  return out.join(" ");
}

/**
 * Every token must appear — an AND, not an OR.
 *
 * OR would make "bright single-origin" return the whole catalogue, since
 * almost anything matches one common word. AND is what a person means when
 * they add a word: narrow it.
 *
 * A token matches anywhere inside the haystack, NOT only at a word boundary.
 * That is deliberate and it is the same rule the Prisma mirror uses, because
 * the two must agree: `contains` is a substring test, and a word-prefix rule
 * here made the doors disagree on the most ordinary query a coffee shopper
 * types. Measured against the live catalogue, "press" found three products on
 * the storefront (AeroPress, two espressos) and ZERO through the agent API,
 * because none of them contains "press" as a standalone word. "cheffe" found
 * Yirgacheffe on one door and nothing on the other.
 *
 * An empty token list means the query had nothing matchable in it — a lone
 * emoji, say. That returns false, not true: answering "3 results" for a query
 * no product contains is worse than answering none. A genuinely blank query
 * never reaches here (callers pass no `q` at all).
 */
export function matchesAllTokens(haystack: string, query: string): boolean {
  if (!query.trim()) return true; // no query = no filter
  const tokens = searchTokens(query);
  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Tokens for a DATABASE `contains` filter — split only, never folded.
 *
 * `searchTokens` lowercases and folds æøå/diacritics, which is right when both
 * sides go through `normaliseForSearch`. Handing those tokens to Prisma is
 * not: `contains` compares against the RAW column, so a Danish shopper
 * searching "søde bønner" would have been asked to match "sode bonner" and
 * found nothing, and on Postgres — where `contains` is case-sensitive —
 * lowercasing "Ethiopia" to "ethiopia" would stop matching a stored name that
 * the previous whole-phrase filter matched fine.
 *
 * So the DB path keeps the user's own spelling and only splits on separators.
 * It is strictly no narrower than the single `contains` it replaced, and it
 * gains AND-over-tokens plus the description column.
 */
export function dbSearchTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * WHAT IS AND IS NOT SHARED between the JS matcher and its Prisma mirror.
 *
 * Written down because the first version of this module claimed more than it
 * delivered, and a reviewer had to measure to find that out.
 *
 * Shared:
 *  - the rule: AND over tokens, each matched as a SUBSTRING (Prisma `contains`)
 *  - what counts as a token: split on anything that is not a letter or number
 *  - a query with no usable tokens matches nothing, not everything
 *
 * Deliberately NOT shared, with the reason:
 *  - FOLDING. The JS side folds æøå and diacritics because both sides pass
 *    through normaliseForSearch; the DB side compares against the raw column,
 *    so folding there would make it strictly narrower (see dbSearchTokens).
 *    Consequence: "cafe" finds "Café" through the API and not on the PLP.
 *  - CASE. Same reason. On SQLite `contains` is case-insensitive for ASCII, so
 *    the two agree there; on Postgres they do not.
 *  - ATTRIBUTES. `productHaystack` reads them; `Product.attributes` is a Json
 *    column and `contains` is a string operator, so the Prisma path cannot.
 *
 * Closing the first two means normalised search columns; closing the third
 * means a schema change. Both are real work, and neither is this change.
 */
