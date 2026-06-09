#!/usr/bin/env tsx
/**
 * Hul A-2 — pgvector-opsætning for semantisk søgning på Postgres/Supabase.
 *
 * Idempotent. Opretter `vector`-extensionen, en `embedding vector(768)`-kolonne
 * på `ProductEmbedding`, og et HNSW-cosine-indeks. Disse objekter styres IKKE af
 * Prisma (schema'et er `provider = "sqlite"`) — de overlever `prisma db push`
 * fordi push kun rører kolonner det kender. ADVARSEL: `db push --force-reset`
 * dropper tabellen (og dermed kolonnen) — kør scriptet igen bagefter.
 *
 * Kør én gang EFTER `pnpm db:push` mod en frisk Postgres-DB, derefter
 * `pnpm embeddings:backfill` så vektorerne skrives til embedding-kolonnen.
 *
 * Kræver: DATABASE_DRIVER=postgres + DATABASE_URL = den DIREKTE forbindelse
 * (Supabase: port 5432) — DDL kører ikke gennem Supavisor-pooleren.
 *
 * Usage:
 *   DATABASE_DRIVER=postgres DATABASE_URL=postgres://… pnpm pgvector:setup
 */

import { prisma, isPostgresDriver } from "@/lib/db";

// Gemini text-embedding-004 / Ollama nomic-embed-text → 768 dimensioner. Skift
// embedding-model? Så skal både kolonne-dimensionen og indekset ændres.
const DIM = 768;

async function main() {
  if (!isPostgresDriver()) {
    console.error(
      "[pgvector-setup] DATABASE_DRIVER != 'postgres'. Sæt " +
        "DATABASE_DRIVER=postgres + DATABASE_URL til din Postgres/Supabase-" +
        "forbindelse (direkte 5432) og kør igen.",
    );
    process.exit(1);
  }

  console.log("[pgvector-setup] aktiverer vector-extension…");
  await prisma.$executeRawUnsafe(`create extension if not exists vector;`);

  console.log(`[pgvector-setup] tilføjer embedding vector(${DIM})-kolonne…`);
  await prisma.$executeRawUnsafe(
    `alter table "ProductEmbedding" add column if not exists embedding vector(${DIM});`,
  );

  console.log("[pgvector-setup] bygger HNSW-cosine-indeks (kan tage lidt tid)…");
  await prisma.$executeRawUnsafe(
    `create index if not exists product_embedding_hnsw ` +
      `on "ProductEmbedding" using hnsw (embedding vector_cosine_ops) ` +
      `with (m = 16, ef_construction = 64);`,
  );

  console.log(
    "[pgvector-setup] færdig. Kør nu `pnpm embeddings:backfill` så vektorerne " +
      "skrives til både vectorJson og embedding-kolonnen.",
  );
}

main()
  .catch((err) => {
    console.error("[pgvector-setup] fejlede:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
