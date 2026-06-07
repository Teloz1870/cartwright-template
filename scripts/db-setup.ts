/**
 * Robust first-run database setup — never gets stuck on the flaky Prisma 7.8
 * schema-engine error.
 *
 * Background: on some machines (seen on macOS arm64 + Node 24) `prisma db push`
 * intermittently dies with a BLANK `Schema engine error:` during its
 * connect-and-apply step. It's not a config problem — the binary and schema are
 * fine, and `prisma migrate diff --from-empty` (schema → SQL, NO db connection)
 * is reliable while `db push` (db connection + apply) is what flakes. "Just run
 * it again" is not a fix: a customer can hit it many times in a row.
 *
 * This script guarantees a usable DB:
 *   1. Fast path — try `prisma db push` (the normal flow).
 *   2. Fallback — if that fails, generate the schema SQL via
 *      `prisma migrate diff --from-empty --to-schema-datamodel` and apply it
 *      directly with the libSQL client, bypassing the schema engine entirely.
 *      (Same proven bypass as scripts/migrate-turso.ts.)
 *   3. Verify the tables exist, then seed — but ONLY if the DB is fresh
 *      (0 users), so re-running never wipes an existing shop's data/admin.
 *
 * Usage:  pnpm db:setup   (or  npm run db:setup  /  npx tsx scripts/db-setup.ts)
 * Test the fallback explicitly:  CARTWRIGHT_FORCE_DB_FALLBACK=1 pnpm db:setup
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";

function info(msg: string) {
  console.log(`ℹ️   ${msg}`);
}
function ok(msg: string) {
  console.log(`✅  ${msg}`);
}
function warn(msg: string) {
  console.warn(`⚠️   ${msg}`);
}
function fail(msg: string): never {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

/** Same aggressive env cleaning as lib/db.ts:cleanEnv (printable ASCII + strip quotes). */
function cleanEnv(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw.replace(/[^\x20-\x7E]/g, "").trim();
  const unquoted = stripped.replace(/^["']|["']$/g, "");
  return unquoted || undefined;
}

type Target = { url: string; authToken?: string; isTurso: boolean };

/** Resolve the DB the CLI + runtime point at — Turso if set, else local SQLite file. */
function resolveTarget(): Target {
  const tursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
  const tursoToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);
  if (tursoUrl && tursoToken) {
    return { url: tursoUrl, authToken: tursoToken, isTurso: true };
  }
  const fileUrl = cleanEnv(process.env.DATABASE_URL) ?? "file:./dev.db";
  return { url: fileUrl, isTurso: false };
}

function libsql(target: Target): Client {
  return createClient(
    target.authToken ? { url: target.url, authToken: target.authToken } : { url: target.url },
  );
}

/**
 * Run a prisma CLI subcommand. stdout and stderr are kept SEPARATE on purpose:
 * `migrate diff --script` writes pure SQL to stdout, while Prisma's CLI writes
 * status spinners (clack glyphs like ◇/◆) to stderr — mixing them corrupts the
 * SQL ("near ◇: syntax error").
 */
function runPrisma(
  args: string[],
  opts: { capture: boolean },
): { ok: boolean; stdout: string; stderr: string } {
  const res = spawnSync("npx", ["prisma", ...args], {
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  return { ok: res.status === 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** Step 1: the normal `prisma db push`. Returns true on success. */
function tryDbPush(): boolean {
  info("Trying `prisma db push` …");
  const res = runPrisma(["db", "push", "--skip-generate"], { capture: true });
  if (res.ok) {
    ok("Schema applied via `prisma db push`.");
    return true;
  }
  // Surface the real (often blank) error so it's not a silent failure.
  const trimmed = `${res.stdout}${res.stderr}`.trim();
  warn(
    `\`prisma db push\` failed${
      trimmed ? ` — engine said:\n${trimmed}` : " with a blank Schema engine error"
    }`,
  );
  info("Falling back to libSQL-direct schema apply (bypasses the schema engine) …");
  return false;
}

/** Step 2 fallback: generate DDL via migrate diff (no db connection) + apply via libSQL. */
async function applySchemaViaLibsql(target: Target): Promise<void> {
  // migrate diff --from-empty --to-schema computes CREATE-TABLE SQL from the
  // LIVE schema without opening a DB connection — the reliable path. Write to a
  // file via --output (NOT stdout): Prisma 7's CLI interleaves clack status
  // glyphs (◇/◆) into stdout, which would corrupt the SQL ("near ◇: syntax error").
  const tmpDir = mkdtempSync(join(tmpdir(), "cartwright-schema-"));
  const sqlFile = join(tmpDir, "schema.sql");
  const diff = runPrisma(
    ["migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script", "--output", sqlFile],
    { capture: true },
  );
  let sql = "";
  try {
    sql = readFileSync(sqlFile, "utf8");
  } catch {
    /* file not written — handled by the guard below */
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  if (!diff.ok || !sql.trim()) {
    fail(
      "The Prisma schema engine could not produce the schema SQL either — it failed to start at all.\n" +
        `Captured output:\n${`${diff.stdout}${diff.stderr}`.trim() || "(blank)"}\n\n` +
        "This usually means a Node/Prisma incompatibility. Try a tested LTS:\n" +
        "  nvm install 22 && nvm use 22 && pnpm db:setup",
    );
  }

  // Split into executable statements — strip comment lines, split on `;`.
  // Safe for Prisma-generated DDL (no procedural blocks / string-literal `;`).
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  info(`Applying ${statements.length} statement(s) via libSQL …`);
  const client = libsql(target);
  try {
    for (const raw of statements) {
      // Make DDL idempotent so a partially-applied run (e.g. an earlier crash
      // mid-fallback) can be re-run cleanly instead of "table X already exists".
      const stmt = raw
        .replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ")
        .replace(/^CREATE UNIQUE INDEX /i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
        .replace(/^CREATE INDEX /i, "CREATE INDEX IF NOT EXISTS ");
      await client.execute(stmt);
    }
  } catch (err) {
    fail(`libSQL apply failed: ${(err as Error).message}`);
  } finally {
    client.close();
  }
  ok("Schema applied via libSQL fallback.");
}

/** Confirm a known table exists; return the User row count (-1 if table missing). */
async function userCount(target: Target): Promise<number> {
  const client = libsql(target);
  try {
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='User'",
    );
    if (tables.rows.length === 0) return -1;
    const res = await client.execute("SELECT COUNT(*) AS c FROM User");
    return Number(res.rows[0]?.c ?? 0);
  } finally {
    client.close();
  }
}

async function main() {
  const target = resolveTarget();
  info(`Target DB: ${target.isTurso ? target.url.replace(/\?.*$/, "") : target.url}`);

  const forceFallback = process.env.CARTWRIGHT_FORCE_DB_FALLBACK === "1";
  if (forceFallback) {
    warn("CARTWRIGHT_FORCE_DB_FALLBACK=1 — skipping db push, testing the fallback path.");
  }

  // Is the DB already initialized? (-1 = no User table yet = fresh.) This keeps
  // re-runs safe: never run the from-empty fallback against an existing schema.
  const alreadyInitialized = (await userCount(target)) >= 0;

  if (alreadyInitialized) {
    info("Schema already present — syncing changes via `prisma db push` (best-effort) …");
    if (!forceFallback) {
      const r = runPrisma(["db", "push", "--skip-generate"], { capture: true });
      if (r.ok) ok("Schema synced.");
      else warn("`prisma db push` didn't complete, but the schema is already present — continuing.");
    }
  } else {
    const pushed = !forceFallback && tryDbPush();
    if (!pushed) {
      await applySchemaViaLibsql(target);
    }
  }

  // Verify the schema really landed.
  const count = await userCount(target);
  if (count < 0) {
    fail("Schema apply reported success but the `User` table is still missing. Aborting before seed.");
  }
  ok("Verified schema (User table present).");

  // Seed ONLY a fresh DB — the seed wipes + recreates, so never re-seed an
  // existing shop (it would destroy real data + the admin's changed password).
  if (count > 0) {
    info(`DB already has ${count} user(s) — schema synced, skipping seed (no data touched).`);
    ok("Database is ready.");
    return;
  }

  info("Fresh database — seeding admin + demo data …");
  const seeded = runPrisma(["db", "seed"], { capture: false }); // inherit stdio → show the login banner
  if (!seeded.ok) {
    fail(
      "Schema is in place but `prisma db seed` failed (see output above). " +
        "No admin was created yet — `.admin-credentials` appears only after a successful seed.",
    );
  }

  if (existsSync(join(process.cwd(), ".admin-credentials"))) {
    ok("Database ready. Your admin login is shown above and saved to .admin-credentials.");
  } else {
    ok("Database ready. Your admin login is shown above (set via ADMIN_PASSWORD — nothing written to disk).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
