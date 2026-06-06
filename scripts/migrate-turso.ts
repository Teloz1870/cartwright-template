/**
 * Apply pending Prisma migrations to a Turso database via @libsql/client.
 *
 * Why this exists: Prisma 6's sqlite migration engine only accepts `file:`
 * URLs — it rejects `libsql://`. The standard workflow says to use the
 * `@prisma/adapter-libsql` driver-adapter for runtime queries (see lib/db.ts)
 * but Prisma's CLI `migrate deploy` does NOT yet route through the adapter
 * for the migration engine (as of 6.19). This script bridges that gap.
 *
 * Pattern mirrors lib/db.ts:36-44 — libsql client → tagged-template execution
 * → idempotent application of each migration.sql in `prisma/migrations/`.
 *
 * Usage (one project at a time):
 *
 *   TURSO_DATABASE_URL="libsql://<host>?authToken=..." \
 *   TURSO_AUTH_TOKEN="<token>" \
 *     npx tsx scripts/migrate-turso.ts
 *
 * Get the values from Vercel dashboard → <project> → Settings → Environment
 * Variables → click eye-icon to reveal. NEVER commit them.
 *
 * Behavior:
 *   1. Reads pending migrations from `prisma/migrations/<dir>/migration.sql`
 *      sorted lexicographically (= chronological by timestamp prefix).
 *   2. Connects via libsql client to TURSO_DATABASE_URL with TURSO_AUTH_TOKEN.
 *   3. Ensures `_prisma_migrations` table exists (Prisma's own ledger format).
 *   4. Skips migrations already in the ledger.
 *   5. For each pending migration:
 *      a) Splits its migration.sql into statements (naive `;`-split — safe
 *         here because Prisma-generated migrations don't use procedural
 *         blocks or string-literal semicolons in DDL).
 *      b) Executes each statement via the libsql adapter.
 *      c) Inserts a row into `_prisma_migrations` recording success.
 *   6. Exits non-zero on any failure — DB is left in known partial-applied
 *      state recoverable by re-running.
 *
 * Idempotent: safe to re-run. Already-applied migrations skip cleanly.
 */
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function fail(msg: string): never {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`✅  ${msg}`);
}

function info(msg: string) {
  console.log(`ℹ️   ${msg}`);
}

function pickEnv(name: string): string {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") {
    fail(
      `${name} is empty or unset. Reveal it in Vercel dashboard → Settings → Environment Variables, then export it before running this script.`,
    );
  }
  // Strip invisible chars + surrounding quotes (same logic as lib/db.ts:cleanEnv)
  return raw
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function main() {
  const url = pickEnv("TURSO_DATABASE_URL");
  const authToken = pickEnv("TURSO_AUTH_TOKEN");

  // Reveal which DB we're about to mutate (host only — never log the token)
  const host = url.replace(/^libsql:\/\//, "").replace(/\?.*$/, "");
  info(`Target DB: libsql://${host}`);
  info(`Migrations dir: ${MIGRATIONS_DIR}`);

  const client = createClient({ url, authToken });

  // 1. Make sure Prisma's migration-ledger table exists (matches the schema
  //    Prisma uses internally so future `prisma migrate status` reads it).
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id                      TEXT PRIMARY KEY NOT NULL,
      checksum                TEXT NOT NULL,
      finished_at             DATETIME,
      migration_name          TEXT NOT NULL,
      logs                    TEXT,
      rolled_back_at          DATETIME,
      started_at              DATETIME NOT NULL DEFAULT current_timestamp,
      applied_steps_count     INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  // 2. Read all migrations on disk in order
  const dirEntries = readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      const full = join(MIGRATIONS_DIR, name);
      return statSync(full).isDirectory();
    })
    .sort();

  if (dirEntries.length === 0) {
    fail("No migrations found in prisma/migrations/");
  }
  info(`Found ${dirEntries.length} migration(s) on disk`);

  // 3. Read already-applied migrations from the ledger
  const appliedRows = await client.execute({
    sql: "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL",
    args: [],
  });
  const applied = new Set<string>(
    appliedRows.rows.map((row) => String(row.migration_name)),
  );
  info(`Already applied: ${applied.size}`);

  // 4. Find pending
  const pending = dirEntries.filter((name) => !applied.has(name));
  if (pending.length === 0) {
    ok("Nothing to do — DB is up to date.");
    return;
  }
  info(`Pending: ${pending.length}`);
  for (const name of pending) {
    console.log(`    • ${name}`);
  }

  // 5. Apply each pending migration in order
  for (const name of pending) {
    const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
    let sql: string;
    try {
      sql = readFileSync(sqlPath, "utf8");
    } catch (err) {
      fail(`Cannot read ${sqlPath}: ${(err as Error).message}`);
    }

    const checksum = createHash("sha256").update(sql).digest("hex");

    // Split on semicolons that end statements. Strip comments first so we
    // don't choke on `-- foo;` inside a comment.
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`\n→ Applying ${name} (${statements.length} statement${statements.length === 1 ? "" : "s"})`);

    const startedAt = new Date().toISOString();
    let appliedSteps = 0;

    try {
      for (const stmt of statements) {
        await client.execute(stmt);
        appliedSteps++;
      }

      // Mark applied in ledger
      await client.execute({
        sql: `INSERT INTO _prisma_migrations
              (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          checksum,
          new Date().toISOString(),
          name,
          startedAt,
          appliedSteps,
        ],
      });

      ok(`  ${name}`);
    } catch (err) {
      // Don't insert ledger row on failure — re-run will retry this migration
      fail(
        `Failed on ${name} after ${appliedSteps} statement(s): ${(err as Error).message}\n\nDB is in known partial-applied state. Inspect the schema and re-run after manually cleaning up the failed migration's effects.`,
      );
    }
  }

  ok(`\nAll ${pending.length} pending migration(s) applied. DB schema is now at v0.8.0 parity.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
