import "server-only";

import { prisma, isPostgresDriver } from "@/lib/db";
import { embedTexts, embedQuery, resolveEmbedder } from "@/lib/ai/embeddings";

/**
 * Generering + lagring af produkt-embeddings (Hul A).
 *
 * `ProductEmbedding.vectorJson` holder en JSON-array af floats; `model` holder
 * provider-id'et så søgningen kun sammenligner kompatible vektorer. Embedding-
 * teksten samler de felter en kunde reelt søger på (navn, brand, kategori,
 * beskrivelse, attributter) til ét "haystack".
 */

type ProductForEmbedding = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  attributes: unknown;
  category: { name: string } | null;
};

/** Byg den tekst der embeddes for ét produkt. Eksporteret for test. */
export function productEmbeddingText(p: ProductForEmbedding): string {
  const parts: string[] = [p.name];
  if (p.brand) parts.push(p.brand);
  if (p.category?.name) parts.push(p.category.name);
  if (p.description) parts.push(p.description);
  // Attributter er JSON ({height, width, color, ...}) — fold værdierne ind så
  // semantisk søgning også fanger varianter/egenskaber.
  if (p.attributes && typeof p.attributes === "object") {
    for (const v of Object.values(p.attributes as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") parts.push(String(v));
    }
  }
  return parts.join(" — ");
}

const PRODUCT_SELECT = {
  id: true,
  name: true,
  brand: true,
  description: true,
  attributes: true,
  category: { select: { name: true } },
} as const;

/**
 * Dobbelt-skriv vektoren til den rigtige Postgres `vector(768)`-kolonne (Hul A-2,
 * kun når DATABASE_DRIVER=postgres). Prisma kender ikke kolonnen (schema'et er
 * `sqlite`), så det sker via rå SQL. `vectorJson` forbliver den portable kilde;
 * `embedding` er en afledt accelerator som HNSW-indekset søger på. En
 * pgvector-tekst-literal er bare "[v1,v2,…]" → JSON.stringify rammer formatet.
 */
async function writePgEmbedding(
  productId: string,
  vector: number[],
): Promise<void> {
  const literal = JSON.stringify(vector);
  await prisma.$executeRaw`
    UPDATE "ProductEmbedding"
    SET embedding = ${literal}::vector
    WHERE "productId" = ${productId}
  `;
}

/**
 * Re-embed ét produkt og gem (upsert). Best-effort: fejler aldrig kalderen —
 * bruges som ikke-blokerende hook efter products.create/update.
 */
export async function upsertProductEmbedding(productId: string): Promise<boolean> {
  try {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: PRODUCT_SELECT,
    });
    if (!product) return false;

    const result = await embedTexts([productEmbeddingText(product)]);
    if (!result || result.vectors.length === 0) return false;

    await prisma.productEmbedding.upsert({
      where: { productId },
      create: {
        productId,
        vectorJson: JSON.stringify(result.vectors[0]),
        model: result.modelId,
      },
      update: {
        vectorJson: JSON.stringify(result.vectors[0]),
        model: result.modelId,
      },
    });
    if (isPostgresDriver()) {
      await writePgEmbedding(productId, result.vectors[0] as number[]);
    }
    return true;
  } catch (err) {
    console.error(`[product-embeddings] upsert failed for ${productId}:`, err);
    return false;
  }
}

export type BackfillResult = {
  embedded: number;
  skipped: number;
  total: number;
  modelId: string | null;
};

/**
 * Embed alle ikke-slettede produkter i ét batch. `force=false` springer
 * produkter over der allerede har en embedding med den aktuelle model.
 * Bruges af backfill-scriptet + en evt. admin-action.
 */
export async function backfillProductEmbeddings(
  force = false,
): Promise<BackfillResult> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: PRODUCT_SELECT,
  });
  const total = products.length;
  if (total === 0) return { embedded: 0, skipped: 0, total: 0, modelId: null };

  // Resolve provideren FØRST — vi skal kende den aktive model-id for at afgøre
  // hvilke produkter der reelt er up-to-date (en gammel embedding fra en ANDEN
  // model skal re-embeddes, ellers falder søgningen permanent til leksikalsk).
  const embedder = await resolveEmbedder();
  if (!embedder) {
    return { embedded: 0, skipped: total, total, modelId: null };
  }

  const existing = force
    ? new Map<string, string>()
    : new Map(
        (
          await prisma.productEmbedding.findMany({
            select: { productId: true, model: true },
          })
        ).map((e) => [e.productId, e.model]),
      );

  // Re-embed når den lagrede model afviger fra den aktive (eller mangler).
  const toEmbed = force
    ? products
    : products.filter((p) => existing.get(p.id) !== embedder.modelId);

  if (toEmbed.length === 0) {
    return { embedded: 0, skipped: total, total, modelId: embedder.modelId };
  }

  const result = await embedTexts(toEmbed.map(productEmbeddingText));
  if (!result) {
    return { embedded: 0, skipped: total, total, modelId: null };
  }

  // Chunked upserts UDEN omsluttende $transaction — en enkelt stor transaktion
  // ville låse SQLite/Turso for skrivninger (SQLITE_BUSY på storefront-kald)
  // i hele backfill-kørslen på store kataloger.
  const CHUNK = 50;
  const writePg = isPostgresDriver();
  for (let i = 0; i < toEmbed.length; i += CHUNK) {
    await Promise.all(
      toEmbed.slice(i, i + CHUNK).map(async (p, j) => {
        const vec = result.vectors[i + j];
        const vectorJson = JSON.stringify(vec);
        await prisma.productEmbedding.upsert({
          where: { productId: p.id },
          create: { productId: p.id, vectorJson, model: result.modelId },
          update: { vectorJson, model: result.modelId },
        });
        // Dobbelt-skriv den rigtige vektor-kolonne på Postgres (HNSW-stien).
        if (writePg) await writePgEmbedding(p.id, vec);
      }),
    );
  }

  return {
    embedded: toEmbed.length,
    skipped: total - toEmbed.length,
    total,
    modelId: result.modelId,
  };
}

// Re-export så søge-laget kan importere query-embedding fra ét sted.
export { embedQuery };
