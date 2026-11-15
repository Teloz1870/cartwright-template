import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { REDIRECT_ACTIVE_SAMPLE } from "@/lib/migration/checks/redirect";
import type { MigrationGetOptions, MigrationResponse } from "@/lib/migration/fetch";
import { PARITY_CHUNK } from "@/lib/migration/runner";

/**
 * MIGD `redirect.*` through `migration.run_checks`, on a real libSQL file: the
 * real Prisma client on the migration baseline's schema, the real audit log and
 * the real redirect store. The stand-ins are the network (a table of answers on
 * shop.example.test, behind `migrationFetcher`, the checks' one way out) and
 * Upstash. What it pins: a run never writes a redirect, one call is one audit
 * entry, a run continues from its cursor and reads `inconclusive` until it ends,
 * and "Ready for DNS switch" counts `redirect.imported` only after a real pass on
 * the redirects saved now. How a redirect reaches a visitor differs with and
 * without Upstash (lib/redirects/load.ts), so `redirect.active` runs under both.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const S = vi.hoisted(() => ({
  client: null as unknown as object,
  /** Every model the code reached for, so "refused before any read" is more than a hope. */
  touched: new Set<string>(),
  features: { migrationDashboard: true } as Record<string, boolean>,
  permalinks: false,
  redisGet: vi.fn(),
  net: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, key) => (S.touched.add(String(key)), Reflect.get(S.client, key)) }),
}));
vi.mock("@/lib/brand", async (orig) => ({
  ...(await orig<typeof import("@/lib/brand")>()),
  getFeatureGateState: async () => ({ available: true, features: { ...S.features } }),
}));
vi.mock("@/lib/migration/fetch", () => ({
  migrationFetcher: (base: MigrationGetOptions) => (url: string) => S.net(url, base),
}));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ get: S.redisGet }) } }));
vi.mock("@/lib/urls", async (orig) => {
  const real = await orig<typeof import("@/lib/urls")>();
  return { ...real, resolveUrlConfig: () => ({ ...real.resolveUrlConfig(), permalinks: S.permalinks }) };
});

const SHOP = "https://shop.example.test";
const OLD = "https://old.example.test";
const CTX = { actor: "apikey:test", requestId: "test-migration-redirect" } as const;
const ADMIN = ["settings:read", "settings:write"];
const DISABLED = "Migration dashboard is disabled. Enable 'migrationDashboard' (/admin/features) first.";

type Tools = typeof import("@/lib/tools/registry");
let tools: Tools;
let dir = "";
let prisma: PrismaClient;

/** The tools as a deploy with or without Upstash sees them: the store memoises its client on first use, so a new module graph. */
async function deploy(upstash: boolean) {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", upstash ? "https://stub.upstash.example.test" : "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", upstash ? "stub-token" : "");
  vi.resetModules();
  tools = await import("@/lib/tools/registry");
}
const invoke = (name: string, args: unknown) => tools.invokeTool(name, args, CTX, ADMIN as never);
const run = (args: unknown) => invoke("migration.run_checks", args);
const wire = (result: unknown) => tools.getTool("migration.run_checks")?.output.safeParse(JSON.parse(JSON.stringify(result))).success;
async function ready() {
  const r = await invoke("migration.status", {});
  if (!r.ok) throw new Error(r.error);
  return r.result as { ready: { ready: number; missing: string[] }; checks: { checkId: string; status: string; fresh: boolean }[] };
}
async function counted() {
  return !(await ready()).ready.missing.includes("redirect.imported");
}
const audits = () => prisma.auditLog.count({ where: { tool: "migration.run_checks" } });

const page = (url: string, status = 200): MigrationResponse =>
  ({ outcome: "answer", url, status, location: null, contentType: "text/html", body: status === 200 ? "<html>ok</html>" : "", truncated: false });
const moved = (url: string, status: number, location: string): MigrationResponse =>
  ({ outcome: "answer", url, status, location, contentType: "text/html", body: "", truncated: false });

/** The new site: answers per path (a status redirecting to a path, or a plain status); anything else is a 404. */
function serve(answers: Record<string, [number, string?]>) {
  S.net.mockImplementation(async (url: string) => {
    const a = answers[new URL(url).pathname];
    if (!a) return page(url, 404);
    return a[1] === undefined ? page(url, a[0]) : moved(url, a[0], a[1]);
  });
}
const asked = () => S.net.mock.calls.map((c) => new URL(c[0] as string).pathname);
const saveProject = (over: Record<string, unknown> = {}) =>
  prisma.migrationProject.create({
    data: { sourceUrl: OLD, targetUrl: SHOP, frozenAt: new Date("2026-10-30T08:00:00Z"), snapshot: { id: "snap-1" }, ...over },
  });
const saveRedirects = (rows: [string, string, number?][]) =>
  prisma.redirect.createMany({ data: rows.map(([fromPath, toPath, statusCode]) => ({ fromPath, toPath, statusCode: statusCode ?? 301 })) });
const redirectRows = () => prisma.redirect.findMany({ orderBy: { fromPath: "asc" } });
/** n rows that each land in one hop, and a site answering them. */
async function manyLanding(n: number) {
  const paths = Array.from({ length: n }, (_, i) => `/r${String(i).padStart(4, "0")}`);
  await saveRedirects(paths.map((p) => [p, "/new"]));
  serve({ ...Object.fromEntries(paths.map((p) => [p, [301, "/new"] as [number, string]])), "/new": [200] });
  return paths;
}

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-redirect-checks-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"));
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  S.client = prisma;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!sqlite) return;
  vi.clearAllMocks();
  await prisma.$transaction([
    prisma.migrationCheckRun.deleteMany(), prisma.migrationUrlMap.deleteMany(), prisma.migrationProject.deleteMany(),
    prisma.redirect.deleteMany(), prisma.auditLog.deleteMany(), prisma.product.deleteMany(), prisma.category.deleteMany(),
  ]);
  S.features = { migrationDashboard: true };
  S.permalinks = false;
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  // A run decides by these at the call; a describe that wants Upstash sets them again.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  await saveProject();
  S.touched.clear();
});

afterEach(() => vi.unstubAllEnvs());

describe.skipIf(!sqlite)("redirect.imported, on a real database", () => {
  beforeAll(async () => deploy(false), 60_000);

  it("one 301 to a 200 passes: ONE run, ONE audit entry, only the new site asked, nothing saved changed, and only now the counter counts it", async () => {
    await saveRedirects([["/old", "/new"]]);
    serve({ "/old": [301, "/new"], "/new": [200] });
    const before = await redirectRows();
    expect(await counted()).toBe(false);

    const r = await run({ checkIds: ["redirect.imported"] });
    expect(r).toMatchObject({
      ok: true,
      result: { checkId: "redirect.imported", status: "pass", finished: true, nextCursor: null, chunk: 1, processed: 1, total: 1, target: SHOP, counts: { pass: 1, fail: 0, inconclusive: 0 }, classes: { landed: 1 }, firstErrors: [] },
    });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect(S.net.mock.calls.map((c) => c[0])).toEqual([`${SHOP}/old`, `${SHOP}/new`]);
    // url.parity's fetch seam and bounds: the new host only, 8 s a request, 16 KB of a page.
    for (const [, base] of S.net.mock.calls) expect(base).toEqual({ allowHosts: ["shop.example.test"], timeoutMs: 8_000, maxBytes: 16 * 1024 });

    const runs = await prisma.migrationCheckRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ checkId: "redirect.imported", phase: "before", status: "pass", cursor: null, actor: "apikey:test" });
    expect(runs[0].finishedAt).toBeInstanceOf(Date);
    expect(runs[0].bindings).toMatchObject({ snapshotId: "snap-1", redirectsHash: expect.any(String) });
    expect(await audits()).toBe(1);
    expect(await redirectRows()).toEqual(before);
    expect(await counted()).toBe(true);
  });

  it("each way a row can be wrong fails that row, named, and the run with it", async () => {
    await saveRedirects([
      ["/ok", "/new"], ["/two-hops", "/mid"], ["/loop-a", "/loop-b"], ["/loop-b", "/loop-a"], ["/status", "/new"], ["/target", "/new"], ["/gone", "/nothing"],
    ]);
    serve({
      "/ok": [301, "/new"], "/new": [200],
      "/two-hops": [301, "/mid"], "/mid": [301, "/new"],
      "/loop-a": [301, "/loop-b"], "/loop-b": [301, "/loop-a"],
      "/status": [302, "/new"], "/target": [301, "/elsewhere"], "/elsewhere": [200],
      "/gone": [301, "/nothing"],
    });
    const r = await run({ checkIds: ["redirect.imported"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (!wire(r.result)) throw new Error("the result does not match the tool's output schema");
    const res = r.result as { status: string; counts: Record<string, number>; classes: Record<string, number>; firstErrors: { fromPath: string; class: string }[] };
    expect(res.status).toBe("fail");
    expect(res.counts).toEqual({ pass: 1, fail: 6, inconclusive: 0 });
    expect(res.classes).toEqual({ landed: 1, chain: 1, loop: 2, "wrong-status": 1, "wrong-target": 1, "bad-landing": 1 });
    expect(Object.fromEntries(res.firstErrors.map((e) => [e.fromPath, e.class]))).toEqual({
      "/two-hops": "chain", "/loop-a": "loop", "/loop-b": "loop", "/status": "wrong-status", "/target": "wrong-target", "/gone": "bad-landing",
    });
    expect(await counted()).toBe(false);
  });

  it("a site that does not answer, or a saved target on another site, is inconclusive and never counts", async () => {
    await saveRedirects([["/old", "/new"]]);
    S.net.mockImplementation(async (url: string) => ({ outcome: "inconclusive", url, status: 503, reason: "HTTP 503" }));
    expect(await run({ checkIds: ["redirect.imported"] })).toMatchObject({ ok: true, result: { status: "inconclusive", finished: true, counts: { pass: 0, fail: 0, inconclusive: 1 } } });
    expect(await counted()).toBe(false);

    await prisma.redirect.deleteMany();
    await saveRedirects([["/partner", "https://partner.example.test/x"]]);
    S.net.mockReset();
    serve({ "/partner": [301, "https://partner.example.test/x"] });
    const r = await run({ checkIds: ["redirect.imported"] });
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", classes: { external: 1 } } });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect(asked()).toEqual(["/partner"]);
    expect(await counted()).toBe(false);
  });

  it("a target on the domain the project moves is asked on the new site", async () => {
    await saveRedirects([["/feed", `${OLD}/feed/google.xml`]]);
    serve({ "/feed": [301, `${OLD}/feed/google.xml`], "/feed/google.xml": [200] });
    expect(await run({ checkIds: ["redirect.imported"] })).toMatchObject({ ok: true, result: { status: "pass", classes: { landed: 1 } } });
    expect(S.net.mock.calls.map((c) => c[0])).toEqual([`${SHOP}/feed`, `${SHOP}/feed/google.xml`]);
  });

  it("that domain on http, as the CSV writes it for a store on http, is inconclusive and never counts", async () => {
    const http = "http://old.example.test/feed/google.xml";
    await saveRedirects([["/feed", http]]);
    serve({ "/feed": [301, http], "/feed/google.xml": [200] });
    const r = await run({ checkIds: ["redirect.imported"] });
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", classes: { external: 1 }, firstErrors: [{ fromPath: "/feed", toPath: http, class: "external", finalUrl: http }] } });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect(asked()).toEqual(["/feed"]);
    expect(await counted()).toBe(false);
  });

  it(`more than one chunk (${PARITY_CHUNK}): inconclusive and unfinished until its last call, which continues from the cursor`, async () => {
    const paths = await manyLanding(PARITY_CHUNK + 3);
    const first = await run({ checkIds: ["redirect.imported"] });
    expect(first).toMatchObject({ ok: true, result: { status: "inconclusive", finished: false, chunk: PARITY_CHUNK, processed: PARITY_CHUNK, total: PARITY_CHUNK + 3 } });
    if (!first.ok) return;
    if (!wire(first.result)) throw new Error("the result does not match the tool's output schema");
    const { runId, nextCursor } = first.result as { runId: string; nextCursor: string };
    expect(nextCursor).toBe(runId);
    const open = await prisma.migrationCheckRun.findUniqueOrThrow({ where: { id: runId } });
    expect(open).toMatchObject({ status: "inconclusive", finishedAt: null });
    expect(open.cursor).toBeTruthy();
    expect(await counted()).toBe(false);
    expect((await ready()).checks.find((c) => c.checkId === "redirect.imported")).toMatchObject({ status: "inconclusive", fresh: false });

    // The rows left are exactly those past the cursor: the ids sort in the order they were read.
    const ids = (await prisma.redirect.findMany({ orderBy: { id: "asc" }, select: { id: true, fromPath: true } }));
    const left = ids.filter((r) => r.id > (open.cursor as string)).map((r) => r.fromPath);
    expect(left).toHaveLength(3);
    S.net.mockClear();
    const second = await run({ checkIds: ["redirect.imported"], cursor: nextCursor });
    expect(second).toMatchObject({ ok: true, result: { runId, status: "pass", finished: true, nextCursor: null, chunk: 3, processed: PARITY_CHUNK + 3, total: PARITY_CHUNK + 3, counts: { pass: PARITY_CHUNK + 3 } } });
    expect(asked().filter((p) => p !== "/new").sort()).toEqual([...left].sort());

    const runs = await prisma.migrationCheckRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: runId, status: "pass", cursor: null });
    expect(runs[0].finishedAt).toBeInstanceOf(Date);
    expect(await audits()).toBe(2);
    expect(await counted()).toBe(true);
    expect(paths).toHaveLength(PARITY_CHUNK + 3);
  });

  it("a cursor alone continues the check its run measures", async () => {
    await manyLanding(PARITY_CHUNK + 1);
    const first = await run({ checkIds: ["redirect.imported"] });
    if (!first.ok) throw new Error(first.error);
    const { nextCursor } = first.result as { nextCursor: string };
    expect(await run({ cursor: nextCursor })).toMatchObject({ ok: true, result: { checkId: "redirect.imported", status: "pass", finished: true, chunk: 1 } });
  });

  it("a fail in an early chunk survives the resume", async () => {
    await manyLanding(PARITY_CHUNK + 1);
    const firstId = (await prisma.redirect.findFirstOrThrow({ orderBy: { id: "asc" } }));
    S.net.mockImplementation(async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname === firstId.fromPath) return page(url, 404);
      return pathname === "/new" ? page(url) : moved(url, 301, "/new");
    });
    const first = await run({ checkIds: ["redirect.imported"] });
    if (!first.ok) throw new Error(first.error);
    expect(first.result).toMatchObject({ status: "inconclusive", finished: false, counts: { fail: 1 } });
    const second = await run({ cursor: (first.result as { nextCursor: string }).nextCursor });
    expect(second).toMatchObject({ ok: true, result: { status: "fail", finished: true, counts: { pass: PARITY_CHUNK, fail: 1 } } });
    if (second.ok) expect((second.result as { firstErrors: { fromPath: string }[] }).firstErrors[0].fromPath).toBe(firstId.fromPath);
  });

  it("a cursor does not continue another check's run, a finished one, or one the saved redirects moved under", async () => {
    await manyLanding(PARITY_CHUNK + 1);
    const first = await run({ checkIds: ["redirect.imported"] });
    if (!first.ok) throw new Error(first.error);
    const { nextCursor } = first.result as { nextCursor: string };
    S.net.mockClear();
    expect(await run({ checkIds: ["url.parity"], cursor: nextCursor })).toMatchObject({ ok: false, error: expect.stringContaining("the run is unknown or finished") });
    await saveRedirects([["/added-meanwhile", "/new"]]);
    expect(await run({ checkIds: ["redirect.imported"], cursor: nextCursor })).toMatchObject({ ok: false, error: expect.stringContaining("the saved redirects changed since it started") });
    expect(S.net).not.toHaveBeenCalled();
    await prisma.redirect.delete({ where: { fromPath: "/added-meanwhile" } });
    const done = await run({ checkIds: ["redirect.imported"], cursor: nextCursor });
    expect(done).toMatchObject({ ok: true, result: { finished: true } });
    expect(await run({ checkIds: ["redirect.imported"], cursor: nextCursor })).toMatchObject({ ok: false, error: expect.stringContaining("the run is unknown or finished") });
  });

  it("a time budget spent is an unfinished run, never a pass, and the next call picks it up", async () => {
    const { runRedirectImported } = await import("@/lib/migration/runner");
    await manyLanding(2);
    // Nothing starts past budget − 8 s, so a budget of 8 s launches no row.
    const spent = await runRedirectImported("apikey:test", { budgetMs: 8_000 });
    expect(spent).toMatchObject({ status: "inconclusive", finished: false, chunk: 0, processed: 0 });
    expect(S.net).not.toHaveBeenCalled();
    expect(await counted()).toBe(false);
    expect(await run({ cursor: spent.nextCursor })).toMatchObject({ ok: true, result: { status: "pass", finished: true, chunk: 2, processed: 2 } });
  });

  it("a hop past the deadline is not sent: that row is inconclusive, never a fail or a pass", async () => {
    await saveRedirects([["/old", "/new"]]);
    const real = Date.now.bind(Date);
    let skew = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => real() + skew);
    S.net.mockImplementation(async (url: string) => {
      skew = 60_000;
      return moved(url, 301, "/new");
    });
    try {
      const r = await run({ checkIds: ["redirect.imported"] });
      expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", finished: true, classes: { inconclusive: 1 }, firstErrors: [{ fromPath: "/old", detail: "time budget spent" }] } });
      expect(asked()).toEqual(["/old"]);
    } finally {
      clock.mockRestore();
    }
    expect(await counted()).toBe(false);
  });

  it("a redirect saved, changed or removed after the pass makes it stale; put back, it counts again", async () => {
    await saveRedirects([["/old", "/new"]]);
    serve({ "/old": [301, "/new"], "/new": [200] });
    expect(await run({ checkIds: ["redirect.imported"] })).toMatchObject({ ok: true, result: { status: "pass" } });
    expect(await counted()).toBe(true);

    await saveRedirects([["/later", "/new"]]);
    expect(await counted()).toBe(false);
    await prisma.redirect.delete({ where: { fromPath: "/later" } });
    expect(await counted()).toBe(true);
    await prisma.redirect.update({ where: { fromPath: "/old" }, data: { toPath: "/other" } });
    expect(await counted()).toBe(false);
    await prisma.redirect.update({ where: { fromPath: "/old" }, data: { toPath: "/new" } });
    expect(await counted()).toBe(true);
    await prisma.redirect.update({ where: { fromPath: "/old" }, data: { statusCode: 302 } });
    expect(await counted()).toBe(false);
  });

  it("a board with no run of the redirects never reads the Redirect table", async () => {
    await saveRedirects([["/old", "/new"]]);
    S.touched.clear();
    await ready();
    expect(S.touched).not.toContain("redirect");
    serve({ "/old": [301, "/new"], "/new": [200] });
    await run({ checkIds: ["redirect.imported"] });
    S.touched.clear();
    await ready();
    expect(S.touched).toContain("redirect");
  });

  it("a deploy or a new target makes the pass stale like any other", async () => {
    await saveRedirects([["/old", "/new"]]);
    serve({ "/old": [301, "/new"], "/new": [200] });
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-a");
    await run({ checkIds: ["redirect.imported"] });
    expect(await counted()).toBe(true);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-b");
    expect(await counted()).toBe(false);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-a");
    expect(await counted()).toBe(true);
    await prisma.migrationProject.updateMany({ data: { targetUrl: "https://other.example.test" } });
    expect(await counted()).toBe(false);
  });

  it("no redirect saved is skip, finished, and never counts", async () => {
    const r = await run({ checkIds: ["redirect.imported"] });
    expect(r).toMatchObject({ ok: true, result: { status: "skip", finished: true, processed: 0, total: 0, detail: expect.stringContaining("No redirect is saved") } });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect(S.net).not.toHaveBeenCalled();
    expect(await counted()).toBe(false);
  });

  it("needs a new site to measure but no freeze: the check reads no frozen URL", async () => {
    await saveRedirects([["/old", "/new"]]);
    serve({ "/old": [301, "/new"], "/new": [200] });
    await prisma.migrationProject.updateMany({ data: { frozenAt: null, snapshot: undefined } });
    expect(await run({ checkIds: ["redirect.imported"] })).toMatchObject({ ok: true, result: { status: "pass" } });
    await prisma.migrationProject.updateMany({ data: { targetUrl: null } });
    S.net.mockClear();
    for (const id of ["redirect.imported", "redirect.active"]) {
      expect(await run({ checkIds: [id] }), id).toMatchObject({ ok: false, error: expect.stringContaining("Set the new site's address first") });
    }
    expect(S.net).not.toHaveBeenCalled();
  });

  it("no migration project: refused, nothing asked", async () => {
    await prisma.migrationProject.deleteMany();
    for (const id of ["redirect.imported", "redirect.active", "redirect.legacy-shadow"]) {
      expect(await run({ checkIds: [id] }), id).toMatchObject({ ok: false, error: expect.stringContaining("No migration project yet") });
    }
    expect(S.net).not.toHaveBeenCalled();
  });

  it.each(["redirect.imported", "redirect.active", "redirect.legacy-shadow"])("%s with the flag off is refused before any read, request or audit", async (id) => {
    S.features = { migrationDashboard: false };
    await saveRedirects([["/old", "/new"]]);
    S.touched.clear();
    expect(await run({ checkIds: [id] })).toMatchObject({ ok: false, status: 500, error: DISABLED });
    expect([...S.touched]).toEqual([]);
    expect(S.net).not.toHaveBeenCalled();
    expect(await audits()).toBe(0);
  });

  it("the tool lists the checks, one per call; a one-call check takes no cursor", async () => {
    expect((await ready() as unknown as { runnable: string[] }).runnable).toEqual(expect.arrayContaining(["redirect.imported", "redirect.active", "redirect.legacy-shadow"]));
    expect(await run({ checkIds: ["redirect.imported", "redirect.active"] })).toMatchObject({ ok: false, status: 422 });
    for (const id of ["redirect.active", "redirect.legacy-shadow"]) {
      expect(await run({ checkIds: [id], cursor: "run-1" }), id).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("takes no cursor") });
    }
    expect(await audits()).toBe(0);
  });
});

describe.skipIf(!sqlite)("redirect.active, without Upstash: the proxy reads the Redirect table", () => {
  beforeAll(async () => deploy(false), 60_000);

  it("the site answering as saved is active: ONE finished run under ONE audit entry, nothing saved changed", async () => {
    await saveRedirects([["/old", "/new"], ["/b", "/c", 302]]);
    serve({ "/old": [301, "/new"], "/b": [302, "/c"] });
    const before = await redirectRows();
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({ ok: true, result: { checkId: "redirect.active", status: "pass", state: "active", store: "database", saved: 2, inStore: 2, probed: 2, answering: 2, finished: true, nextCursor: null } });
    if (r.ok) expect(wire(r.result)).toBe(true);
    // The first answer only: where each lands is redirect.imported's.
    expect(asked().sort()).toEqual(["/b", "/old"]);
    expect(S.redisGet).not.toHaveBeenCalled();
    const runs = await prisma.migrationCheckRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ checkId: "redirect.active", status: "pass" });
    expect(runs[0].finishedAt).toBeInstanceOf(Date);
    expect(runs[0].bindings).toMatchObject({ redirectsHash: expect.any(String) });
    expect(await audits()).toBe(1);
    expect(await redirectRows()).toEqual(before);
    expect((await ready()).checks.find((c) => c.checkId === "redirect.active")).toMatchObject({ status: "pass", fresh: true });
  });

  it("a site that does not serve them (a build before RED1, a proxy that cannot reach the database): saved but not active, named, never a pass", async () => {
    await saveRedirects([["/old", "/new"]]);
    serve({});
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({
      ok: true,
      result: {
        status: "warn", state: "saved-not-active", store: "database", inStore: 1, answering: 0,
        notActive: { count: 1, first: [{ fromPath: "/old", toPath: "/new", why: "not-answering", detail: expect.stringContaining("answers HTTP 404") }] },
      },
    });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect((await prisma.migrationCheckRun.findFirstOrThrow()).status).toBe("warn");
    expect((await ready()).checks.find((c) => c.checkId === "redirect.active")).toMatchObject({ status: "warn", fresh: false });
  });

  it("nothing saved is skip, and the site is not asked", async () => {
    expect(await run({ checkIds: ["redirect.active"] })).toMatchObject({ ok: true, result: { status: "skip", state: "nothing-saved", saved: 0, probed: 0 } });
    expect(S.net).not.toHaveBeenCalled();
    expect((await prisma.migrationCheckRun.findFirstOrThrow()).status).toBe("skip");
  });

  it("a site that does not answer is inconclusive", async () => {
    await saveRedirects([["/old", "/new"]]);
    S.net.mockImplementation(async (url: string) => ({ outcome: "inconclusive", url, status: 0, reason: "timeout" }));
    expect(await run({ checkIds: ["redirect.active"] })).toMatchObject({ ok: true, result: { status: "inconclusive", state: "not-measured" } });
  });

  it(`asks at most ${REDIRECT_ACTIVE_SAMPLE} of many, spread over the table, and still compares them all`, async () => {
    const paths = await manyLanding(REDIRECT_ACTIVE_SAMPLE * 5);
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({ ok: true, result: { status: "pass", saved: paths.length, inStore: paths.length, probed: REDIRECT_ACTIVE_SAMPLE } });
    const ids = (await prisma.redirect.findMany({ orderBy: { id: "asc" }, select: { fromPath: true } })).map((x) => x.fromPath);
    const positions = asked().map((p) => ids.indexOf(p)).sort((a, b) => a - b);
    expect(asked()).toHaveLength(REDIRECT_ACTIVE_SAMPLE);
    expect(positions[0]).toBe(0);
    expect(positions.at(-1)).toBeGreaterThan(ids.length * 0.8);
  });

  it(`a count that does not divide evenly still asks at most ${REDIRECT_ACTIVE_SAMPLE}`, async () => {
    await manyLanding(REDIRECT_ACTIVE_SAMPLE * 2 - 1);
    expect(await run({ checkIds: ["redirect.active"] })).toMatchObject({ ok: true, result: { status: "pass", probed: REDIRECT_ACTIVE_SAMPLE } });
    expect(asked()).toHaveLength(REDIRECT_ACTIVE_SAMPLE);
  });

  it("a time budget spent before the site was asked is inconclusive, never a pass", async () => {
    const { runRedirectActive } = await import("@/lib/migration/runner");
    await manyLanding(2);
    // Nothing starts past budget − 8 s, so a budget of 8 s asks about no row.
    expect(await runRedirectActive("apikey:test", { budgetMs: 8_000 })).toMatchObject({ status: "inconclusive", state: "not-measured", saved: 2, inStore: 2, probed: 0 });
    expect(S.net).not.toHaveBeenCalled();
  });

  it("a redirect saved after the pass makes it stale", async () => {
    await saveRedirects([["/old", "/new"]]);
    serve({ "/old": [301, "/new"] });
    await run({ checkIds: ["redirect.active"] });
    expect((await ready()).checks.find((c) => c.checkId === "redirect.active")?.fresh).toBe(true);
    await saveRedirects([["/later", "/new"]]);
    expect((await ready()).checks.find((c) => c.checkId === "redirect.active")?.fresh).toBe(false);
  });
});

describe.skipIf(!sqlite)("redirect.active, with Upstash: the proxy reads the Redis map only", () => {
  beforeAll(async () => deploy(true), 60_000);
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
  });

  it("the map holding what is saved, and the site answering: active", async () => {
    await saveRedirects([["/old", "/new"]]);
    S.redisGet.mockResolvedValue(JSON.stringify({ "/old": { to: "/new", status: 301 } }));
    serve({ "/old": [301, "/new"] });
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({ ok: true, result: { status: "pass", state: "active", store: "redis", inStore: 1, answering: 1 } });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect(S.redisGet).toHaveBeenCalledWith("cartwright_redirects");
  });

  it("a map that was never written (rows saved before Upstash, or past the sync): saved but not active, named, whatever the table holds", async () => {
    await saveRedirects([["/old", "/new"], ["/b", "/c"]]);
    S.redisGet.mockResolvedValue(null);
    serve({});
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({ ok: true, result: { status: "warn", state: "saved-not-active", store: "redis", saved: 2, inStore: 0, notActive: { count: 2 } } });
    if (r.ok) {
      expect(wire(r.result)).toBe(true);
      const res = r.result as { notActive: { first: { fromPath: string; why: string }[] }; detail: string };
      expect(res.notActive.first.map((n) => [n.fromPath, n.why]).sort()).toEqual([["/b", "not-in-store"], ["/old", "not-in-store"]]);
      expect(res.detail).toContain("reads the Redis map");
    }
  });

  it("a stale map: the row differs, and a source nobody saved is named", async () => {
    await saveRedirects([["/old", "/new"]]);
    S.redisGet.mockResolvedValue({ "/old": { to: "/stale", status: 301 } });
    serve({ "/old": [301, "/stale"] });
    expect(await run({ checkIds: ["redirect.active"] })).toMatchObject({ ok: true, result: { status: "warn", state: "saved-not-active", notActive: { first: [{ fromPath: "/old", why: "differs-in-store" }] } } });
    S.redisGet.mockResolvedValue({ "/old": { to: "/new", status: 301 }, "/deleted": { to: "/x", status: 301 } });
    serve({ "/old": [301, "/new"] });
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({ ok: true, result: { status: "warn", state: "served-not-saved", servedNotSaved: ["/deleted"] } });
    if (r.ok) expect(wire(r.result)).toBe(true);
  });

  it("Redis that cannot be read is inconclusive, not 'no redirects'", async () => {
    await saveRedirects([["/old", "/new"]]);
    S.redisGet.mockRejectedValue(new Error("connection refused"));
    serve({ "/old": [301, "/new"] });
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", state: "not-measured", store: "redis", notActive: { count: 0 } } });
    if (r.ok) expect(wire(r.result)).toBe(true);
  });

  it("Redis that cannot be read with nothing saved is inconclusive too, not 'nothing saved'", async () => {
    S.redisGet.mockRejectedValue(new Error("connection refused"));
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", state: "not-measured", store: "redis", saved: 0 } });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect(S.net).not.toHaveBeenCalled();
    const stored = await prisma.migrationCheckRun.findFirstOrThrow({ where: { checkId: "redirect.active" } });
    expect(stored.status).toBe("inconclusive");
  });

  it("Redis that cannot be read and a row the site does not answer as saved: saved but not active, named, which is what that outage does to a visitor", async () => {
    await saveRedirects([["/old", "/new"], ["/b", "/c"]]);
    S.redisGet.mockResolvedValue("not json");
    serve({ "/b": [301, "/c"] });
    const r = await run({ checkIds: ["redirect.active"] });
    expect(r).toMatchObject({
      ok: true,
      result: { status: "warn", state: "saved-not-active", store: "redis", saved: 2, inStore: 0, probed: 2, answering: 1, notActive: { count: 1, first: [{ fromPath: "/old", why: "not-answering" }] } },
    });
    if (r.ok) {
      expect(wire(r.result)).toBe(true);
      expect((r.result as { detail: string }).detail).toContain("The Redis map could not be read");
    }
  });
});

describe.skipIf(!sqlite)("redirect.legacy-shadow, on a real database", () => {
  beforeAll(async () => deploy(false), 60_000);
  const freeze = async (paths: string[]) => {
    const project = await prisma.migrationProject.findFirstOrThrow();
    await prisma.migrationUrlMap.createMany({
      data: paths.map((oldPath) => ({ projectId: project.id, oldUrl: `${OLD}${oldPath}`, oldPath, kind: "product", images: [] })),
    });
  };

  it("a frozen path under a legacy slug fails, named: ONE run, ONE audit entry, and no request at all", async () => {
    await freeze(["/hegn/type-1/", "/produkt/type-1/"]);
    const r = await run({ checkIds: ["redirect.legacy-shadow"] });
    expect(r).toMatchObject({
      ok: true,
      result: { checkId: "redirect.legacy-shadow", status: "fail", finished: true, nextCursor: null, permalinkBranch: false, checked: 2, shadowed: { count: 1, first: [{ path: "/produkt/type-1/", segment: "produkt" }] } },
    });
    if (r.ok) expect(wire(r.result)).toBe(true);
    expect(S.net).not.toHaveBeenCalled();
    const runs = await prisma.migrationCheckRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ checkId: "redirect.legacy-shadow", status: "fail" });
    expect(runs[0].bindings).toMatchObject({ snapshotId: "snap-1" });
    expect(runs[0].bindings).not.toHaveProperty("redirectsHash");
    expect(await audits()).toBe(1);
  });

  it("none under one passes; nothing frozen is skip; neither needs a new site", async () => {
    await prisma.migrationProject.updateMany({ data: { targetUrl: null } });
    expect(await run({ checkIds: ["redirect.legacy-shadow"] })).toMatchObject({ ok: true, result: { status: "skip", checked: 0 } });
    await freeze(["/hegn/type-1/", "/produkter/"]);
    expect(await run({ checkIds: ["redirect.legacy-shadow"] })).toMatchObject({ ok: true, result: { status: "pass", checked: 2 } });
    expect(S.net).not.toHaveBeenCalled();
  });

  it("with the permalink branch on, a live product's stored permalink answers first; a path nothing stores does not", async () => {
    S.permalinks = true;
    await prisma.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
    await prisma.product.create({ data: { id: "p1", slug: "p1", name: "P1", description: "", priceDkk: 100, images: "[]", categoryId: "cat", permalink: "/produkt/type-1/" } });
    await freeze(["/produkt/type-1/", "/hegn/x/"]);
    expect(await run({ checkIds: ["redirect.legacy-shadow"] })).toMatchObject({ ok: true, result: { status: "pass", permalinkBranch: true, servedByPermalink: 1, shadowed: { count: 0 } } });

    await freeze(["/produkt/nothing-stores-this/"]);
    const r = await run({ checkIds: ["redirect.legacy-shadow"] });
    expect(r).toMatchObject({ ok: true, result: { status: "fail", permalinkBranch: true, servedByPermalink: 1, shadowed: { count: 1, first: [{ path: "/produkt/nothing-stores-this/" }] } } });
  });

  it("a re-run answers for the tables now, not the proxy's 60 s copy: a permalink removed or stored since the last run counts at once", async () => {
    S.permalinks = true;
    await prisma.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
    await prisma.product.create({ data: { id: "p1", slug: "p1", name: "P1", description: "", priceDkk: 100, images: "[]", categoryId: "cat", permalink: "/produkt/type-1/" } });
    await freeze(["/produkt/type-1/"]);
    const shadow = () => run({ checkIds: ["redirect.legacy-shadow"] });
    expect(await shadow()).toMatchObject({ ok: true, result: { status: "pass", servedByPermalink: 1, shadowed: { count: 0 } } });

    await prisma.product.update({ where: { id: "p1" }, data: { permalink: null } });
    expect(await shadow()).toMatchObject({ ok: true, result: { status: "fail", servedByPermalink: 0, shadowed: { count: 1 } } });

    await prisma.product.update({ where: { id: "p1" }, data: { permalink: "/produkt/type-1/" } });
    expect(await shadow()).toMatchObject({ ok: true, result: { status: "pass", servedByPermalink: 1, shadowed: { count: 0 } } });
  });

  it("permalink tables that cannot be read save no run: neither a pass on the last map nor a fail on an empty one", async () => {
    S.permalinks = true;
    await freeze(["/produkt/type-1/"]);
    const real = S.client;
    S.client = new Proxy(real, { get: (t, key) => (key === "category" ? { findMany: async () => { throw new Error("db down"); } } : Reflect.get(t, key)) });
    try {
      expect(await run({ checkIds: ["redirect.legacy-shadow"] })).toMatchObject({ ok: false, status: 500, error: expect.stringContaining("db down") });
    } finally {
      S.client = real;
    }
    expect(await prisma.migrationCheckRun.count()).toBe(0);
    expect(await audits()).toBe(0);
  });

  it("a saved redirect does not touch the shadow check's freshness: it reads frozen paths, not redirects", async () => {
    const fresh = async (id: string) => (await ready()).checks.find((c) => c.checkId === id)?.fresh;
    await freeze(["/hegn/type-1/"]);
    await saveRedirects([["/old", "/new"]]);
    serve({ "/old": [301, "/new"], "/new": [200] });
    await run({ checkIds: ["redirect.legacy-shadow"] });
    await run({ checkIds: ["redirect.imported"] });
    expect([await fresh("redirect.legacy-shadow"), await fresh("redirect.imported")]).toEqual([true, true]);
    await saveRedirects([["/later", "/new"]]);
    expect([await fresh("redirect.legacy-shadow"), await fresh("redirect.imported")]).toEqual([true, false]);
  });
});
