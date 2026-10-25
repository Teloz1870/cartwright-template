# Hul A-2 — pgvector skalerings-sti for semantisk søgning (Supabase opt-in)

**Status: OPT-IN, INERT SOM DEFAULT.** Dette er skalerings-udvidelsen af **Hul A**
(semantisk søgning, allerede på `main`). Hele stien er gated bag env-flaget
`DATABASE_DRIVER=postgres`. Uden flaget kører Cartwright præcis som før på
Turso/libSQL (default), og den nye kode-gren er unåelig. Turso-stien er **ikke
rørt** — al ny kode er additiv.

## Hvorfor (hvilket loft Hul A efterlod)

Hul A gør cosine-similarity i TypeScript: hele kataloget hentes og scores i JS
(`lib/search/semantic.ts`). Det er fint for nuværende katalog-størrelse —
`ProductEmbedding`-kommentaren og roadmappens Hul A-skitse noterer eksplicit "ok
for nuværende katalog-størrelse (~<10.000 produkter); SQLite har ingen native
vektor". Det er en korrektheds- men ikke en skalerings-historie: load-alt-og-score
vokser lineært med kataloget.

pgvector flytter selve vektor-søgningen ind i databasen som et indekseret
ANN-opslag (HNSW) i stedet for et fuldt scan i TS. Samtidig giver det en
troværdig, delelig "Cartwright kører på Supabase"-historie (Supabases hele
semantik-tilbud *er* pgvector).

## Hvad Hul A allerede gør (uændret baseline)

- `lib/ai/embeddings.ts` — provider-routing (Gemini `text-embedding-004` 768-dim →
  Ollama `nomic-embed-text`), `embedQuery` / `embedTexts`.
- `lib/search/product-embeddings.ts` — `upsertProductEmbedding` (hook på
  create/update) + `backfillProductEmbeddings` + `scripts/backfill-embeddings.ts`.
- `lib/search/semantic.ts` — `hybridRankProducts` = cosine (Vercel AI SDK) +
  leksikalsk boost, med blød `null`-fallback til leksikalsk søgning.
- Wiret ind i begge call-sites (`lib/tools/products.ts`,
  `app/api/products/search/route.ts`). Hul A shippede **bevidst uden feature-flag**
  som ny baseline — det ændrer Hul A-2 **ikke** på.

## Hvad Hul A-2 tilføjer (additivt, opt-in)

- `lib/db.ts` — tredje driver-gren: `TURSO_*` → libSQL (default) →
  `DATABASE_DRIVER=postgres` → `@prisma/adapter-pg` → ellers lokal SQLite.
  Eksporterer `isPostgresDriver()`.
- `lib/search/semantic.ts` — `pgRankProducts()`-gren: ANN via
  `prisma.$queryRaw … ORDER BY embedding <=> $query::vector`, over-henter `limit*4`
  på cosine-afstand og lægger SÅ den **eksisterende** `lexicalBoost` oven på i TS →
  identisk `sem + lexicalBoost`-formel som TS-grenen (paritet). TS-cosine-grenen er
  uændret.
- `lib/search/product-embeddings.ts` — dobbelt-skriv den rigtige `vector`-kolonne
  (`writePgEmbedding`) kun på Postgres. `vectorJson` forbliver portabel kilde.
- `scripts/pgvector-setup.ts` (`pnpm pgvector:setup`) — idempotent extension +
  kolonne + HNSW-indeks.
- `vector`-kolonnen + HNSW-indekset styres **uden for Prisma** (rå SQL) og overlever
  `db push` (push rører kun kolonner det kender). Selve `ProductEmbedding`-modellen
  er identisk på begge providers.

**Provider er en generate-time fork — IKKE bare et env-flag.** Prisma 7 bager
datasource-provideren ind i den genererede client og afviser en pg-adapter mod et
sqlite-genereret schema (`The Driver Adapter … is not compatible with the provider
"sqlite"`). Postgres-stien kræver derfor at operatøren sætter
`datasource.provider = "postgresql"` i `prisma/schema.prisma` + kører
`prisma generate`, **udover** `DATABASE_DRIVER=postgres`. Den committede default
forbliver `sqlite`/Turso (urørt); provider-skiftet lever kun i en self-host-fork /
demo-branch. `isPostgresDriver()` + adapter-grenen i `lib/db.ts` virker først når
provideren matcher.

## Opsætnings-checkliste (Supabase/Postgres)

1. **Provider-fork:** sæt `datasource.provider = "postgresql"` i
   `prisma/schema.prisma` (gennemgå schema for SQLite→PG-typediffe, jf.
   `docs/supabase-postgres.md`) og kør `prisma generate`. Dette er en
   generate-time fork — lev den i en demo-/self-host-branch, ikke på `main`.
2. `DATABASE_DRIVER=postgres`; `TURSO_*` **unset**.
3. `DATABASE_URL` = den **direkte** forbindelse (Supabase 5432) til `db push` +
   setup; app-runtime peger på **Supavisor-pooleren** (6543, transaction-mode).
4. `pnpm db:push` (IKKE `migrate deploy` — from-zero-historikken er kendt-brudt).
5. `pnpm pgvector:setup` — opretter:
   ```sql
   create extension if not exists vector;
   alter table "ProductEmbedding" add column if not exists embedding vector(768);
   create index if not exists product_embedding_hnsw
     on "ProductEmbedding" using hnsw (embedding vector_cosine_ops)
     with (m = 16, ef_construction = 64);
   ```
   **HNSW (ikke IVFFlat):** intet trænings-trin → bygges på en tom/lille tabel og
   skal aldrig genopbygges når kataloget vokser.
6. Embedding-provider sat (Gemini-key i `/admin/integrations` eller `GOOGLE_GEMINI_API_KEY`,
   ellers lokal Ollama).
7. `pnpm embeddings:backfill` — skriver til **både** `vectorJson` og
   `embedding`-kolonnen.
8. Supabase-sikkerhed: hold **Data API (PostgREST) deaktiveret** (se
   `docs/supabase-postgres.md`) — så er `vector`-kolonnen aldrig eksponeret udenom
   Prisma/scope-systemet.

## Test før go-live

- `EXPLAIN ANALYZE` på ANN-queryen → **HNSW index scan** (ikke seq scan); model- +
  kandidat-id-filtrene gælder.
- `SELECT count(*) FROM "ProductEmbedding" WHERE embedding IS NOT NULL` = katalog-
  størrelse (dobbelt-skrivning virker).
- **Paritet:** samme query + samme katalog → Postgres-stien returnerer samme top-N
  produkt-id'er i samme rækkefølge som Turso-TS-stien (samme score-formel).
- Hele pgvector-stien er **ikke** i CI (CI kører Turso/SQLite). Smoke-test mod en
  rigtig Postgres (fx Supabase free-tier), jf. `docs/supabase-postgres.md`s
  staging-disclaimer.

## (Senere) Promovér env-gate → feature-flag

Følger roadmap-konventionen (jf. Hul C, trin 6): når stien er kørt end-to-end kan
en senere PR promovere `DATABASE_DRIVER`-env-gaten og/eller tilføje en
`semanticSearch` runtime-flag i `lib/feature-flags/manifest.ts`. Men Hul A shippede
uden flag som baseline — denne blok **ændrer ikke** den beslutning.

## Risici / åbne spørgsmål

- **Dimensions-lås:** indekset er `vector(768)` (Gemini/Ollama-defaults). Skift af
  embedding-model kræver ny kolonne-dim + indeks; model-id-guarden fejler i forvejen
  blødt til leksikalsk ved mismatch.
- **pg array-som-streng:** afbødet ved aldrig at `SELECT`'e selve vektor-kolonnen
  (kun id + skalar-afstand).
- **Over-hent `k` (`limit*4`):** trivielt sikkert ved 24 produkter; revurder ved
  10k+ (ren-ANN vs paritet-først — vi valgte paritet-først).
- **`db push --force-reset`** dropper den u-managede `embedding`-kolonne — kør
  `pnpm pgvector:setup` igen bagefter.
