import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * BACKUP-CRON-500 — measured 2026-10-24 from the Vercel logs of all three
 * canaries: `GET /api/cron/backup` passed the CRON_SECRET gate and answered
 * 500 every night, with not one line in the function log. Two canaries had no
 * Blob token at all, so the job dumped the whole database and then threw on
 * the missing token; the third had only its media store's token, and that
 * store is public — it refuses the private upload a backup is.
 *
 * Pinned here: no storage → an honest 503 before any dump; the dedicated
 * backup token wins over the media token; the media token still works alone
 * (a shop whose one store is private); every call past the CRON_SECRET gate
 * but a successful dry run leaves one greppable log line, never the token.
 */

const SECRET = "cron-secret-for-backup-test";
const BACKUP_TOKEN = "vercel_blob_rw_backupstore_s3cr3tBACKUPtoken";
const MEDIA_TOKEN = "vercel_blob_rw_mediastore_s3cr3tMEDIAtoken";
/** Our runbook, as cartwright.app publishes it — not Vercel's procedure, which connects the store. */
const RUNBOOK = "https://cartwright.app/docs/deployment/backup-restore#scheduled";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  execute: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@libsql/client", () => ({ createClient: mocks.createClient }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/backup/route";
import { uploadBackupToBlob } from "@/lib/backup/dump";
import { backupErrorMessage } from "@/lib/backup/redact";
import { resolveBackupBlobToken } from "@/lib/backup/storage";

function call(query = "") {
  return GET(
    new NextRequest(`https://shop.example/api/cron/backup${query}`, {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
  );
}

/** Every line the job wrote to the function log, error and info alike. */
function logged(): string[] {
  return [
    ...vi.mocked(console.error).mock.calls,
    ...vi.mocked(console.info).mock.calls,
  ].map((args) => args.map(String).join(" "));
}

/** The `[cron/backup]` entries, parsed. */
function entries(): Record<string, unknown>[] {
  return logged()
    .filter((l) => l.startsWith("[cron/backup] "))
    .map((l) => JSON.parse(l.slice("[cron/backup] ".length)));
}

describe("GET /api/cron/backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://shop-db.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "turso-token");
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    mocks.execute.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT name FROM sqlite_master")
        ? { rows: [{ name: "Product" }] }
        : sql.startsWith("SELECT COUNT(*)")
          ? { rows: [{ n: 1 }] }
          : { rows: [{ id: "p1" }] },
    );
    mocks.createClient.mockReturnValue({ execute: mocks.execute });
    mocks.put.mockImplementation(async (pathname: string) => ({ pathname }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("answers 503 'not configured' without a Blob token — before dumping anything", async () => {
    const res = await call();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "backup storage not configured",
      missing: "BACKUP_BLOB_READ_WRITE_TOKEN",
    });
    expect(mocks.createClient, "no dump without somewhere to put it").not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    const lines = logged().filter((l) => l.startsWith("[cron/backup] "));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].slice("[cron/backup] ".length))).toMatchObject({
      outcome: "not_configured",
      missing: "BACKUP_BLOB_READ_WRITE_TOKEN",
    });
  });

  it("tells the not_configured reader not to connect the store, and links our runbook", async () => {
    await call();

    const [entry] = entries();
    // Vercel's own private-storage procedure connects the new store to the
    // project: default BLOB_* names, Preview ticked — what the runbook forbids.
    expect(entry.detail).toContain("do not connect it to the project");
    expect(entry.detail).toContain(RUNBOOK);
    expect(entry.detail).not.toContain("vercel.com/docs");
  });

  it("uploads with BACKUP_BLOB_READ_WRITE_TOKEN, privately, when both tokens are set", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", MEDIA_TOKEN);

    const res = await call();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, tableCount: 1 });
    expect(mocks.put).toHaveBeenCalledTimes(1);
    const [pathname, , options] = mocks.put.mock.calls[0];
    expect(pathname).toMatch(/^backups\/backup-.+\.json$/);
    expect(options).toMatchObject({ access: "private", token: BACKUP_TOKEN });
    expect(entries(), "a successful run leaves one line too").toEqual([
      expect.objectContaining({
        outcome: "ok",
        pathname,
        tableCount: 1,
        storage: "BACKUP_BLOB_READ_WRITE_TOKEN",
      }),
    ]);
    for (const line of logged()) expect(line).not.toContain("s3cr3t");
  });

  it("still backs up with BLOB_READ_WRITE_TOKEN alone (a shop whose one store is private)", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", MEDIA_TOKEN);

    const res = await call();

    expect(res.status).toBe(200);
    expect(mocks.put.mock.calls[0][2]).toMatchObject({ access: "private", token: MEDIA_TOKEN });
  });

  it("logs a refused upload with its stage, variable and hint — and never the token", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", MEDIA_TOKEN);
    mocks.put.mockRejectedValue(new Error("Vercel Blob: Unknown error, please visit https://vercel.com/help."));

    const res = await call();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ ok: false, stage: "upload" });
    const lines = logged().filter((l) => l.startsWith("[cron/backup] "));
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0].slice("[cron/backup] ".length));
    expect(entry).toMatchObject({
      outcome: "failed",
      stage: "upload",
      storage: "BLOB_READ_WRITE_TOKEN",
      error: "Vercel Blob: Unknown error, please visit https://vercel.com/help.",
    });
    expect(entry.hint, "the store may be fine — the hint must not assert it is public").toMatch(
      /^If the store behind BLOB_READ_WRITE_TOKEN is public, /,
    );
    for (const line of logged()) {
      expect(line).not.toContain(MEDIA_TOKEN);
      expect(line).not.toContain("s3cr3t");
    }
  });

  it("cuts the token out of an upload error that echoes it, in the log and the response", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    mocks.put.mockRejectedValue(new Error(`Vercel Blob: access denied for token ${BACKUP_TOKEN}`));

    const res = await call();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Vercel Blob: access denied for token [redacted]");
    for (const line of logged()) {
      expect(line).not.toContain(BACKUP_TOKEN);
      expect(line).not.toContain("s3cr3t");
    }
    expect(JSON.stringify(body)).not.toContain("s3cr3t");
  });

  it("logs a failed dump as the dump stage", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    mocks.execute.mockRejectedValue(new Error("SQLITE_BUSY"));

    const res = await call();

    expect(res.status).toBe(500);
    expect(mocks.put).not.toHaveBeenCalled();
    const [line] = logged().filter((l) => l.startsWith("[cron/backup] "));
    expect(JSON.parse(line.slice("[cron/backup] ".length))).toMatchObject({
      outcome: "failed",
      stage: "dump",
      storage: "BACKUP_BLOB_READ_WRITE_TOKEN",
      error: "SQLITE_BUSY",
    });
    expect(entries()[0], "a store hint on a database failure points the wrong way").not.toHaveProperty(
      "hint",
    );
  });

  it("cuts the Turso token and an authToken= value out of a dump error, in the log and the response", async () => {
    const TURSO_TOKEN = "turso_s3cr3t_TURSOtoken";
    vi.stubEnv("TURSO_AUTH_TOKEN", TURSO_TOKEN);
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    // libsql quotes back a TURSO_DATABASE_URL that fails its URI pattern — no
    // scheme, say — whole (@libsql/core uri.js); the CLI test below measures it.
    mocks.createClient.mockImplementation(() => {
      throw new Error("The URL 'shop-db.turso.io?authToken=url_s3cr3t_value' is not in a valid format");
    });

    let res = await call();
    expect(res.status).toBe(500);
    let body = await res.json();
    expect(body.error).toBe("The URL 'shop-db.turso.io?authToken=[redacted]' is not in a valid format");

    mocks.createClient.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockRejectedValue(new Error(`SERVER_ERROR: token ${TURSO_TOKEN} was rejected`));
    res = await call("?dryRun=1");
    expect(res.status).toBe(500);
    body = await res.json();
    expect(body.error).toBe("SERVER_ERROR: token [redacted] was rejected");

    expect(entries()).toHaveLength(2);
    for (const line of logged()) expect(line).not.toContain("s3cr3t");
  });

  it("cuts a quoted TURSO_AUTH_TOKEN out of an error that echoes the token libsql was given", async () => {
    // The variable holds quotes; libsql gets the token without them (dump.ts),
    // so a server error echoes the bare token. Redacting the raw value misses it.
    vi.stubEnv("TURSO_AUTH_TOKEN", '"turso_s3cr3t_quoted"');
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    mocks.execute.mockRejectedValue(new Error("SERVER_ERROR: token turso_s3cr3t_quoted was rejected"));

    const res = await call();

    expect(mocks.createClient.mock.calls[0][0]).toMatchObject({ authToken: "turso_s3cr3t_quoted" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("SERVER_ERROR: token [redacted] was rejected");
    expect(entries()).toHaveLength(1);
    for (const line of logged()) expect(line).not.toContain("s3cr3t");
  });

  it("reports bytes as the UTF-8 size of the upload, not its string length", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    mocks.execute.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT name FROM sqlite_master")
        ? { rows: [{ name: "Customer" }] }
        : { rows: [{ id: "c1", name: "Søren Ærø", city: "Skærbæk" }] },
    );

    const res = await call();

    const uploaded = String(mocks.put.mock.calls[0][1]);
    const size = Buffer.byteLength(uploaded, "utf8");
    expect(size, "the fixture holds æøå, so bytes and string length differ").toBeGreaterThan(uploaded.length);
    expect((await res.json()).bytes).toBe(size);
    expect(entries()).toEqual([expect.objectContaining({ outcome: "ok", bytes: size })]);
  });

  it("a dry run needs no storage and says which variable a backup would use", async () => {
    let res = await call("?dryRun=1");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, dryRun: true, storage: null });

    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    res = await call("?dryRun=1");
    const body = await res.json();
    expect(body).toMatchObject({ storage: "BACKUP_BLOB_READ_WRITE_TOKEN" });
    expect(JSON.stringify(body)).not.toContain(BACKUP_TOKEN);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(entries(), "a successful dry run writes no [cron/backup] line").toEqual([]);
  });
});

describe("backupErrorMessage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("turns anything thrown that is not an Error into \"backup failed\"", () => {
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    // A thrown string or plain object can carry anything, a row of the dump included.
    expect(backupErrorMessage("SERVER_ERROR: row c1 holds soren@example.dk")).toBe("backup failed");
    expect(backupErrorMessage({ message: "shaped like an Error, is not one" })).toBe("backup failed");
    expect(backupErrorMessage(undefined)).toBe("backup failed");
    expect(backupErrorMessage(new Error("SQLITE_BUSY")), "an Error keeps its message").toBe("SQLITE_BUSY");
  });

  it("cuts an authToken= value whatever its case", () => {
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    // libsql reads only `authToken`, but a value pasted under another spelling is still a secret.
    expect(backupErrorMessage(new Error("The URL 'db.turso.io?AUTHTOKEN=url_s3cr3t' is not in a valid format"))).toBe(
      "The URL 'db.turso.io?AUTHTOKEN=[redacted]' is not in a valid format",
    );
  });
});

describe("backup storage resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("lets a blank or quoted-empty BACKUP_BLOB_READ_WRITE_TOKEN fall through to a working media token", () => {
    for (const junk of [" ", "\t\n", '""', "''", ' " " ']) {
      expect(
        resolveBackupBlobToken({ BACKUP_BLOB_READ_WRITE_TOKEN: junk, BLOB_READ_WRITE_TOKEN: MEDIA_TOKEN }),
        JSON.stringify(junk),
      ).toEqual({ token: MEDIA_TOKEN, envName: "BLOB_READ_WRITE_TOKEN" });
    }
    expect(
      resolveBackupBlobToken({ BACKUP_BLOB_READ_WRITE_TOKEN: ` "${BACKUP_TOKEN}"\n` }),
      "quotes and whitespace around a real token are cut, not kept",
    ).toEqual({ token: BACKUP_TOKEN, envName: "BACKUP_BLOB_READ_WRITE_TOKEN" });
  });

  it("cuts a zero-width character out of a pasted token; a zero-width-only value falls through", () => {
    // U+200B is not whitespace to String.prototype.trim — only the non-printable strip removes it.
    expect("\u200B".trim()).toBe("\u200B");
    expect(resolveBackupBlobToken({ BACKUP_BLOB_READ_WRITE_TOKEN: `\u200B${BACKUP_TOKEN}\u200B` })).toEqual({
      token: BACKUP_TOKEN,
      envName: "BACKUP_BLOB_READ_WRITE_TOKEN",
    });
    expect(
      resolveBackupBlobToken({ BACKUP_BLOB_READ_WRITE_TOKEN: "\u200B", BLOB_READ_WRITE_TOKEN: MEDIA_TOKEN }),
    ).toEqual({ token: MEDIA_TOKEN, envName: "BLOB_READ_WRITE_TOKEN" });
  });

  it("the operator CLI path (no storage argument) uploads with the same resolver", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", BACKUP_TOKEN);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", MEDIA_TOKEN);
    mocks.put.mockImplementation(async (pathname: string) => ({ pathname }));

    await expect(uploadBackupToBlob("{}", "backup-x.json")).resolves.toEqual({
      pathname: "backups/backup-x.json",
    });
    expect(mocks.put.mock.calls[0][2]).toMatchObject({ access: "private", token: BACKUP_TOKEN });

    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(uploadBackupToBlob("{}", "backup-x.json")).rejects.toThrow(/No backup storage configured/);
  });
});

/**
 * The operator CLIs print a failure to the terminal — or to whatever CI log
 * runs them. libsql echoes a TURSO_DATABASE_URL it cannot parse whole, and that
 * URL may carry `?authToken=…`. Engine-only: a `--profile site` scaffold
 * prunes both scripts (scaffold/site-pruned-scripts.ts), so these tests skip there.
 */
const ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(ROOT, "scripts/backup-turso.ts");
const RESTORE_CLI = path.join(ROOT, "scripts/restore-turso.ts");

function runScript(script: string, args: string[], env: Record<string, string>, cwd = ROOT) {
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  return spawnSync(process.execPath, [tsx, script, ...args], {
    cwd,
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
  });
}

describe.skipIf(!existsSync(CLI))("scripts/backup-turso.ts", () => {
  it("prints a failure with the secrets cut out", () => {
    const run = runScript(CLI, [], {
      // No scheme, so libsql's URI parser rejects it and quotes it back.
      TURSO_DATABASE_URL: "shop-db.turso.io?authToken=url_s3cr3t_value",
      TURSO_AUTH_TOKEN: "turso_s3cr3t_TURSOtoken",
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("The URL 'shop-db.turso.io?authToken=[redacted]' is not in a valid format");
    expect(run.stdout + run.stderr).not.toContain("s3cr3t");
  });

  it("cuts the Blob token out of a failure as well", () => {
    // No Blob call can fail offline, so the token reaches the error the one
    // way that can: libsql quotes back, whole, the URL that carries it.
    const blobToken = "vercel_blob_rw_clistore_s3cr3tBLOBtoken";
    const run = runScript(CLI, [], {
      TURSO_DATABASE_URL: `shop-db.turso.io?authToken=url_s3cr3t_value&note=${blobToken}`,
      TURSO_AUTH_TOKEN: "turso_s3cr3t_TURSOtoken",
      BACKUP_BLOB_READ_WRITE_TOKEN: blobToken,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      "The URL 'shop-db.turso.io?authToken=[redacted]&note=[redacted]' is not in a valid format",
    );
    expect(run.stdout + run.stderr).not.toContain("s3cr3t");
  });

  it("reports the dump's size in KB of UTF-8 bytes, not of string length", { timeout: 20_000 }, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cw-backup-cli-"));
    try {
      // A real libSQL file database, so the dump runs offline; æ is 2 bytes in UTF-8.
      const seed = spawnSync(
        process.execPath,
        [
          "-e",
          `const { createClient } = require("@libsql/client");
           (async () => {
             const c = createClient({ url: "file:" + process.argv[1] });
             await c.execute("CREATE TABLE Customer (id TEXT PRIMARY KEY, note TEXT)");
             await c.execute({ sql: "INSERT INTO Customer VALUES (?, ?)", args: ["c1", "\u00e6".repeat(3000)] });
             c.close();
           })().catch((e) => { console.error(e); process.exit(1); });`,
          path.join(dir, "shop.db"),
        ],
        { cwd: ROOT, encoding: "utf8" },
      );
      expect(seed.status, seed.stderr).toBe(0);

      const run = runScript(
        CLI,
        ["--write"],
        { TURSO_DATABASE_URL: `file:${path.join(dir, "shop.db")}`, TURSO_AUTH_TOKEN: "unused-for-a-file-db" },
        dir,
      );

      expect(run.status, run.stderr).toBe(0);
      const [written] = readdirSync(path.join(dir, "backups"));
      const file = path.join(dir, "backups", written);
      const kb = (bytes: number) => (bytes / 1024).toFixed(0);
      expect(kb(readFileSync(file, "utf8").length), "the fixture must tell bytes from length").not.toBe(
        kb(statSync(file).size),
      );
      expect(run.stdout).toContain(`(${kb(statSync(file).size)} KB)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!existsSync(RESTORE_CLI))("scripts/restore-turso.ts", () => {
  it("prints a failure with the secrets cut out", { timeout: 20_000 }, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cw-restore-cli-"));
    try {
      const backup = path.join(dir, "backup-x.json");
      writeFileSync(backup, JSON.stringify({ host: "shop-db.turso.io", data: { Product: [{ id: "p1" }] } }));

      // --confirm reaches createClient, which rejects a URL with no scheme and quotes it back.
      const run = runScript(RESTORE_CLI, [backup, "--confirm"], {
        TURSO_DATABASE_URL: "shop-db.turso.io?authToken=url_s3cr3t_value",
        TURSO_AUTH_TOKEN: "turso_s3cr3t_TURSOtoken",
      });

      expect(run.status).toBe(1);
      expect(run.stderr).toContain("The URL 'shop-db.turso.io?authToken=[redacted]' is not in a valid format");
      expect(run.stdout + run.stderr).not.toContain("s3cr3t");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
