/**
 * Delt backup-kerne: logisk dump af Turso/libSQL → JSON + upload til Vercel Blob.
 * Bruges af BÅDE scripts/backup-turso.ts (operatør-CLI) og /api/cron/backup
 * (planlagt). INGEN "server-only" — modulet skal kunne importeres af et rent
 * Node/tsx-script.
 *
 * Connecter via TURSO_DATABASE_URL/TURSO_AUTH_TOKEN (samme env som lib/db.ts).
 */
import { createClient, type Client } from "@libsql/client";

export type BackupPayload = {
  createdAt: string;
  host: string;
  tableCount: number;
  counts: Record<string, number>;
  mediaAssetInventory: unknown[];
  data: Record<string, unknown[]>;
};

function cleanEnv(raw: string | undefined, name: string): string {
  if (!raw || raw.trim() === "") {
    throw new Error(`${name} er tom/unset.`);
  }
  return raw
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

export function backupClient(): { client: Client; host: string } {
  const url = cleanEnv(process.env.TURSO_DATABASE_URL, "TURSO_DATABASE_URL");
  const authToken = cleanEnv(process.env.TURSO_AUTH_TOKEN, "TURSO_AUTH_TOKEN");
  const host = url.replace(/^libsql:\/\//, "").replace(/\?.*$/, "");
  return { client: createClient({ url, authToken }), host };
}

async function listTables(client: Client): Promise<string[]> {
  const res = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return res.rows.map((r) => String(r.name));
}

/** Læs alle tabeller som rækker. Ren read. */
export async function dumpDatabase(): Promise<BackupPayload> {
  const { client, host } = backupClient();
  const tables = await listTables(client);
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const res = await client.execute(`SELECT * FROM "${table}"`);
    data[table] = res.rows.map((r) => ({ ...r }));
    counts[table] = res.rows.length;
  }
  return {
    createdAt: new Date().toISOString(),
    host,
    tableCount: tables.length,
    counts,
    mediaAssetInventory: data["MediaAsset"] ?? [],
    data,
  };
}

/** Tæl rækker pr. tabel UDEN at hente data (til dry-run/preview). */
export async function previewCounts(): Promise<{ host: string; counts: Record<string, number> }> {
  const { client, host } = backupClient();
  const tables = await listTables(client);
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const res = await client.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
    counts[table] = Number(res.rows[0]?.n ?? 0);
  }
  return { host, counts };
}

/** JSON.stringify der håndterer BigInt (libSQL integers). */
export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(
    payload,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
}

/** Upload en backup-JSON til Vercel Blob som PRIVATE (rummer PII). */
export async function uploadBackupToBlob(
  json: string,
  filename: string,
): Promise<{ pathname: string }> {
  const token = cleanEnv(process.env.BLOB_READ_WRITE_TOKEN, "BLOB_READ_WRITE_TOKEN");
  const { put } = await import("@vercel/blob");
  const blob = await put(`backups/${filename}`, json, {
    access: "private", // backup rummer PII — ALDRIG public
    contentType: "application/json",
    token,
    addRandomSuffix: false,
  });
  return { pathname: blob.pathname };
}

export function backupFilename(createdAt: string): string {
  return `backup-${createdAt.replace(/[:.]/g, "-")}.json`;
}
