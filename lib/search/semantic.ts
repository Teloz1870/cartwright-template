import "server-only";

import { cosineSimilarity } from "ai";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma, isPostgresDriver } from "@/lib/db";
import { embedQuery } from "@/lib/ai/embeddings";
import { normaliseForSearch, searchTokens } from "@/lib/search/lexical";

/**
 * Hybrid produktsøgning (Hul A): semantisk cosine-similarity + leksikalsk boost.
 *
 * Designprincip — ALDRIG regression: returnerer `null` når semantisk søgning
 * ikke kan køre (ingen embedding-provider, query kan ikke embeddes, eller ingen
 * kandidater har en embedding med den aktuelle model). Kalderen bruger så sin
 * eksisterende leksikalske `contains`-søgning uændret. Semantik er additiv.
 *
 * SQLite/libSQL har ingen native vektor-type, så cosine laves i TS. OK så længe
 * kataloget er < ~10.000 produkter (jf. `ProductEmbedding`-kommentaren).
 */

export type HybridCandidate = {
  id: string;
  /** name + brand + description, lowercased — til leksikalsk boost */
  haystack: string;
};

// Leksikalsk boost lagt oven på cosine-score (0..1). Et eksakt substring-hit på
// hele queryen vejer mest; enkelt-token-overlap vejer let. Holdt lavt så
// semantisk relevans dominerer men eksakte navne-match stadig kommer øverst.
const PHRASE_BOOST = 0.15;
const TOKEN_BOOST = 0.03;

function lexicalBoost(haystack: string, q: string, tokens: string[]): number {
  let boost = 0;
  if (haystack.includes(q)) boost += PHRASE_BOOST;
  for (const t of tokens) {
    if (t.length >= 2 && haystack.includes(t)) boost += TOKEN_BOOST;
  }
  return boost;
}

/**
 * Rangér `candidates` efter relevans for `query`. Returnerer ordnede produkt-id'er
 * (op til `limit`), eller `null` hvis semantisk søgning ikke er tilgængelig.
 */
export async function hybridRankProducts(
  query: string,
  candidates: HybridCandidate[],
  limit: number,
): Promise<string[] | null> {
  const q = query.trim();
  if (!q || candidates.length === 0) return null;

  const embedded = await embedQuery(q);
  if (!embedded) return null; // ingen provider → leksikalsk fallback

  // Normalised with the SAME helper that built the haystacks. Lowercasing and
  // splitting on whitespace was enough while callers passed raw
  // `name + brand + description`; they now pass `productHaystack(p)`, which is
  // folded and punctuation-split. Leaving the query raw would have quietly
  // killed the lexical boost for exactly the queries it exists to serve:
  // "pour-over" against a haystack reading "pour over", or "Café" against
  // "cafe" — the phrase and token bonuses would never fire, and an exact
  // lexical match could fall below the result limit.
  const qLower = normaliseForSearch(q);
  const tokens = searchTokens(q);

  // Postgres/pgvector (opt-in, DATABASE_DRIVER=postgres): lad HNSW-indekset lave
  // ANN-søgningen i databasen i stedet for at score hele kataloget i TS. Samme
  // score-formel (cosine + leksikalsk boost) → paritet med TS-grenen nedenfor.
  if (isPostgresDriver()) {
    return pgRankProducts(embedded, candidates, qLower, tokens, limit);
  }

  // --- Turso/SQLite: cosine i TS (uændret baseline-sti) ---
  // Hent kun embeddings lavet med SAMME model som query-vektoren — vektorer
  // fra forskellige modeller er ikke sammenlignelige.
  const rows = await prisma.productEmbedding.findMany({
    where: {
      productId: { in: candidates.map((c) => c.id) },
      model: embedded.modelId,
    },
    select: { productId: true, vectorJson: true },
  });
  if (rows.length === 0) return null; // katalog ikke embeddet endnu → fallback

  const vectorById = new Map<string, number[]>();
  for (const r of rows) {
    try {
      const v = JSON.parse(r.vectorJson);
      if (Array.isArray(v) && v.length === embedded.vector.length) {
        vectorById.set(r.productId, v as number[]);
      }
    } catch {
      // korrupt vektor — ignorér, produktet falder til leksikalsk boost alene
    }
  }
  if (vectorById.size === 0) return null;

  const scored = candidates.map((c) => {
    const vec = vectorById.get(c.id);
    const sem = vec ? cosineSimilarity(embedded.vector, vec) : 0;
    return { id: c.id, score: sem + lexicalBoost(c.haystack, qLower, tokens) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}

/**
 * Postgres/pgvector-grenen af hybrid-rankingen (Hul A-2). Lader databasen finde
 * de nærmeste vektorer via HNSW-cosine-indekset (`embedding <=> $query`) i stedet
 * for at hente + score hele kataloget i TS. Vi over-henter (`limit*4`) på ren
 * cosine-afstand og lægger SÅ den eksisterende leksikalske boost oven på i TS, så
 * den endelige rangering bruger præcis samme formel (`sem + lexicalBoost`) som
 * SQLite-grenen — pariteten er det der gør de to stier verificerbart ens.
 *
 * `embedding`-kolonnen + HNSW-indekset oprettes uden for Prisma (se
 * scripts/pgvector-setup.ts); derfor rå SQL her. Vi SELECTer aldrig selve
 * vektoren (pg-adapteren ville give den som streng) — kun id + skalar-afstand.
 */
async function pgRankProducts(
  embedded: { vector: number[]; modelId: string },
  candidates: HybridCandidate[],
  qLower: string,
  tokens: string[],
  limit: number,
): Promise<string[] | null> {
  // pgvector-tekst-literal er bare "[v1,v2,…]" → JSON.stringify rammer formatet.
  const vecLiteral = JSON.stringify(embedded.vector);
  const ids = candidates.map((c) => c.id);
  const k = Math.min(ids.length, Math.max(limit, limit * 4));

  let rows: { productId: string; distance: number }[];
  try {
    rows = await prisma.$queryRaw<{ productId: string; distance: number }[]>`
      SELECT "productId", embedding <=> ${vecLiteral}::vector AS distance
      FROM "ProductEmbedding"
      WHERE "productId" IN (${Prisma.join(ids)})
        AND "model" = ${embedded.modelId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vecLiteral}::vector
      LIMIT ${k}
    `;
  } catch (err) {
    // Manglende extension/kolonne/indeks, dim-mismatch m.m. → fald blødt tilbage
    // til leksikalsk søgning (samme kontrakt som de øvrige null-returns).
    console.error(
      "[semantic] pgvector-forespørgsel fejlede — falder til leksikalsk:",
      err,
    );
    return null;
  }
  if (rows.length === 0) return null; // katalog ikke embeddet endnu → fallback

  const haystackById = new Map(candidates.map((c) => [c.id, c.haystack]));
  const scored = rows.map((r) => {
    const sem = 1 - Number(r.distance); // cosine-afstand → cosine-lighed
    const haystack = haystackById.get(r.productId) ?? "";
    return {
      id: r.productId,
      score: sem + lexicalBoost(haystack, qLower, tokens),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}
