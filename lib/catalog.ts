import { dbSearchTokens } from "@/lib/search/lexical";
export type CatalogParams = {
  q?: string;
  kategori?: string;
  stelfarve?: string;
  glasfarve?: string;
  brand?: string;
  minPris?: string;
  maxPris?: string;
  sort?: string;
};

export type ProductQuery = {
  where: Record<string, unknown>;
  orderBy: Record<string, "asc" | "desc">;
};

function parseKroner(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

/** Oversætter URL-søgeparametre til et Prisma where/orderBy-objekt for produkter. */
export function buildProductQuery(params: CatalogParams): ProductQuery {
  const where: Record<string, unknown> = {};

  if (params.q && params.q.trim() !== "") {
    // AND over normalised tokens, not one contains over the whole phrase.
    // The storefront search was the narrowest of the three implementations —
    // it did not look at the description at all, so "bright" could not find a
    // product whose description is literally "Bright, floral single-origin".
    //
    // This runs in the DATABASE (a Prisma where), so it cannot use the shared
    // JS matcher directly; it mirrors its rule — every token must appear in at
    // least one field. Token splitting is shared, so the two agree on what a
    // token IS, and the rule is the same substring test `contains` performs.
    // Tokens are NOT folded here (see dbSearchTokens): `contains` compares
    // against the raw column, so folding "søde" to "sode" — or lowercasing
    // "Ethiopia" on Postgres, where contains is case-sensitive — would make
    // this NARROWER than the single filter it replaced.
    // Deduped and capped. Each token becomes an OR over four `contains` legs,
    // i.e. four bind parameters — and Prisma's SQLite/libSQL client refuses a
    // query with more than 999, so a 250-word `?q=` threw P2029 before it ever
    // reached the database. Measured: last OK at 249 tokens, first failure at
    // 250. That is a public unauthenticated GET, and pasting a paragraph into
    // a search box is not an attack; the previous single-`contains` clause
    // could not care how long the query was, so this cliff is new here.
    //
    // Truncating is better behaviour than erroring: 32 tokens is far past any
    // real search, and a shopper who pastes an essay gets results for its
    // first words rather than an empty grid.
    const tokens = [...new Set(dbSearchTokens(params.q))].slice(0, 32);
    where.AND = tokens.length
      ? tokens.map((token) => ({
          OR: [
            { name: { contains: token } },
            { brand: { contains: token } },
            { description: { contains: token } },
            // `slug` because the JS haystack reads it, so a query that matched
            // through the API used to miss on the PLP. `attributes` is the one
            // field that CANNOT follow: it is a Json column, and Prisma's
            // `contains` is a string operator. That asymmetry is real and
            // stated rather than papered over — see the note in
            // lib/search/lexical.ts.
            { slug: { contains: token } },
          ],
        }))
      : // A non-empty query that yields no tokens — a lone emoji, punctuation —
        // returns NOTHING, not the unfiltered catalogue. This reverses an
        // earlier deliberate choice, so the reasoning matters: the API and the
        // PLP now share one matcher, and the JS side reports 0 for such a
        // query. Leaving the PLP unfiltered would put the two doors back in
        // disagreement — and showing every product under the heading "results
        // for ☕" tells a shopper, and a crawler, that we sell all of it under
        // that word. `in: []` is Prisma's idiom for "match nothing".
        [{ id: { in: [] } }];
  }
  if (params.kategori) where.category = { slug: params.kategori };
  if (params.stelfarve) where.frameColor = params.stelfarve;
  if (params.glasfarve) where.lensColor = params.glasfarve;
  if (params.brand) where.brand = params.brand;

  const min = parseKroner(params.minPris);
  const max = parseKroner(params.maxPris);
  if (min !== undefined || max !== undefined) {
    const price: Record<string, number> = {};
    if (min !== undefined) price.gte = min;
    if (max !== undefined) price.lte = max;
    where.priceDkk = price;
  }

  let orderBy: Record<string, "asc" | "desc">;
  switch (params.sort) {
    case "pris-op":
      orderBy = { priceDkk: "asc" };
      break;
    case "pris-ned":
      orderBy = { priceDkk: "desc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  return { where, orderBy };
}
