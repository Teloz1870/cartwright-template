import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@libsql/client";

/**
 * One-shot Prisma-migration runner via the libSQL adapter, callable from
 * the Vercel runtime where TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are in
 * `process.env` even though they're marked Sensitive (and thus unreadable
 * by humans or `vercel env pull`).
 *
 * **WHY THIS EXISTS**
 * Prisma 6's sqlite migration engine rejects `libsql://` URLs (P1012).
 * Standard `prisma migrate deploy` doesn't work against Turso, so on
 * canaries where the DB schema has drifted we either need (a) to extract
 * TURSO credentials and use scripts/migrate-turso.ts (blocked by Sensitive
 * env-var design), or (b) run the migration logic inside the Vercel
 * runtime where the secrets exist. This route is (b).
 *
 * **WHY THIS IS SAFE**
 * - Requires `Authorization: Bearer ${CRON_SECRET}` header (same pattern as
 *   our existing cron routes).
 * - Idempotent: reads `_prisma_migrations` ledger, skips already-applied.
 *   Re-running on a clean DB reports "0 pending".
 * - Migrations themselves are all additive (CREATE TABLE / ALTER TABLE
 *   ADD COLUMN) — no destructive ops in the pending set.
 * - Returns JSON with applied/skipped counts so the caller knows what
 *   happened. NEVER logs the auth token.
 *
 * **HOW TO REMOVE**
 * After each canary's DB is migrated, delete this route in a follow-up PR
 * and redeploy. The route's surface area is intentionally minimal so it
 * can be removed without ripple effects.
 *
 * **USAGE**
 *   curl -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<deploy>.vercel.app/api/admin/run-pending-migrations
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Migrations are fast (additive DDL); 60s ceiling.

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function cleanEnv(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

export async function POST(request: NextRequest) {
  // Auth — Bearer CRON_SECRET (matches existing cron-route pattern)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on this deploy" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read Turso creds from runtime env (Sensitive but accessible to functions)
  const tursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
  const tursoToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);
  if (!tursoUrl || !tursoToken) {
    return NextResponse.json(
      {
        error:
          "TURSO_DATABASE_URL or TURSO_AUTH_TOKEN missing in runtime env",
      },
      { status: 500 },
    );
  }

  const client = createClient({ url: tursoUrl, authToken: tursoToken });

  // Host (no token) goes back in response so caller knows which DB was touched
  const host = tursoUrl.replace(/^libsql:\/\//, "").replace(/\?.*$/, "");

  const log: string[] = [];

  try {
    // 1. Ensure ledger table exists
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

    // 2. Read disk migrations
    const dirEntries = readdirSync(MIGRATIONS_DIR)
      .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
      .sort();

    if (dirEntries.length === 0) {
      return NextResponse.json(
        { error: "No migrations found on disk", host },
        { status: 500 },
      );
    }
    log.push(`Found ${dirEntries.length} migration(s) on disk`);

    // 3. Read already-applied
    const appliedRows = await client.execute({
      sql: "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL",
      args: [],
    });
    const applied = new Set<string>(
      appliedRows.rows.map((row) => String(row.migration_name)),
    );
    log.push(`Already applied: ${applied.size}`);

    // 4. Find pending
    const pending = dirEntries.filter((name) => !applied.has(name));
    if (pending.length === 0) {
      return NextResponse.json({
        host,
        appliedBefore: applied.size,
        applied: 0,
        skipped: dirEntries.length,
        pending: [],
        log: [...log, "Nothing to do — DB is up to date."],
      });
    }
    log.push(`Pending: ${pending.length}`);

    // 5. Apply each
    const appliedNames: string[] = [];
    for (const name of pending) {
      const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
      const sql = readFileSync(sqlPath, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      const statements = sql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const startedAt = new Date().toISOString();
      let appliedSteps = 0;

      try {
        for (const stmt of statements) {
          await client.execute(stmt);
          appliedSteps++;
        }

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

        appliedNames.push(name);
        log.push(`  ✓ ${name} (${appliedSteps} stmt)`);
      } catch (err) {
        log.push(
          `  ✗ ${name} failed after ${appliedSteps} stmt: ${(err as Error).message}`,
        );
        return NextResponse.json(
          {
            host,
            appliedBefore: applied.size,
            applied: appliedNames.length,
            failed: name,
            log,
            error: (err as Error).message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      host,
      appliedBefore: applied.size,
      applied: appliedNames.length,
      skipped: applied.size,
      pendingApplied: appliedNames,
      log,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, host, log },
      { status: 500 },
    );
  }
}
