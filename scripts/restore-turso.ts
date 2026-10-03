/**
 * Gendan en logisk backup (scripts/backup-turso.ts) ind i en Turso/libSQL-DB.
 *
 * GENDANNELSE ER DESTRUKTIV og køres ALDRIG automatisk. Kræver et eksplicit
 * --confirm-flag; uden det er det en dry-run der kun rapporterer hvad der ville
 * ske. Schemaet skal være anvendt FØRST (npx tsx scripts/migrate-turso.ts mod
 * target-DB'en); dette script indsætter kun DATA.
 *
 * Usage:
 *   # Dry-run (DEFAULT) — viser tabeller + row-counts i backuppen:
 *   TURSO_DATABASE_URL="libsql://<TARGET>…" TURSO_AUTH_TOKEN="…" \
 *     npx tsx scripts/restore-turso.ts backups/backup-<ts>.json
 *
 *   # Faktisk gendannelse (mod en FRISK / tom target-DB):
 *     … npx tsx scripts/restore-turso.ts backups/backup-<ts>.json --confirm
 *
 * Pattern: foreign_keys slås fra under indsættelse (rækkefølge-uafhængig), så på
 * igen. _prisma_migrations springes over (ledger kommer fra migrate-turso).
 */
import { createClient, type InValue } from "@libsql/client";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
const CONFIRM = argv.includes("--confirm");
const SKIP_TABLES = new Set(["_prisma_migrations"]);

function fail(msg: string): never {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}
function info(msg: string) {
  console.log(`ℹ️   ${msg}`);
}
function ok(msg: string) {
  console.log(`✅  ${msg}`);
}

function cleanEnv(raw: string | undefined, name: string): string {
  if (!raw || raw.trim() === "") fail(`${name} er tom/unset.`);
  return raw!
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function main() {
  if (!file) fail("Angiv stien til backup-JSON: npx tsx scripts/restore-turso.ts <fil> [--confirm]");

  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    host?: string;
    data: Record<string, Record<string, InValue>[]>;
  };
  const data = raw.data ?? {};
  const tables = Object.keys(data).filter((t) => !SKIP_TABLES.has(t));

  const url = cleanEnv(process.env.TURSO_DATABASE_URL, "TURSO_DATABASE_URL");
  const authToken = cleanEnv(process.env.TURSO_AUTH_TOKEN, "TURSO_AUTH_TOKEN");
  const host = url.replace(/^libsql:\/\//, "").replace(/\?.*$/, "");
  info(`Backup fra: ${raw.host ?? "(ukendt)"}`);
  info(`Target DB:  libsql://${host}`);
  for (const t of tables) info(`  ${t}: ${data[t].length} rækker`);

  if (!CONFIRM) {
    ok("Dry-run — intet gendannet. Kør med --confirm mod en frisk DB for at gendanne.");
    return;
  }

  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys=OFF");
  let total = 0;
  for (const table of tables) {
    const rows = data[table];
    for (const row of rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => "?").join(", ");
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const args = cols.map((c) => row[c] ?? null) as InValue[];
      await client.execute({
        sql: `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
        args,
      });
      total++;
    }
    info(`  gendannet ${rows.length} → ${table}`);
  }
  await client.execute("PRAGMA foreign_keys=ON");
  ok(`Gendannelse færdig — ${total} rækker i ${tables.length} tabeller.`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
