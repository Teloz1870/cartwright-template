#!/usr/bin/env tsx
/**
 * Hul A — backfill semantiske produkt-embeddings.
 *
 * Embedder alle ikke-slettede produkter og gemmer vektorerne i
 * `ProductEmbedding` (genbruges af hybrid-søgningen i lib/search/). Idempotent:
 * springer produkter over der allerede har en embedding med den aktuelle model,
 * medmindre `--force` er sat (fx efter provider-skift).
 *
 * Kræver en embedding-provider: enten `googleGeminiApiKey` i /admin/integrations
 * (eller GOOGLE_GEMINI_API_KEY i .env), ellers en lokal Ollama-endpoint.
 *
 * Usage:
 *   pnpm embeddings:backfill           # kun manglende
 *   pnpm embeddings:backfill --force   # re-embed alle
 */

import { backfillProductEmbeddings } from "@/lib/search/product-embeddings";

async function main() {
  const force = process.argv.includes("--force");
  console.log(
    `[backfill-embeddings] starter${force ? " (force re-embed)" : ""}…`,
  );

  const result = await backfillProductEmbeddings(force);

  if (result.total === 0) {
    console.log("[backfill-embeddings] ingen produkter i kataloget.");
    return;
  }
  if (result.embedded === 0 && result.modelId === null && result.skipped === result.total) {
    console.warn(
      "[backfill-embeddings] embeddede 0 — ingen embedding-provider konfigureret? " +
        "Sæt googleGeminiApiKey i /admin/integrations eller en lokal Ollama-endpoint.",
    );
    return;
  }

  console.log(
    `[backfill-embeddings] færdig: embeddede ${result.embedded}, ` +
      `sprang ${result.skipped} over (af ${result.total}) ` +
      `med model ${result.modelId ?? "—"}.`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-embeddings] fejlede:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
