import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { RESEND_SENDER } from "@/lib/migration/mail-sender";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";

/**
 * MIGD-6: dns.mail through the `migration.*` tools, on a real libSQL file with the
 * real store and audit: what a freeze keeps, how the row reads with and without the
 * owner's sign-off, what voids what. The stand-ins are the source's sitemap, node:dns
 * (a Resolver over a table of names; no network) and the runtime flag. The sending
 * address is fixed unless a test names another, so the zones below hold in any fork.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

type Name = { txt?: string[]; mx?: [number, string][]; err?: string };

const state = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  features: { migrationDashboard: true } as Record<string, boolean>,
  zone: {} as Record<string, Name>,
  from: "orders@shop.example.test",
  lookups: 0,
  sitemap: vi.fn(),
  resendClients: 0,
  /** Two project reads held until both have read: the race the compare-and-set is for. */
  heldReads: null as null | { count: number; release: () => void; both: Promise<void> },
  /** Every project read hands out an old `updatedAt`, so every compare-and-set misses. */
  staleReads: false,
  /** One step per project read, taken once that read has its row: a write landing while a run is on DNS, or about to save. */
  afterReads: [] as (undefined | (() => Promise<unknown>))[],
}));

// lib/auth.ts reads `prisma` at import: the proxy answers before a test has a client.
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, {
    get(_shell, key) {
      const target = state.prisma;
      if (!target) return undefined;
      if (key !== "migrationProject") return Reflect.get(target, key, target);
      return new Proxy(target.migrationProject, {
        get(projects, method) {
          if (method !== "findFirst") return Reflect.get(projects, method, projects);
          return async (args: Parameters<typeof projects.findFirst>[0]) => {
            const row = await projects.findFirst(args);
            const held = state.heldReads;
            if (held) {
              if (++held.count === 2) held.release();
              await held.both;
            }
            await state.afterReads.shift()?.();
            return state.staleReads && row ? { ...row, updatedAt: new Date(0) } : row;
          };
        },
      });
    },
  }),
}));
vi.mock("@/lib/brand", async (orig) => ({
  ...(await orig<typeof import("@/lib/brand")>()),
  getFeatureGateState: async () => ({ available: true, features: { ...state.features } }),
}));
vi.mock("@/brand.config", async (orig) => {
  const real = await orig<typeof import("@/brand.config")>();
  return { ...real, brand: { ...real.brand, emails: { ...real.brand.emails, get from() { return state.from; } } } };
});
vi.mock("@/lib/migration/fetch", () => ({ migrationFetcher: () => (url: string) => state.sitemap(url) }));
vi.mock("resend", () => ({
  Resend: class {
    constructor() { state.resendClients++; }
  },
}));
vi.mock("node:dns/promises", () => {
  const fail = (code: string) => Promise.reject(Object.assign(new Error(code), { code }));
  class Resolver {
    setServers() {}
    private look<T>(host: string, pick: (n: Name) => T[] | undefined) {
      state.lookups++;
      const n = state.zone[host];
      if (!n) return fail("ENOTFOUND");
      if (n.err) return fail(n.err);
      const v = pick(n);
      return v?.length ? Promise.resolve(v) : fail("ENODATA");
    }
    resolveTxt(h: string) { return this.look(h, (n) => n.txt?.map((t) => [t])); }
    resolveMx(h: string) { return this.look(h, (n) => n.mx?.map(([priority, exchange]) => ({ priority, exchange }))); }
    resolve4(h: string) { return this.look(h, () => undefined); }
    resolve6(h: string) { return this.look(h, () => undefined); }
    resolveCname(h: string) { return this.look(h, () => undefined); }
    resolveNs(h: string) { return this.look(h, () => undefined); }
  }
  return { Resolver };
});

const D = "shop.example.test";
const SRC = `https://${D}`;
const NEW = "https://new-shop.example.net";
const ADMIN = ["settings:read", "settings:write"];
const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-dns-mail" };
const HOUR = 60 * 60 * 1000;
const START = new Date("2026-10-31T08:00:00Z");

const OLD: Record<string, Name> = {
  [D]: { txt: ["v=spf1 include:_spf.oldmail.example.test ~all"], mx: [[10, "mx1.oldmail.example.test"]] },
  "_spf.oldmail.example.test": { txt: ["v=spf1 ip4:192.0.2.0/24 -all"] },
  [`_dmarc.${D}`]: { txt: ["v=DMARC1; p=reject"] },
  [`google._domainkey.${D}`]: { txt: ["p=OLDKEY"] },
};
const VALID: Record<string, Name> = {
  ...OLD,
  [`send.${D}`]: { txt: ["v=spf1 include:amazonses.com ~all"] },
  "amazonses.com": { txt: ["v=spf1 ip4:198.51.100.0/24 -all"] },
  [`resend._domainkey.${D}`]: { txt: ["p=NEWKEY"] },
};

/** The clock is ours, and each call happens a second after the last, so "the newest run" and "a sign-off's age" mean what they do in real time. */
const invoke = (name: string, args: unknown, scopes: readonly string[] = ADMIN) => {
  vi.setSystemTime(new Date(Date.now() + 1000));
  return invokeTool(name, args, CTX, scopes as never);
};
const wire = (name: string, result: unknown) => getTool(name)?.output.safeParse(JSON.parse(JSON.stringify(result)));
/** Every run also holds its result to the output schema the tool publishes, so each row kind and sign-off a test reaches is pinned there. */
const runMail = async () => {
  const r = await invoke("migration.run_checks", { checkIds: ["dns.mail"] });
  if (r.ok) expect(wire("migration.run_checks", r.result)?.success).toBe(true);
  return r;
};
const signOff = (status = "pass") => invoke("migration.attest", { checkId: "dns.mail", status, note: "Inbox at Gmail, score 9.5/10", confirm: true });
const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
const project = () => state.prisma.migrationProject.findFirstOrThrow();
const auditCount = (tool: string) => state.prisma.auditLog.count({ where: { tool } });
const mailRuns = () => state.prisma.migrationCheckRun.findMany({ where: { checkId: "dns.mail" }, orderBy: { startedAt: "asc" } });

type Status = { ready: { ready: number; missing: string[] }; checks: { checkId: string; status: string; fresh: boolean; detail?: string }[] };
async function board() {
  const r = await invoke("migration.status", {}, ["settings:read"]);
  if (!r.ok) throw new Error(r.error);
  expect(wire("migration.status", r.result)?.success).toBe(true);
  const res = r.result as Status;
  return { ...res, row: res.checks.find((c) => c.checkId === "dns.mail") };
}

/** A project with a frozen sitemap, frozen while the zone held `before`, and the zone as `after` now. */
async function frozen(before = OLD, after = VALID) {
  expect(await invoke("migration.project_set", { sourceUrl: SRC, targetUrl: NEW, confirm: true })).toMatchObject({ ok: true });
  state.zone = before;
  expect(await invoke("migration.freeze_sitemap", { confirm: true })).toMatchObject({ ok: true, result: { frozen: 1 } });
  state.zone = after;
  state.lookups = 0;
  later(60_000);
}

let dir = "";
const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(async () => {
  if (!sqlite) return;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
  dir = mkdtempSync(join(tmpdir(), "cw-dns-mail-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"));
  raw.close();
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  state.features = { migrationDashboard: true };
  state.zone = {};
  state.from = "orders@shop.example.test";
  state.lookups = 0;
  state.resendClients = 0;
  state.heldReads = null;
  state.staleReads = false;
  state.afterReads = [];
  state.sitemap.mockImplementation(async (url: string) => {
    const body = url.endsWith("sitemap_index.xml")
      ? `<sitemapindex><sitemap><loc>${SRC}/page-sitemap.xml</loc></sitemap></sitemapindex>`
      : `<urlset><url><loc>${SRC}/om-os/</loc></url></urlset>`;
    return { outcome: "answer", url, status: 200, location: null, contentType: "application/xml", body, truncated: false };
  });
});

afterEach(async () => {
  if (!sqlite) return;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await state.prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!sqlite)("migration.freeze_sitemap keeps the old mail records", () => {
  it("a freeze writes them into the snapshot, under its id; a dry run reads no DNS and writes nothing", async () => {
    expect(await invoke("migration.project_set", { sourceUrl: SRC, targetUrl: NEW, confirm: true })).toMatchObject({ ok: true });
    state.zone = OLD;
    expect(await invoke("migration.freeze_sitemap", { dryRun: true })).toMatchObject({ ok: true, result: { dryRun: true } });
    expect(state.lookups).toBe(0);
    expect((await project()).snapshot).toBeNull();

    const r = await invoke("migration.freeze_sitemap", { confirm: true });
    expect(r).toMatchObject({ ok: true, result: { frozen: 1 } });
    const snapshot = (await project()).snapshot as { id: string; sitemaps: number; mail: { domain: string; senderDomain: string; records: Record<string, string[]>; errors: object } };
    expect(snapshot.id).toEqual((r.ok && (r.result as { snapshotId: string }).snapshotId) || "");
    expect(snapshot.sitemaps).toBeGreaterThan(0);
    expect(snapshot.mail).toMatchObject({ domain: D, senderDomain: D, errors: {} });
    expect(snapshot.mail.records).toEqual({
      [`spf ${D}`]: OLD[D].txt,
      [`mx ${D}`]: ["10 mx1.oldmail.example.test"],
      [`dmarc _dmarc.${D}`]: OLD[`_dmarc.${D}`].txt,
      [`dkim google._domainkey.${D}`]: OLD[`google._domainkey.${D}`].txt,
    });
  });

  it("a lookup that fails notes it and never stops the freeze; dns.mail then reads inconclusive, naming it", async () => {
    await frozen({ ...OLD, [D]: { err: "ETIMEOUT" } });
    expect(((await project()).snapshot as { mail: { errors: object } }).mail.errors).toEqual({ [`spf ${D}`]: "ETIMEOUT", [`mx ${D}`]: "ETIMEOUT" });
    const r = await runMail();
    expect(r).toMatchObject({ ok: true, result: { dnsStatus: "inconclusive", status: "inconclusive" } });
    if (r.ok) expect((r.result as { detail: string }).detail).toContain(`The freeze could not read spf ${D}, mx ${D}`);
  });

  it("a new source drops the copy with the rest of the freeze", async () => {
    await frozen();
    expect(await invoke("migration.project_set", { sourceUrl: "https://other-shop.example.test", confirm: true })).toMatchObject({ ok: true, result: { freezeReset: true } });
    expect(((await project()).snapshot as { mail?: unknown }).mail).toBeUndefined();
    const r = await runMail();
    expect(r.ok && (r.result as { rows: { record: string }[] }).rows.map((x) => x.record)).toContain("freeze");
  });
});

describe.skipIf(!sqlite)("migration.run_checks dns.mail", () => {
  it("DNS alone is never green: the run holds the DNS pass, the tool and the board read the row, non-green, and say why", async () => {
    await frozen();
    const r = await runMail();
    expect(r).toMatchObject({
      ok: true,
      result: { checkId: "dns.mail", status: "inconclusive", dnsStatus: "pass", signOff: "missing", finished: true, nextCursor: null, phase: "before", domain: D, senderDomain: D, spfHost: `send.${D}` },
    });
    if (!r.ok) return;
    expect((r.result as { detail: string }).detail).toBe("Waiting for the owner's sign-off (migration.attest).");
    expect(await mailRuns()).toMatchObject([{ status: "pass", phase: "before", actor: "apikey:test", bindings: { snapshotId: expect.any(String), configHash: expect.any(String) } }]);
    expect(await auditCount("migration.run_checks")).toBe(1);
    const { row, ready } = await board();
    expect(row).toMatchObject({ status: "inconclusive", fresh: false, detail: "Waiting for the owner's sign-off (migration.attest)." });
    expect(ready.missing).toContain("dns.mail");
    expect(ready.ready).toBe(0);
  });

  it("a from address on another domain reaches the tool's result as a row of its own: a warn, named, and a copy of the old sender is no copy", async () => {
    await frozen();
    state.from = "noreply@other-brand.example.test";
    const r = await runMail();
    const rows = r.ok ? (r.result as { rows: { record: string; name: string; status: string }[] }).rows : [];
    expect(rows.find((x) => x.record === "from")).toMatchObject({ name: "other-brand.example.test", status: "warn" });
    expect(rows.find((x) => x.record === "freeze")).toMatchObject({ name: D, status: "inconclusive" });
  });

  it("the owner's sign-off makes the row green without another run, and counts; no run row is written for it", async () => {
    await frozen();
    await runMail();
    const r = await signOff();
    expect(r).toMatchObject({ ok: true, result: { checkId: "dns.mail", status: "pass", recordedRun: false, switchedAt: null } });
    expect(await mailRuns()).toHaveLength(1);
    const { row, ready } = await board();
    expect(row).toMatchObject({ status: "pass", fresh: true });
    expect(row?.detail).toBeUndefined();
    expect(ready.ready).toBe(1);
    expect(ready.missing).not.toContain("dns.mail");
    // A run after it reads the same.
    expect(await runMail()).toMatchObject({ ok: true, result: { status: "pass", dnsStatus: "pass", signOff: "pass" } });
  });

  it("a sign-off before the first run waits for it", async () => {
    await frozen();
    await signOff();
    expect((await board()).row).toBeUndefined();
    expect((await board()).ready.missing).toContain("dns.mail");
    await runMail();
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
  });

  it("a sign-off cannot lift a DNS failure, and a failed sign-off turns a DNS pass at once", async () => {
    await frozen();
    await runMail();
    await signOff("fail");
    expect((await board()).row).toMatchObject({ status: "fail", fresh: false, detail: "The owner signed this off as a fail." });
    await signOff("warn");
    expect((await board()).row).toMatchObject({ status: "warn", fresh: false });
    await signOff("pass");
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });

    state.zone = { ...VALID, [D]: { txt: OLD[D].txt } };
    const r = await runMail();
    expect(r).toMatchObject({ ok: true, result: { status: "fail", dnsStatus: "fail", signOff: "pass" } });
    if (r.ok) expect((r.result as { detail: string }).detail).toContain("mx1.oldmail.example.test is gone");
    const { row, ready } = await board();
    expect(row).toMatchObject({ status: "fail", fresh: false });
    expect(row?.detail).toContain("mx1.oldmail.example.test is gone");
    expect(ready.ready).toBe(0);
  });

  it("each half ages on its own: a sign-off under 24 hours old with a DNS run under 24 hours old, or nothing", async () => {
    await frozen();
    await signOff();
    await runMail();
    later(23 * HOUR);
    await runMail();
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
    later(2 * HOUR); // the sign-off is 25 hours old, the run 2
    const { row } = await board();
    expect(row).toMatchObject({ status: "inconclusive", fresh: false });
    expect(row?.detail).toMatch(/sign-off is over 24 hours old/);
    expect(await runMail()).toMatchObject({ ok: true, result: { status: "inconclusive", dnsStatus: "pass", signOff: "stale" } });
    await signOff();
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
    later(24 * HOUR); // now the run is what is too old
    await signOff();
    expect((await board()).row).toMatchObject({ status: "pass", fresh: false });
  });

  it("a new freeze voids the sign-off and the run; a new site voids both; a deploy voids only the run", async () => {
    await frozen();
    await runMail();
    await signOff();
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-b");
    expect((await board()).row).toMatchObject({ status: "pass", fresh: false });
    await runMail();
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });

    await invoke("migration.project_set", { targetUrl: "https://shadow.example.net", confirm: true });
    expect((await board()).row).toMatchObject({ status: "inconclusive", fresh: false });
    await invoke("migration.project_set", { targetUrl: NEW, confirm: true });
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });

    state.zone = OLD;
    await invoke("migration.freeze_sitemap", { confirm: true });
    state.zone = VALID;
    expect((await board()).row).toMatchObject({ status: "inconclusive", fresh: false });
    expect((await board()).row?.detail).toMatch(/before the last freeze/);
  });

  it.each(["fail", "warn"])("a sign-off as a %s stays that while nothing has been fixed: a day on, on a new site, after a new freeze, until the owner signs again", async (status) => {
    await frozen();
    await runMail();
    await signOff(status);
    const reads = { status, fresh: false, detail: `The owner signed this off as a ${status}.` };
    later(25 * HOUR);
    expect((await board()).row).toMatchObject(reads);
    expect(await runMail()).toMatchObject({ ok: true, result: { status, dnsStatus: "pass", signOff: status } });
    await invoke("migration.project_set", { targetUrl: "https://shadow.example.net", confirm: true });
    expect((await board()).row).toMatchObject(reads);
    state.zone = OLD;
    await invoke("migration.freeze_sitemap", { confirm: true });
    state.zone = VALID;
    expect((await board()).row).toMatchObject(reads);
    await signOff("pass");
    await runMail();
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
  });

  it("a project frozen before this check has no copy: inconclusive with every record right, until frozen again", async () => {
    await frozen();
    await state.prisma.migrationProject.updateMany({ data: { snapshot: { id: "snap-old" } } });
    expect(await runMail()).toMatchObject({ ok: true, result: { dnsStatus: "inconclusive" } });
    await signOff();
    expect((await board()).row).toMatchObject({ status: "inconclusive", fresh: false });
    expect((await board()).row?.detail).toMatch(/^freeze shop\.example\.test: No frozen copy/);
  });

  it("runs after the switch too, when a move's losses show: phase after", async () => {
    await frozen();
    await invoke("migration.attest", { checkId: "cutover.switched", status: "pass", note: "Switched", confirm: true });
    state.zone = { ...VALID, [`google._domainkey.${D}`]: {} };
    const r = await runMail();
    expect(r).toMatchObject({ ok: true, result: { phase: "after", dnsStatus: "fail" } });
    if (r.ok) expect((r.result as { detail: string }).detail).toContain(`dkim google._domainkey.${D}: no DKIM key; it was there at the freeze`);
    expect(await mailRuns()).toMatchObject([{ phase: "after", status: "fail" }]);
  });

  it("sends no mail: nothing but DNS leaves this call", async () => {
    await frozen();
    state.sitemap.mockClear();
    fetchSpy.mockClear();
    await runMail();
    await signOff();
    expect(state.lookups).toBeGreaterThan(0);
    expect(state.sitemap).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.resendClients).toBe(0);
  });

  it("a source at an IP address has no DNS: refused before any lookup or write", async () => {
    await invoke("migration.project_set", { sourceUrl: "http://203.0.113.10", confirm: true });
    const r = await runMail();
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/is an IP address; there is no DNS to check/);
    expect(state.lookups).toBe(0);
    expect(await mailRuns()).toHaveLength(0);
  });

  it("without a project it says how to make one", async () => {
    const r = await runMail();
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/No migration project yet/);
  });

  it("flag off ⇒ the run, the sign-off and the sender settings refuse, before any read or lookup", async () => {
    await frozen();
    const runs = (await mailRuns()).length;
    state.features = { migrationDashboard: false };
    for (const r of [await runMail(), await signOff(), await invoke("migration.project_set", { mailSender: { spfInclude: "mail.example.test" }, confirm: true })]) {
      expect(r).toMatchObject({ ok: false, status: 500 });
      if (!r.ok) expect(r.error).toMatch(/^Migration dashboard is disabled/);
    }
    expect(state.lookups).toBe(0);
    expect(await mailRuns()).toHaveLength(runs);
    expect((await project()).settings).toBeNull();
  });
});

describe.skipIf(!sqlite)("migration.attest keeps what a check+sign-off row's sign-off is bound to", () => {
  it("that row's entry names the snapshot and the new site; a pure sign-off keeps them on its run instead", async () => {
    await frozen();
    await signOff();
    await invoke("migration.attest", { checkId: "pay.test-order", status: "pass", note: "Order 1042", confirm: true });
    const { attestations, snapshot } = await project();
    const entries = attestations as Record<string, { bindings?: { snapshotId?: string; configHash?: string }; note: string; actor: string; at: string }>;
    expect(entries["dns.mail"]).toMatchObject({ status: "pass", note: "Inbox at Gmail, score 9.5/10", actor: "apikey:test", at: expect.any(String) });
    expect(entries["dns.mail"].bindings).toEqual({ snapshotId: (snapshot as { id: string }).id, configHash: expect.any(String) });
    expect(entries["pay.test-order"].bindings).toBeUndefined();
  });
});

describe.skipIf(!sqlite)("migration.project_set mailSender", () => {
  const set = (mailSender: unknown) => invoke("migration.project_set", { mailSender, confirm: true });

  it("is what dns.mail then asks for: another selector, include and Return-Path", async () => {
    const zone = { ...OLD, [D]: { ...OLD[D], txt: ["v=spf1 include:_spf.oldmail.example.test include:mail.example.test ~all"] }, "mail.example.test": { txt: ["v=spf1 -all"] }, [`s1._domainkey.${D}`]: { txt: ["p=K"] } };
    await frozen(OLD, zone);
    expect(await set({ dkimSelectors: ["S1 "], spfInclude: "Mail.Example.Test", spfSubdomain: "" })).toMatchObject({ ok: true, result: { sourceUrl: SRC, targetUrl: NEW, created: false, freezeReset: false } });
    expect((await project()).settings).toEqual({ dkimSelectors: ["s1"], spfInclude: "mail.example.test", spfSubdomain: "" });
    expect(await auditCount("migration.project_set")).toBe(2);
    expect(await runMail()).toMatchObject({ ok: true, result: { dnsStatus: "pass", spfHost: D } });
  });

  it("a change drops dns.mail's runs and sign-off, and no other row's", async () => {
    await frozen();
    await runMail();
    await signOff();
    await invoke("migration.attest", { checkId: "pay.test-order", status: "pass", note: "Order 1042", confirm: true });
    expect((await board()).ready.ready).toBe(2);

    expect(await set({ dkimSelectors: ["resend", "google"] })).toMatchObject({ ok: true });
    const { row, ready, checks } = await board();
    expect(row).toBeUndefined();
    expect(ready.missing).toContain("dns.mail");
    expect(ready.ready).toBe(1);
    expect(checks.map((c) => c.checkId)).toEqual(["pay.test-order"]);
    expect(Object.keys((await project()).attestations as object)).toEqual(["pay.test-order"]);
    expect(await mailRuns()).toHaveLength(0);

    await runMail();
    expect((await board()).row).toMatchObject({ status: "inconclusive", detail: "Waiting for the owner's sign-off (migration.attest)." });
  });

  it("the same values again change nothing, and void nothing", async () => {
    await frozen();
    await set({ spfInclude: "amazonses.com" });
    await runMail();
    await signOff();
    await set({ spfInclude: "amazonses.com" });
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
    expect(await mailRuns()).toHaveLength(1);
  });

  it.each([
    ["Resend's include", { spfInclude: "amazonses.com" }],
    ["Resend's Return-Path", { spfSubdomain: "send" }],
    ["Resend's selector", { dkimSelectors: ["resend"] }],
    ["Resend's selector twice", { dkimSelectors: ["resend", "resend"] }],
    ["all of it", { dkimSelectors: ["resend"], spfInclude: "amazonses.com", spfSubdomain: "send" }],
  ])("naming what is already in effect is no change, on a project with no sender settings: %s", async (_what, sender) => {
    await frozen();
    await runMail();
    await signOff();
    expect(await set(sender)).toMatchObject({ ok: true, result: { sourceUrl: SRC, targetUrl: NEW, created: false, freezeReset: false } });
    expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
    expect(await mailRuns()).toHaveLength(1);
    expect(Object.keys((await project()).attestations as object)).toEqual(["dns.mail"]);
    expect((await project()).settings).toBeNull();
  });

  it("the selectors are a set: the same ones twice over or in another order are no change, one more is", async () => {
    await frozen();
    await set({ dkimSelectors: ["s1", "s2"] });
    await runMail();
    await signOff();
    for (const dkimSelectors of [["s1", "s1", "s2"], ["s2", "s1"]]) {
      await set({ dkimSelectors });
      expect(await mailRuns(), dkimSelectors.join()).toHaveLength(1);
      expect((await project()).settings, dkimSelectors.join()).toEqual({ dkimSelectors: ["s1", "s2"] });
    }
    expect(Object.keys((await project()).attestations as object)).toEqual(["dns.mail"]);
    await set({ dkimSelectors: ["s1", "s2", "s3"] });
    expect(await mailRuns()).toHaveLength(0);
    expect((await project()).attestations).toEqual({});
  });

  it("keeps the project's other settings", async () => {
    await frozen();
    await state.prisma.migrationProject.updateMany({ data: { settings: { expectedHost: D, spfInclude: "old.example.test" } } });
    await set({ spfInclude: "new.example.test" });
    expect((await project()).settings).toEqual({ expectedHost: D, spfInclude: "new.example.test" });
  });

  it("with addresses in the same call, both land", async () => {
    await frozen();
    const r = await invoke("migration.project_set", { targetUrl: "https://shadow.example.net", mailSender: { spfSubdomain: "bounce" }, confirm: true });
    expect(r).toMatchObject({ ok: true, result: { targetUrl: "https://shadow.example.net", freezeReset: false } });
    expect(await project()).toMatchObject({ targetUrl: "https://shadow.example.net", settings: { spfSubdomain: "bounce" } });
    if (r.ok) expect(wire("migration.project_set", r.result)?.success).toBe(true);
  });

  it("with a new source in the same call, the result reports the freeze that source dropped", async () => {
    await frozen();
    const r = await invoke("migration.project_set", { sourceUrl: "https://other-shop.example.test", mailSender: { spfSubdomain: "bounce" }, confirm: true });
    expect(r).toMatchObject({ ok: true, result: { sourceUrl: "https://other-shop.example.test", freezeReset: true } });
  });

  it("needs a project", async () => {
    const r = await set({ spfInclude: "mail.example.test" });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/No migration project yet/);
  });

  it.each([
    [{}],
    [{ dkimSelectors: [] }],
    [{ dkimSelectors: ["a b"] }],
    [{ dkimSelectors: Array.from({ length: 11 }, (_, i) => `s${i}`) }],
    [{ spfInclude: "" }],
    [{ spfInclude: "include:amazonses.com" }],
    [{ spfSubdomain: "-bad" }],
    [{ spfSubdomain: "bad-" }],
    [{ spfInclude: `${"a".repeat(249)}.test` }],
    [{ other: "x" }],
    [{ spfInclude: "a.example.test", other: "x" }],
  ])("%o is refused (422) before any handler code runs", async (mailSender) => {
    expect(await set(mailSender)).toMatchObject({ ok: false, status: 422 });
  });

  it("is settings:write and confirm-gated", async () => {
    expect(await invoke("migration.project_set", { mailSender: { spfInclude: "a.example.test" }, confirm: true }, ["settings:read"])).toMatchObject({ ok: false, status: 403 });
    expect(await invoke("migration.project_set", { mailSender: { spfInclude: "a.example.test" } })).toMatchObject({ ok: false, status: 422 });
  });

  it("two changes saved at the same moment both survive: the later one re-reads, never overwrites", async () => {
    await frozen();
    let release = () => {};
    const both = new Promise<void>((r) => { release = r; });
    state.heldReads = { count: 0, release, both };
    const [a, b] = await Promise.all([set({ dkimSelectors: ["resend", "google"] }), set({ spfInclude: "mail.example.test" })]);
    state.heldReads = null;
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect((await project()).settings).toEqual({ dkimSelectors: ["resend", "google"], spfInclude: "mail.example.test" });
  });

  it("a change moves updatedAt on even within one millisecond: that is what the compare-and-set compares", async () => {
    await frozen();
    const before = (await project()).updatedAt.getTime();
    vi.setSystemTime(before - 1000); // `invoke` moves the clock a second on, so the call lands on the last write's own millisecond.
    expect(await set({ spfInclude: "mail.example.test" })).toMatchObject({ ok: true });
    expect((await project()).updatedAt.getTime()).toBeGreaterThan(before);
  });

  it("a change that keeps colliding gives up, bounded, and saves nothing", async () => {
    await frozen();
    await runMail();
    state.staleReads = true;
    const r = await set({ spfInclude: "mail.example.test" });
    state.staleReads = false;
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/same moment.*not saved/);
    expect((await project()).settings).toBeNull();
    expect(await mailRuns()).toHaveLength(1);
  });

  describe("and a run under way", () => {
    const SENDGRID = { dkimSelectors: ["s1"], spfInclude: "sendgrid.net", spfSubdomain: "" };
    /** The run has read the project and is on DNS when `write` lands. */
    const duringRun = (write: () => Promise<unknown>) => {
      state.afterReads = [write];
      return runMail();
    };

    it("a change landing while it reads DNS voids it too: not saved, the row reads not run, and a sign-off cannot make it count", async () => {
      await frozen();
      const r = await duringRun(() => set(SENDGRID));
      expect(r).toMatchObject({ ok: false, status: 500 });
      if (!r.ok) expect(r.error).toBe("The mail sender changed while its records were read, so this run was not saved. Run it again.");
      expect(await mailRuns()).toHaveLength(0);
      await signOff();
      const { row, ready } = await board();
      expect(row).toBeUndefined();
      expect(ready.missing).toContain("dns.mail");
      // What that run never read: nothing there authorises the new sender.
      const control = await runMail();
      expect(control).toMatchObject({ ok: true, result: { status: "fail", dnsStatus: "fail" } });
      if (control.ok) expect((control.result as { detail: string }).detail).toContain("no include:sendgrid.net");
    });

    it("a change landing after its last read, as it saves: the row reads not run all the same, until a run of the new sender", async () => {
      await frozen();
      state.afterReads = [undefined, () => set(SENDGRID)];
      expect(await runMail()).toMatchObject({ ok: true });
      expect(state.afterReads).toEqual([]);
      expect(await mailRuns()).toHaveLength(1);
      await signOff();
      const { row, ready } = await board();
      expect(row).toBeUndefined();
      expect(ready.missing).toContain("dns.mail");
      await runMail();
      expect((await board()).row).toMatchObject({ status: "fail", fresh: false });
    });

    it("a change and back while it reads DNS: it read the sender in effect, so it counts", async () => {
      await frozen();
      expect(await duringRun(async () => { await set(SENDGRID); await set(RESEND_SENDER); })).toMatchObject({ ok: true, result: { dnsStatus: "pass", signOff: "missing" } });
      await signOff();
      expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
    });

    it("another setting changing while it reads DNS is no change of sender: it is saved and counts", async () => {
      await frozen();
      expect(await duringRun(() => state.prisma.migrationProject.updateMany({ data: { settings: { expectedHost: D } } }))).toMatchObject({ ok: true, result: { dnsStatus: "pass" } });
      await signOff();
      expect((await board()).row).toMatchObject({ status: "pass", fresh: true });
    });

    it("a sign-off landing while it reads DNS is in its answer, which is what the board reads", async () => {
      await frozen();
      await runMail();
      await signOff();
      expect(await duringRun(() => signOff("fail"))).toMatchObject({ ok: true, result: { status: "fail", dnsStatus: "pass", signOff: "fail" } });
      expect((await board()).row).toMatchObject({ status: "fail", fresh: false });
    });

    it("a freeze landing while it reads DNS: it stays bound to the copy it read, so it does not count, and its answer says the sign-off went with it", async () => {
      await frozen();
      await runMail();
      await signOff();
      expect(await duringRun(() => invoke("migration.freeze_sitemap", { confirm: true }))).toMatchObject({ ok: true, result: { status: "inconclusive", dnsStatus: "pass", signOff: "stale" } });
      await signOff();
      const { row, ready } = await board();
      expect(row).toMatchObject({ status: "pass", fresh: false });
      expect(ready.missing).toContain("dns.mail");
    });
  });
});
