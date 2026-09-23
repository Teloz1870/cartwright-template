# Running on Supabase / Postgres (advanced, optional)

> **Cartwright's default and only CI-tested database is Turso (libSQL).** The
> engine and all three reference deploys run on Turso. This guide is an
> **advanced, opt-in** path for operators who specifically want to self-host on
> Supabase Postgres. It is not exercised by CI — **verify on a staging
> environment before trusting it in production.**

For the default setup, see `DEPLOY.md §2` and [api-keys.md](api-keys.md#environment-dependency--preflight).

---

## How the datasource works today

Cartwright's schema is authored for SQLite/libSQL:

```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"          // Turso is SQLite-compatible (libSQL)
  url      = env("DATABASE_URL")
}
```

At runtime, [`lib/db.ts`](../lib/db.ts) (`makePrismaClient()`) picks the driver:

- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` set → connect through the
  **`PrismaLibSQL`** adapter (Turso). *(default)*
- Else `DATABASE_DRIVER=postgres` → connect through the **`PrismaPg`** adapter
  using `DATABASE_URL` (the opt-in Postgres path described below; added in Hul
  A-2). Only accepted once the schema provider is `postgresql` and regenerated —
  see the provider note in the next section.
- Otherwise → a local SQLite file via `DATABASE_URL` (dev only). In production
  without Turso vars the app **refuses to boot** (an ephemeral serverless
  SQLite file loses data every deploy) unless `ALLOW_SQLITE_IN_PRODUCTION=1`.

The `datasource.url` is only a fallback for the Prisma CLI; runtime queries go
through the adapter.

## What switching to Postgres requires

This is a **provider change**, not a config toggle. At minimum:

1. **Schema provider** — change `datasource.db.provider` to `"postgresql"`.
   Because the schema is written for SQLite, review it for type/default
   differences when you do this (Postgres-native types, `Json` columns,
   case-sensitivity, any SQLite-specific defaults). Treat the first
   `prisma validate` / `prisma db push` against an empty Postgres DB as the
   checklist of what needs adjusting.
2. **Driver** — the `@prisma/adapter-pg` branch now **ships built-in** in
   `makePrismaClient()`, gated on `DATABASE_DRIVER=postgres` (added in Hul A-2).
   Set `DATABASE_DRIVER=postgres` and point `DATABASE_URL` at Postgres; leave
   `TURSO_*` unset. NB: Prisma 7 bakes the provider into the generated client and
   **rejects a pg adapter against a sqlite-generated client** (`The Driver Adapter
   … is not compatible with the provider "sqlite"`), so the adapter is only
   accepted *after* step 1's provider change has been `prisma generate`d. The
   committed default stays `sqlite`/Turso — the provider change lives in a
   self-host fork / demo branch, not on `main`.
3. **Connection string** — from Supabase → *Project Settings → Database*:
   - **App runtime on Vercel/serverless:** use the **connection pooler**
     (Supavisor) URL, transaction mode, port **6543**. Serverless functions open
     many short-lived connections; the pooler is mandatory to avoid exhausting
     Postgres connection slots.
   - **Migrations / `db push`:** use the **direct** connection (port **5432**),
     which supports the DDL and session features the pooler doesn't.
4. **Apply the schema** with **`prisma db push`** — **not** `prisma migrate
   deploy`. The repo's from-zero migration history is known-broken; `db push` is
   the supported sync path (this constraint is the same on Turso).

## Security posture — RLS on, Data API off

This is the important part, and it is **counter-intuitive**.

Cartwright connects to Postgres as a **privileged role** (the credentials in your
connection string). Postgres **Row Level Security policies do not apply to the
table owner / `BYPASSRLS` roles** — so RLS is *not* what protects your data from
the application's own connection. Every Cartwright query already runs with full
rights, exactly as it does on Turso. Authorization is enforced in the
**application layer** — API-key scopes and the single `invokeTool` chokepoint
(see [scopes-and-tools.md](scopes-and-tools.md)), not in the database.

The real Supabase-specific exposure is the **auto-generated Data API
(PostgREST)**: Supabase can serve every table in the `public` schema over HTTPS
using the project's `anon` / `service_role` keys. If that is enabled and a key
leaks, your tables are reachable **outside** Prisma and outside the scope system.

Therefore:

- **Keep the Data API disabled** (Supabase → *Project Settings → Data API* →
  restrict/disable the exposed schemas), or at minimum never ship the `anon`
  key anywhere and don't expose `public`. Cartwright never uses PostgREST — it
  talks to Postgres directly via Prisma — so disabling it costs you nothing.
- **Enable RLS on every table anyway**, as defense-in-depth: if the Data API is
  ever turned on by accident, RLS-with-no-policies denies all anon access by
  default. New Supabase tables in `public` get RLS-enabled by default; verify it
  stayed on after `prisma db push` (Prisma's DDL does not manage RLS, so check
  the dashboard and add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` for any
  table created without it).
- **Never commit the connection string or the `service_role` key.** They go in
  env (`DATABASE_URL`) and your secret manager. `AUTH_SECRET` is still required
  (it peppers API-key hashes — see [api-keys.md](api-keys.md)).

## Optional: pgvector semantic search (opt-in accelerator)

This is a **second opt-in layer on top of** the Postgres path, added in Hul A-2
(see [HUL-A2-PGVECTOR.md](HUL-A2-PGVECTOR.md)). It is **not required** to run on
Postgres. Cartwright's default semantic search (Hul A) computes cosine similarity
in TypeScript and works on Turso/SQLite — fine to ~10k products. pgvector moves the
vector search into an indexed in-database ANN query (HNSW) for larger catalogs.

`hybridRankProducts` (`lib/search/semantic.ts`) branches on `DATABASE_DRIVER=postgres`:
the Postgres path runs `prisma.$queryRaw … ORDER BY embedding <=> $query::vector`,
over-fetches, then re-applies the **same** lexical boost in TS — so the ranking
formula is identical to the Turso path (parity-first). `backfillProductEmbeddings`
dual-writes the real `vector` column alongside the portable `vectorJson`.

**The `vector` column + index are NOT managed by Prisma.** The schema stays
provider-agnostic at the model level; the `embedding vector(768)` column and HNSW
index are added by raw SQL that Prisma doesn't know about. They **survive `prisma db
push`** (push only touches columns it knows) — but **`prisma db push --force-reset`
drops the table and the column; re-run `pnpm pgvector:setup` afterwards.** Run once
after `db push`:

```sql
create extension if not exists vector;
alter table "ProductEmbedding" add column if not exists embedding vector(768);
create index if not exists product_embedding_hnsw
  on "ProductEmbedding" using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
```

`pnpm pgvector:setup` runs exactly this (idempotent). **HNSW, not IVFFlat:** no
training step → it builds on an empty/tiny table and never needs a rebuild as the
catalog grows. The column is `vector(768)` to match Gemini `text-embedding-004` /
Ollama `nomic-embed-text`; change both the column dimension and the index if you
switch embedding models.

**Supabase specifics:** enable the `vector` extension (Database → Extensions, or the
`create extension` above). Keep the **Data API disabled** (as the security section
above already mandates) so the `embedding` column is never reachable via PostgREST —
Cartwright reads it only through Prisma/`$queryRaw`, inside the scope system.

Then `pnpm embeddings:backfill` (writes both `vectorJson` and `embedding`).
**Verify:** `EXPLAIN ANALYZE` the ANN query shows an HNSW index scan; the Postgres
path returns the same top-N ids in the same order as the Turso TS path for the same
query/catalog.

## Summary checklist

- [ ] `datasource.provider = "postgresql"`, schema reviewed for SQLite→PG diffs, `prisma generate` run.
- [ ] `DATABASE_DRIVER=postgres` set (selects the built-in `@prisma/adapter-pg` branch); `TURSO_*` left unset.
- [ ] App `DATABASE_URL` = Supavisor pooler (6543, transaction mode); migrations/setup use direct (5432).
- [ ] Schema applied with `prisma db push`.
- [ ] Supabase Data API disabled; `anon` key not exposed.
- [ ] RLS enabled on all tables (defense-in-depth).
- [ ] `AUTH_SECRET` + Stripe/other secrets set; nothing committed.
- [ ] Full smoke on staging — this path is not covered by Cartwright CI.

**pgvector (optional, only if using semantic search at scale):**
- [ ] `vector` extension enabled; `pnpm pgvector:setup` run (embedding column + HNSW index created).
- [ ] `pnpm embeddings:backfill` run; `SELECT count(*) FROM "ProductEmbedding" WHERE embedding IS NOT NULL` = catalog size.
- [ ] `EXPLAIN ANALYZE` confirms HNSW index scan; parity with the Turso TS path verified.
- [ ] Re-run `pnpm pgvector:setup` after any `db push --force-reset` (drops the unmanaged column).
