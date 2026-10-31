import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import {
  ADMIN_TOOL_ALLOWLIST,
  CONFIRM_REQUIRED,
  CUSTOMER_TOOL_ALLOWLIST,
  needsConfirmation,
} from "@/lib/ai/client";
import { buildVoiceShopTools } from "@/lib/voice/tools";
import { sitemapKind } from "@/lib/migration/sitemap";
import { PAGE_CHUNK, PARITY_CHUNK } from "@/lib/migration/runner";
import { configHashOf } from "@/lib/migration/store";
import type { MigrationResponse } from "@/lib/migration/fetch";
import { brand } from "@/brand.config";

/**
 * MIGD-3 — the migration.* tools (lib/tools/migration.ts), mirroring
 * redirects-import-tool.test.ts: registry contract + the moat (admin/build agent
 * only, confirm-gated writes, never the shopper chat or voice), 403 without the
 * scope, 422 on bad input before any handler code, the runtime flag off ⇒ every
 * handler refuses before a Migration* read, a dry run writes nothing, and each
 * write is ONE transaction under ONE audit entry. `switchedAt` has one writer:
 * `migration.attest cutover.switched`.
 *
 * The network is the fetch module's `migrationFetcher`, replaced by a table of
 * answers per URL; the database is a small in-memory fake.
 */

type Row = Record<string, unknown> & { id: string };

const mocks = vi.hoisted(() => {
  const state = {
    project: null as Record<string, unknown> | null,
    urls: [] as Row[],
    products: [] as { permalink: string | null; attributes: unknown; deletedAt?: Date | null }[],
    run: null as Record<string, unknown> | null,
    features: { migrationDashboard: true } as Record<string, boolean>,
    available: true,
    answers: new Map<string, unknown>(),
  };
  const write = (op: string) => vi.fn((args: unknown) => ({ op, args }));
  // A project write replaces the row (earlier reads keep what they read) and moves updatedAt like @updatedAt.
  const save = (data: Record<string, unknown>) => {
    state.project = { ...state.project, ...data, updatedAt: (data.updatedAt as Date | undefined) ?? new Date() };
  };
  // A frozen row passes when every condition the runner sent holds: `expect` and, for the product check, `kind`.
  const inMap = (u: Row, where?: { expect?: { not: string }; kind?: string }) =>
    (!where?.expect || u.expect !== where.expect.not) && (!where?.kind || (u.kind ?? "page") === where.kind);
  const prisma = {
      product: {
        findMany: vi.fn(async ({ where }: { where: { permalink: { in: string[] }; deletedAt?: null } }) =>
          state.products.filter((p) => p.permalink !== null && where.permalink.in.includes(p.permalink) && !(where.deletedAt === null && p.deletedAt))),
      },
      migrationProject: {
        findFirst: vi.fn(async () => state.project),
        findUnique: vi.fn(async () => state.project),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "proj-new", targetUrl: null, ...data })),
        update: vi.fn((args: { data: Record<string, unknown> }) => (save(args.data), { op: "project.update", args })),
        // Compare-and-set: only a row still carrying the updatedAt the caller read is written.
        updateMany: vi.fn(async (args: { where: { updatedAt?: Date }; data: Record<string, unknown> }) => {
          const current = (state.project?.updatedAt as Date | undefined)?.getTime();
          if (args.where.updatedAt && args.where.updatedAt.getTime() !== current) return { count: 0 };
          save(args.data);
          return { count: 1 };
        }),
      },
      migrationUrlMap: {
        count: vi.fn(async (args?: { where?: { expect?: { not: string }; kind?: string } }) =>
          state.urls.filter((u) => inMap(u, args?.where)).length),
        findMany: vi.fn(async ({ where, take }: { where: { id?: { gt: string }; expect?: { not: string }; kind?: string }; take: number }) =>
          state.urls.filter((u) => (!where.id || u.id > where.id.gt) && inMap(u, where)).slice(0, take)),
        update: write("url.update"),
        deleteMany: write("url.deleteMany"),
        createMany: write("url.createMany"),
      },
      migrationCheckRun: {
        findUnique: vi.fn(async () => state.run),
        findMany: vi.fn(async () => []),
        create: write("run.create"),
        update: write("run.update"),
      },
      $transaction: vi.fn(async (arg: unknown): Promise<unknown> =>
        typeof arg === "function" ? arg(prisma) : (arg as unknown[]).map((o) => (o as { args?: { data?: unknown } }).args?.data ?? o)),
  };
  return {
    state,
    prisma,
    withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
    fetch: vi.fn(),
    gate: vi.fn(async () => ({ available: state.available, features: { ...state.features } })),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/brand", async (orig) => ({ ...(await orig<typeof import("@/lib/brand")>()), getFeatureGateState: mocks.gate }));
vi.mock("@/lib/migration/fetch", () => ({
  migrationFetcher: (base: { allowHosts: readonly string[] }) => (url: string) => mocks.fetch(url, base),
}));

const P = mocks.prisma;
const S = mocks.state;
const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-migration" };
const ADMIN = ["settings:read", "settings:write"] as const;
const SRC = "https://old-shop.example";
const NEW = "https://new-shop.example";
const DISABLED = "Migration dashboard is disabled. Enable 'migrationDashboard' (/admin/features) first.";
const NAMES = ["migration.status", "migration.run_checks", "migration.project_set", "migration.freeze_sitemap", "migration.attest"];

const page = (url: string, body = "<html>ok</html>"): MigrationResponse =>
  ({ outcome: "answer", url, status: 200, location: null, contentType: "text/html", body, truncated: false });
const moved = (url: string, status: number, location: string): MigrationResponse =>
  ({ outcome: "answer", url, status, location, contentType: "text/html", body: "", truncated: false });
const xml = (url: string, body: string) => ({ ...page(url, body), contentType: "application/xml" });
const answer = (url: string, a: MigrationResponse | ((u: string) => MigrationResponse)) => S.answers.set(url, a);

const invoke = (name: string, args: unknown, scopes: readonly string[] = ADMIN) =>
  invokeTool(name, args, CTX, scopes as never);
const wire = (name: string, result: unknown) => getTool(name)!.output.safeParse(JSON.parse(JSON.stringify(result)));
/** Every `data` handed to a create/update/createMany, wherever it went. */
const written = () =>
  [P.migrationProject.update, P.migrationProject.updateMany, P.migrationProject.create, P.migrationUrlMap.update, P.migrationCheckRun.create, P.migrationCheckRun.update]
    .flatMap((f) => f.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data));
/** The project write a sign-off made (a compare-and-set since R2). */
const projectWrite = () =>
  ([...P.migrationProject.updateMany.mock.calls, ...P.migrationProject.update.mock.calls][0][0] as { data: Record<string, unknown> }).data;
const runData = () => (P.migrationCheckRun.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

const url = (n: number, oldPath: string, extra: Record<string, unknown> = {}): Row =>
  ({ id: `u${String(n).padStart(4, "0")}`, oldUrl: `${SRC}${oldPath}`, oldPath, expect: "same", newPath: null, ...extra });
const frozenProject = (over: Record<string, unknown> = {}) => ({
  id: "proj-1", sourceUrl: SRC, targetUrl: NEW, sourceKind: "woocommerce",
  frozenAt: new Date("2026-10-24T08:00:00Z"), switchedAt: null, snapshot: { id: "snap-1" },
  settings: null, attestations: null, equivalenceCases: null,
  createdAt: new Date("2026-10-20T08:00:00Z"), updatedAt: new Date("2026-10-24T08:00:00Z"), ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Drop any queued one-off answers a test left unused; the fake's own implementation stays.
  P.migrationProject.updateMany.mockReset();
  P.migrationProject.findFirst.mockReset();
  S.project = frozenProject();
  S.urls = [];
  S.products = [];
  S.run = null;
  S.features = { migrationDashboard: true };
  S.available = true;
  S.answers.clear();
  // No build known unless a test says so (CI may not, a Vercel shell would).
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
  mocks.fetch.mockImplementation(async (url: string) => {
    const a = S.answers.get(url);
    if (!a) return { outcome: "answer", url, status: 404, location: null, contentType: "text/html", body: "", truncated: false };
    return typeof a === "function" ? (a as (u: string) => MigrationResponse)(url) : a;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("migration.* — registry contract + the moat", () => {
  it("registers the five tools on the existing settings scopes", () => {
    expect(NAMES.map((n) => [n, getTool(n)?.scope])).toEqual([
      ["migration.status", "settings:read"],
      ["migration.run_checks", "settings:read"],
      ["migration.project_set", "settings:write"],
      ["migration.freeze_sitemap", "settings:write"],
      ["migration.attest", "settings:write"],
    ]);
  });

  it("is the admin / build agent's, the writes confirm-gated there and a freeze's dry run a read", () => {
    for (const n of NAMES) expect(ADMIN_TOOL_ALLOWLIST as readonly string[]).toContain(n);
    expect(NAMES.filter((n) => CONFIRM_REQUIRED.has(n as never))).toEqual(["migration.project_set", "migration.freeze_sitemap", "migration.attest"]);
    expect(needsConfirmation("migration.freeze_sitemap", { dryRun: true })).toBe(false);
    expect(needsConfirmation("migration.freeze_sitemap", { confirm: true })).toBe(true);
    expect(needsConfirmation("migration.freeze_sitemap", { dryRun: "true" })).toBe(true);
  });

  it("never reaches the shopper chat or voice, even when a saved voice list names it", () => {
    for (const n of NAMES) expect(CUSTOMER_TOOL_ALLOWLIST as readonly string[]).not.toContain(n);
    expect(buildVoiceShopTools(NAMES).effectiveTools).toEqual([]);
  });
});

describe("migration.* — the runtime flag", () => {
  const valid: [string, unknown][] = [
    ["migration.status", {}],
    ["migration.run_checks", {}],
    ["migration.project_set", { sourceUrl: SRC, confirm: true }],
    ["migration.freeze_sitemap", { dryRun: true }],
    ["migration.attest", { checkId: "pay.test-order", status: "pass", note: "Order 1042", confirm: true }],
  ];

  it("off ⇒ every handler refuses with the flag's name, before any Migration* read or fetch", async () => {
    S.features = { migrationDashboard: false };
    for (const [name, args] of valid) {
      const r = await invoke(name, args);
      expect(r, name).toMatchObject({ ok: false, status: 500, error: DISABLED });
    }
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("unreadable flags fail closed", async () => {
    S.available = false;
    const r = await invoke("migration.status", {});
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/could not be read/);
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
  });
});

describe("migration.* — scope + validation", () => {
  it("403 without the scope: the writes need settings:write, the reads settings:read", async () => {
    for (const [name, args] of [
      ["migration.project_set", { sourceUrl: SRC, confirm: true }],
      ["migration.freeze_sitemap", { dryRun: true }],
      ["migration.attest", { checkId: "pay.test-order", status: "pass", note: "x", confirm: true }],
    ] as const) {
      expect(await invoke(name, args, ["settings:read"]), name).toMatchObject({ ok: false, status: 403 });
    }
    for (const name of ["migration.status", "migration.run_checks"]) {
      expect(await invoke(name, {}, ["catalog:read"]), name).toMatchObject({ ok: false, status: 403 });
    }
  });

  it.each([
    ["migration.project_set", { sourceUrl: SRC }],
    ["migration.project_set", { confirm: true }],
    ["migration.project_set", { sourceUrl: "ftp://old-shop.example", confirm: true }],
    ["migration.project_set", { sourceUrl: "http://localhost:3000", confirm: true }],
    ["migration.project_set", { targetUrl: "https://user:pw@new-shop.example", confirm: true }],
    // A query or fragment is no part of a shop's address: refused, never silently dropped (W21-STOREPATH).
    ["migration.project_set", { sourceUrl: `${SRC}/shop/?lang=da`, confirm: true }],
    ["migration.project_set", { sourceUrl: `${SRC}/shop/#top`, confirm: true }],
    ["migration.project_set", { sourceUrl: `${SRC}/?`, confirm: true }],
    ["migration.freeze_sitemap", {}],
    ["migration.freeze_sitemap", { confirm: false }],
    ["migration.freeze_sitemap", { sitemapUrl: "ftp://old-shop.example/s.xml", dryRun: true }],
    ["migration.run_checks", { checkIds: ["seo.robots"] }],
    ["migration.run_checks", { checkIds: ["url.parity", "url.content"] }],
    ["migration.attest", { checkId: "url.parity", status: "pass", note: "measured, not signed", confirm: true }],
    ["migration.attest", { checkId: "pay.test-order", status: "pass", note: "  ", confirm: true }],
    ["migration.attest", { checkId: "pay.test-order", status: "skip", note: "x", confirm: true }],
    ["migration.attest", { checkId: "pay.test-order", status: "pass", note: "x" }],
  ])("%s %o is refused (422) before any handler code runs", async (name, args) => {
    expect(await invoke(name, args)).toMatchObject({ ok: false, status: 422 });
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
  });
});

describe("migration.project_set", () => {
  it("creates the project — the source as its origin and path, the target as an origin — under one audit entry", async () => {
    S.project = null;
    const r = await invoke("migration.project_set", { sourceUrl: `${SRC}/shop/`, targetUrl: `${NEW}/da`, confirm: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // W21-STOREPATH: a WordPress in a subdirectory keeps it, trailing slash dropped.
    expect(r.result).toEqual({ id: "proj-new", sourceUrl: `${SRC}/shop`, targetUrl: NEW, created: true, freezeReset: false });
    expect(wire("migration.project_set", r.result).success).toBe(true);
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ actor: "apikey:test", tool: "migration.project_set", requestId: "test-migration" });
  });

  it("a new target alone keeps the frozen map", async () => {
    const r = await invoke("migration.project_set", { targetUrl: "https://shadow.example", confirm: true });
    expect(r).toMatchObject({ ok: true, result: { freezeReset: false, created: false } });
    expect(P.migrationProject.update.mock.calls[0][0]).toMatchObject({ data: { targetUrl: "https://shadow.example" } });
    expect(P.migrationUrlMap.deleteMany).not.toHaveBeenCalled();
    expect(P.$transaction).not.toHaveBeenCalled();
  });

  it("a new source drops the frozen map and stamps a new snapshot id, in one transaction", async () => {
    const r = await invoke("migration.project_set", { sourceUrl: "https://other-shop.example", confirm: true });
    expect(r).toMatchObject({ ok: true, result: { freezeReset: true } });
    expect(P.$transaction).toHaveBeenCalledTimes(1);
    expect(P.migrationUrlMap.deleteMany).toHaveBeenCalledWith({ where: { projectId: "proj-1" } });
    const data = (P.migrationProject.update.mock.calls[0][0] as { data: { frozenAt: unknown; snapshot: { id: string } } }).data;
    expect(data.frozenAt).toBeNull();
    expect(data.snapshot.id).not.toBe("snap-1");
    expect(written().some((d) => "switchedAt" in d)).toBe(false);
  });

  it("a root install is stored as the origin, as before: trailing slashes go, and the frozen map stays", async () => {
    for (const sourceUrl of [SRC, `${SRC}/`, `${SRC}//`]) {
      const r = await invoke("migration.project_set", { sourceUrl, confirm: true });
      expect(r, sourceUrl).toMatchObject({ ok: true, result: { freezeReset: false } });
      expect(S.project?.sourceUrl, sourceUrl).toBe(SRC);
    }
    expect(P.migrationUrlMap.deleteMany).not.toHaveBeenCalled();
  });

  it("a project saved with an origin only is the same source as that origin's root — and another path on the host is a new source", async () => {
    // The existing row (frozenProject) holds the bare origin, as every row did before W21-STOREPATH.
    expect(await invoke("migration.project_set", { sourceUrl: `${SRC}/`, confirm: true })).toMatchObject({ ok: true, result: { freezeReset: false } });
    const r = await invoke("migration.project_set", { sourceUrl: `${SRC}/shop/`, confirm: true });
    expect(r).toMatchObject({ ok: true, result: { sourceUrl: `${SRC}/shop`, freezeReset: true } });
    expect(P.migrationUrlMap.deleteMany).toHaveBeenCalledTimes(1);
    // Saved with the path: the same address with a trailing slash is not a change.
    vi.clearAllMocks();
    expect(await invoke("migration.project_set", { sourceUrl: `${SRC}/shop///`, confirm: true })).toMatchObject({ ok: true, result: { freezeReset: false } });
    expect(S.project?.sourceUrl).toBe(`${SRC}/shop`);
    expect(P.migrationUrlMap.deleteMany).not.toHaveBeenCalled();
  });

  it("without a project, sourceUrl is required", async () => {
    S.project = null;
    const r = await invoke("migration.project_set", { targetUrl: NEW, confirm: true });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(P.migrationProject.create).not.toHaveBeenCalled();
  });
});

describe("migration.freeze_sitemap", () => {
  const INDEX = `${SRC}/sitemap_index.xml`;
  beforeEach(() => {
    answer(INDEX, xml(INDEX, `<sitemapindex><sitemap><loc>${SRC}/product-sitemap.xml</loc></sitemap><sitemap><loc>${SRC}/page-sitemap.xml</loc></sitemap></sitemapindex>`));
    answer(`${SRC}/product-sitemap.xml`, xml(`${SRC}/product-sitemap.xml`,
      `<urlset><url><loc>${SRC}/produkt/a/</loc><image:image><image:loc>${SRC}/wp-content/uploads/a.jpg</image:loc></image:image></url><url><loc>${SRC}/produkt/b/</loc></url></urlset>`));
    answer(`${SRC}/page-sitemap.xml`, xml(`${SRC}/page-sitemap.xml`, `<urlset><url><loc>${SRC}/om-os/</loc></url></urlset>`));
  });

  it("dryRun crawls the source only and returns the plan without writing", async () => {
    const r = await invoke("migration.freeze_sitemap", { dryRun: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({
      dryRun: true, complete: true, capped: false, foreign: 0,
      summary: { entries: 3, valid: 3, invalid: 0, byKind: { product: 2, page: 1 } },
      sample: [{ oldPath: "/produkt/a/", kind: "product" }, { oldPath: "/produkt/b/", kind: "product" }, { oldPath: "/om-os/", kind: "page" }],
    });
    expect(wire("migration.freeze_sitemap", r.result).success).toBe(true);
    expect(new Set(mocks.fetch.mock.calls.map((c) => (c[1] as { allowHosts: string[] }).allowHosts.join()))).toEqual(new Set(["old-shop.example"]));
    expect(P.$transaction).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("confirm: true freezes once — one transaction, one audit entry, each URL with its kind", async () => {
    const r = await invoke("migration.freeze_sitemap", { confirm: true });
    expect(r).toMatchObject({ ok: true, result: { dryRun: false, frozen: 3, skipped: 0 } });
    if (!r.ok) return;
    expect(wire("migration.freeze_sitemap", r.result).success).toBe(true);
    expect(P.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ tool: "migration.freeze_sitemap", args: { projectId: "proj-1", count: 3, dryRun: false } });
    const data = (P.migrationUrlMap.createMany.mock.calls[0][0] as { data: { kind: string; images: string[] }[] }).data;
    expect(data.map((d) => d.kind)).toEqual(["product", "product", "page"]);
    expect(data[0].images).toEqual([`${SRC}/wp-content/uploads/a.jpg`]);
    expect(written().some((d) => "switchedAt" in d)).toBe(false);
  });

  it("an incomplete crawl is never frozen: confirm is refused and nothing is written", async () => {
    answer(`${SRC}/page-sitemap.xml`, { outcome: "inconclusive", url: `${SRC}/page-sitemap.xml`, status: 503, reason: "HTTP 503" });
    const r = await invoke("migration.freeze_sitemap", { confirm: true });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/incomplete.*page-sitemap\.xml: inconclusive/);
    expect(P.$transaction).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
    const dry = await invoke("migration.freeze_sitemap", { dryRun: true });
    expect(dry).toMatchObject({ ok: true, result: { complete: false } });
  });

  it("a source in a subdirectory crawls that subdirectory's sitemap; one saved with an origin only crawls the root's (W21-STOREPATH)", async () => {
    S.project = frozenProject({ sourceUrl: `${SRC}/shop` });
    const sub = `${SRC}/shop/sitemap_index.xml`;
    answer(sub, xml(sub, `<sitemapindex><sitemap><loc>${SRC}/shop/page-sitemap.xml</loc></sitemap></sitemapindex>`));
    answer(`${SRC}/shop/page-sitemap.xml`, xml(`${SRC}/shop/page-sitemap.xml`, `<urlset><url><loc>${SRC}/shop/om-os/</loc></url></urlset>`));
    const r = await invoke("migration.freeze_sitemap", { dryRun: true });
    expect(r).toMatchObject({ ok: true, result: { complete: true, summary: { entries: 1 } } });
    expect(mocks.fetch.mock.calls[0][0]).toBe(sub);
    expect(mocks.fetch.mock.calls.map((c) => c[0])).not.toContain(INDEX);
  });

  it("a sitemap on another host is refused unsent", async () => {
    const r = await invoke("migration.freeze_sitemap", { sitemapUrl: "https://cdn.example/sitemap.xml", dryRun: true });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("migration.run_checks — url.parity over the frozen map", () => {

  it("checks every frozen path on the new host and stores ONE run in ONE transaction under ONE audit entry", async () => {
    S.urls = [url(1, "/a/"), url(2, "/b"), url(3, "/c/")];
    answer(`${NEW}/a/`, page(`${NEW}/a/`));
    answer(`${NEW}/b`, moved(`${NEW}/b`, 308, "/b/"));
    answer(`${NEW}/b/`, page(`${NEW}/b/`));
    const r = await invoke("migration.run_checks", { checkIds: ["url.parity"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({
      checkId: "url.parity", status: "fail", finished: true, nextCursor: null, chunk: 3, processed: 3, total: 3, target: NEW,
      counts: { pass: 1, warn: 1, fail: 1, inconclusive: 0 },
      classes: { same: 1, "same-modulo-slash": 1, missing: 1 },
    });
    expect(wire("migration.run_checks", r.result).success).toBe(true);
    const { firstErrors } = r.result as { firstErrors: { oldUrl: string }[] };
    expect(firstErrors.map((e) => e.oldUrl)).toEqual([`${SRC}/c/`, `${SRC}/b`]);
    expect(new Set(mocks.fetch.mock.calls.map((c) => (c[1] as { allowHosts: string[] }).allowHosts.join()))).toEqual(new Set(["new-shop.example"]));
    expect(P.$transaction).toHaveBeenCalledTimes(1);
    expect(P.migrationUrlMap.update).toHaveBeenCalledTimes(3);
    expect(P.migrationUrlMap.update.mock.calls[2][0]).toMatchObject({ where: { id: "u0003" }, data: { lastStatus: "fail", lastHttp: 404 } });
    expect(runData()).toMatchObject({
      projectId: "proj-1", checkId: "url.parity", phase: "before", status: "fail",
      bindings: { snapshotId: "snap-1" }, cursor: null, actor: "apikey:test",
    });
    expect(runData()?.finishedAt).toBeInstanceOf(Date);
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ tool: "migration.run_checks", args: { projectId: "proj-1", urls: 3 } });
    expect(written().some((d) => "switchedAt" in d)).toBe(false);
  });

  it(`a map longer than one chunk (${PARITY_CHUNK}) returns a cursor, and the run reads inconclusive until its last chunk`, async () => {
    S.urls = Array.from({ length: PARITY_CHUNK + 1 }, (_, i) => url(i + 1, `/p${i + 1}/`));
    for (const u of S.urls) answer(String(u.oldUrl).replace(SRC, NEW), (x) => page(x));
    const first = await invoke("migration.run_checks", {});
    expect(first).toMatchObject({ ok: true, result: { finished: false, status: "inconclusive", chunk: PARITY_CHUNK, processed: PARITY_CHUNK, total: PARITY_CHUNK + 1 } });
    if (!first.ok) return;
    const { runId, nextCursor } = first.result as { runId: string; nextCursor: string };
    expect(nextCursor).toBe(runId);
    expect(runData()).toMatchObject({ id: runId, status: "inconclusive", finishedAt: null, cursor: `u0${PARITY_CHUNK}` });

    S.run = { ...runData(), projectId: "proj-1" };
    const second = await invoke("migration.run_checks", { cursor: nextCursor });
    expect(second).toMatchObject({ ok: true, result: { runId, finished: true, status: "pass", chunk: 1, processed: PARITY_CHUNK + 1, nextCursor: null } });
    const update = P.migrationCheckRun.update.mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> };
    expect(update.where.id).toBe(runId);
    expect(update.data).toMatchObject({ status: "pass", cursor: null });
    expect(update.data.finishedAt).toBeInstanceOf(Date);
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit).toHaveBeenCalledTimes(2);
  });

  it("a cursor across a deploy does not continue: the run's first chunk measured another build (R1)", async () => {
    S.urls = Array.from({ length: PARITY_CHUNK + 1 }, (_, i) => url(i + 1, `/p${i + 1}/`));
    for (const u of S.urls) answer(String(u.oldUrl).replace(SRC, NEW), (x) => page(x));
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-a");
    try {
      const first = await invoke("migration.run_checks", {});
      expect(first).toMatchObject({ ok: true, result: { finished: false } });
      if (!first.ok) return;
      const { nextCursor } = first.result as { nextCursor: string };
      expect(runData()?.bindings).toMatchObject({ buildSha: "build-a" });
      S.run = { ...runData(), projectId: "proj-1" };
      mocks.fetch.mockClear();
      P.$transaction.mockClear();

      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-b");
      const across = await invoke("migration.run_checks", { cursor: nextCursor });
      expect(across).toMatchObject({ ok: false, status: 500 });
      if (!across.ok) expect(across.error).toMatch(/deployed since it started \(build build-a → build-b\).*Run again without a cursor/);
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(P.$transaction).not.toHaveBeenCalled();

      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-a");
      expect(await invoke("migration.run_checks", { cursor: nextCursor })).toMatchObject({ ok: true, result: { finished: true } });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a cursor from another snapshot does not continue", async () => {
    S.urls = [url(1, "/a/")];
    S.run = { id: "run-old", projectId: "proj-1", checkId: "url.parity", finishedAt: null, cursor: "u0000", bindings: { snapshotId: "snap-0" }, summary: { target: NEW, total: 1 } };
    const r = await invoke("migration.run_checks", { cursor: "run-old" });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(P.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to run before a freeze, or without a new site to measure", async () => {
    for (const over of [{ frozenAt: null }, { targetUrl: null }]) {
      S.project = frozenProject(over);
      expect(await invoke("migration.run_checks", {})).toMatchObject({ ok: false, status: 500 });
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("migration.run_checks — url.content and seo.head over what url.parity found (MIGD-4a)", () => {
  const head = (title: string, extra = "") =>
    `<html><head><title>${title}</title><link rel="canonical" href="${SRC}/a/">${extra}</head><body><main><h1>${title}</h1><p>Text.</p></main></body></html>`;
  const reached = (n: number, path: string, over: Record<string, unknown> = {}) =>
    url(n, path, { lastStatus: "pass", lastDetail: { class: "same", finalUrl: `${NEW}${path}`, hops: [] }, ...over });
  const probe = (u: string) => (u.startsWith(`${NEW}/cartwright-migration-probe-`) ? { ...page(u, head("Page not found")), status: 404 } : undefined);
  beforeEach(() => {
    const table = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (u: string, base: unknown) => probe(u) ?? table(u, base));
  });

  it("compares each reached page with the old one and stores ONE run — never a URL's url.parity columns", async () => {
    S.urls = [reached(1, "/a/"), reached(2, "/b/"), url(3, "/c/", { lastStatus: "fail" }), url(4, "/gone/", { expect: "gone" })];
    for (const p of ["/a/", "/b/"]) answer(`${SRC}${p}`, page(`${SRC}${p}`, head(p)));
    answer(`${NEW}/a/`, page(`${NEW}/a/`, head("/a/")));
    answer(`${NEW}/b/`, { ...page(`${NEW}/b/`, head("/b/")), xRobotsTag: "noindex" } as MigrationResponse);
    const r = await invoke("migration.run_checks", { checkIds: ["seo.head"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({
      checkId: "seo.head", status: "fail", finished: true, total: 3, processed: 3, target: NEW,
      counts: { pass: 1, warn: 0, fail: 1, skip: 1, inconclusive: 0 }, fields: { noindex: 1 },
    });
    expect(wire("migration.run_checks", r.result).success).toBe(true);
    const { firstErrors } = r.result as { firstErrors: { oldUrl: string; status: string }[] };
    expect(firstErrors.map((e) => [e.oldUrl, e.status])).toEqual([[`${SRC}/b/`, "fail"], [`${SRC}/c/`, "skip"]]);
    // The old page from the source (and its www twin), the new one from the target — nothing else, and no probe for seo.head.
    const hosts = new Set(mocks.fetch.mock.calls.map((c) => (c[1] as { allowHosts: string[] }).allowHosts.join()));
    expect(hosts).toEqual(new Set(["old-shop.example,www.old-shop.example", "new-shop.example"]));
    expect(mocks.fetch.mock.calls.some((c) => String(c[0]).includes("probe"))).toBe(false);
    expect(P.$transaction).toHaveBeenCalledTimes(1);
    expect(P.migrationUrlMap.update).not.toHaveBeenCalled();
    expect(runData()).toMatchObject({ projectId: "proj-1", checkId: "seo.head", phase: "before", status: "fail", cursor: null, bindings: { snapshotId: "snap-1" } });
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ tool: "migration.run_checks", args: { checkIds: ["seo.head"], urls: 3 } });
  });

  it("url.content probes the new site's 404 page once and fails a 200 that looks like it", async () => {
    S.urls = [reached(1, "/a/")];
    answer(`${SRC}/a/`, page(`${SRC}/a/`, head("Type 1")));
    answer(`${NEW}/a/`, page(`${NEW}/a/`, head("Page not found")));
    const r = await invoke("migration.run_checks", { checkIds: ["url.content"] });
    expect(r).toMatchObject({ ok: true, result: { checkId: "url.content", status: "fail", counts: { fail: 1 } } });
    if (!r.ok) return;
    expect((r.result as { fields: Record<string, number> }).fields).toMatchObject({ soft404: 1, h1: 1 });
    expect(mocks.fetch.mock.calls.filter((c) => String(c[0]).includes("probe"))).toHaveLength(1);
    expect(wire("migration.run_checks", r.result).success).toBe(true);
  });

  it("a run with a skipped URL is never a pass, so it never counts toward the switch", async () => {
    S.urls = [reached(1, "/a/"), url(2, "/b/")];
    answer(`${SRC}/a/`, page(`${SRC}/a/`, head("A")));
    answer(`${NEW}/a/`, page(`${NEW}/a/`, head("A")));
    expect(await invoke("migration.run_checks", { checkIds: ["seo.head"] })).toMatchObject({ ok: true, result: { status: "skip", counts: { pass: 1, skip: 1 } } });
    S.urls = [reached(1, "/a/")];
    expect(await invoke("migration.run_checks", { checkIds: ["seo.head"] })).toMatchObject({ ok: true, result: { status: "pass" } });
  });

  it("a cursor alone continues the check its run measures; a url.parity cursor is not a seo.head run", async () => {
    S.urls = [reached(1, "/a/")];
    answer(`${SRC}/a/`, page(`${SRC}/a/`, head("A")));
    answer(`${NEW}/a/`, page(`${NEW}/a/`, head("A")));
    S.run = { id: "run-h", projectId: "proj-1", checkId: "seo.head", finishedAt: null, cursor: "u0000", bindings: { snapshotId: "snap-1", configHash: configHashOf(NEW) }, summary: { total: 1, target: NEW, processed: 0, counts: { pass: 0, warn: 0, fail: 0, skip: 0, inconclusive: 0 }, fields: {}, firstErrors: [] } };
    expect(await invoke("migration.run_checks", { cursor: "run-h" })).toMatchObject({ ok: true, result: { checkId: "seo.head", runId: "run-h", status: "pass", finished: true } });
    S.run = { ...S.run, checkId: "url.parity" };
    expect(await invoke("migration.run_checks", { checkIds: ["seo.head"], cursor: "run-h" })).toMatchObject({ ok: false, status: 500 });
  });

  it("after the DNS switch the old site is gone, so neither page check runs", async () => {
    S.project = frozenProject({ switchedAt: new Date("2026-10-25T08:00:00Z") });
    S.urls = [reached(1, "/a/")];
    for (const id of ["url.content", "seo.head", "seo.product-jsonld"]) {
      const r = await invoke("migration.run_checks", { checkIds: [id] });
      expect(r).toMatchObject({ ok: false, status: 500 });
      if (!r.ok) expect(r.error).toMatch(/before the switch only/);
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(P.$transaction).not.toHaveBeenCalled();
  });

  it("flag off ⇒ refused before any read or fetch", async () => {
    S.features = { migrationDashboard: false };
    expect(await invoke("migration.run_checks", { checkIds: ["url.content"] })).toMatchObject({ ok: false });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("migration.run_checks — seo.product-jsonld over the frozen product rows (MIGD-4b)", () => {
  const CHECK = "seo.product-jsonld";
  const CURRENCY = brand.policies.currency;
  const ldPage = (node: Record<string, unknown>) =>
    `<html><head><title>Fence</title><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, node] })}</script></head><body><main><h1>Fence</h1></main></body></html>`;
  const product = (over: Record<string, unknown> = {}, offer: Record<string, unknown> = {}) => ({
    "@type": "Product", sku: "EX-1", image: `${SRC}/wp-content/uploads/a.jpg`,
    offers: { "@type": "Offer", price: 999, priceCurrency: CURRENCY, availability: "https://schema.org/InStock", ...offer },
    ...over,
  });
  /** The same product as a new page emits it: a string price, another image URL. */
  const emitted = (over: Record<string, unknown> = {}, offer: Record<string, unknown> = {}) =>
    product({ image: ["https://cdn.example.test/a.jpg"], ...over }, { price: "999.00", ...offer });
  const reached = (n: number, path: string, over: Record<string, unknown> = {}) =>
    url(n, path, { kind: "product", lastStatus: "pass", lastDetail: { class: "same", finalUrl: `${NEW}${path}`, hops: [] }, ...over });
  const pair = (path: string, oldNode: Record<string, unknown>, newNode: Record<string, unknown>) => {
    answer(`${SRC}${path}`, page(`${SRC}${path}`, ldPage(oldNode)));
    answer(`${NEW}${path}`, page(`${NEW}${path}`, ldPage(newNode)));
  };
  const run = (args: Record<string, unknown> = { checkIds: [CHECK] }) => invoke("migration.run_checks", args);

  it("compares the frozen product rows only, and stores ONE run with each difference's old and new value — never a URL's url.parity columns", async () => {
    S.urls = [reached(1, "/a/"), reached(2, "/b/"), reached(3, "/c/"), url(4, "/about/", { kind: "page", lastStatus: "pass", lastDetail: { finalUrl: `${NEW}/about/` } }), reached(5, "/gone/", { expect: "gone" })];
    pair("/a/", product(), emitted());
    pair("/b/", product(), emitted({ sku: "cmabc123" }, { price: "1000.00" }));
    pair("/c/", { "@type": "BreadcrumbList" }, emitted());
    const r = await run();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({
      checkId: CHECK, status: "fail", finished: true, nextCursor: null, total: 3, processed: 3, chunk: 3, target: NEW, leadOnly: 0,
      counts: { pass: 1, warn: 0, fail: 1, skip: 1, inconclusive: 0 }, fields: { sku: 1, price: 1 },
    });
    expect(wire("migration.run_checks", r.result).success).toBe(true);
    const { firstErrors } = r.result as { firstErrors: { oldUrl: string; status: string; findings: unknown[] }[] };
    expect(firstErrors.map((e) => [e.oldUrl, e.status])).toEqual([[`${SRC}/b/`, "fail"], [`${SRC}/c/`, "skip"]]);
    expect(firstErrors[0].findings).toEqual([
      { field: "sku", status: "fail", old: "EX-1", new: "cmabc123" },
      { field: "price", status: "fail", old: 99900, new: 100000, detail: "in integer minor units" },
    ]);
    const fetched = mocks.fetch.mock.calls.map((c) => String(c[0]));
    expect(fetched.filter((u) => u.includes("/about/") || u.includes("/gone/"))).toEqual([]);
    // The old pages from the source and its www twin, the new ones from the target — and no 404 probe.
    expect(new Set(mocks.fetch.mock.calls.map((c) => (c[1] as { allowHosts: string[] }).allowHosts.join()))).toEqual(new Set(["old-shop.example,www.old-shop.example", "new-shop.example"]));
    expect(fetched.some((u) => u.includes("probe"))).toBe(false);
    expect(P.$transaction).toHaveBeenCalledTimes(1);
    expect(P.migrationUrlMap.update).not.toHaveBeenCalled();
    expect(runData()).toMatchObject({ projectId: "proj-1", checkId: CHECK, phase: "before", status: "fail", cursor: null, bindings: { snapshotId: "snap-1" } });
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ tool: "migration.run_checks", args: { checkIds: [CHECK], urls: 3 } });
  });

  it("a clean run passes, and only then counts toward \"Ready for DNS switch\"", async () => {
    S.urls = [reached(1, "/a/")];
    pair("/a/", product(), emitted());
    expect(await run()).toMatchObject({ ok: true, result: { status: "pass", counts: { pass: 1 } } });
    const passed = runData() as { checkId: string; status: string; finishedAt: Date; bindings: unknown };
    P.migrationCheckRun.findMany.mockResolvedValueOnce([{ checkId: CHECK, status: passed.status, finishedAt: passed.finishedAt, bindings: passed.bindings }] as never);
    const board = await invoke("migration.status", {}, ["settings:read"]);
    expect(board).toMatchObject({ ok: true, result: { checks: [{ checkId: CHECK, status: "pass", fresh: true }] } });
    if (board.ok) expect((board.result as { ready: { missing: string[] } }).ready.missing).not.toContain(CHECK);
  });

  it("with no product rows frozen there is nothing to compare: skip, never a pass", async () => {
    S.urls = [url(1, "/about/", { kind: "page" })];
    expect(await run()).toMatchObject({ ok: true, result: { status: "skip", total: 0, processed: 0, finished: true } });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("prices are scaled by the shop's own currency when a page names none", async () => {
    S.urls = [reached(1, "/a/")];
    // Twelve whole units either way, so only a scale that keeps the minor digits sees the difference.
    pair("/a/", product({}, { price: "12.40", priceCurrency: undefined }), emitted({}, { price: "12.00", priceCurrency: undefined }));
    expect(await run()).toMatchObject({ ok: true, result: { status: "fail", fields: { price: 1 } } });
  });

  it("a page naming no currency is judged in the shop's own: against a page in another, the currency fails and the prices are not compared", async () => {
    const other = (CURRENCY as string) === "SEK" ? "NOK" : "SEK";
    S.urls = [reached(1, "/a/")];
    pair("/a/", product({}, { priceCurrency: undefined }), emitted({}, { priceCurrency: other, price: "5.00" }));
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "fail", firstErrors: [{ findings: [{ field: "priceCurrency", status: "fail", old: CURRENCY, new: other }] }] } });
    if (!r.ok) return;
    expect((r.result as { fields: unknown }).fields).toEqual({ priceCurrency: 1 });
    expect(wire("migration.run_checks", r.result).success).toBe(true);
  });

  it("a page not read whole keeps the run from passing, its finding naming the side", async () => {
    S.urls = [reached(1, "/a/")];
    answer(`${SRC}/a/`, page(`${SRC}/a/`, ldPage(product()).replace("</head>", '<script type="application/ld+json">{broken</script></head>')));
    answer(`${NEW}/a/`, page(`${NEW}/a/`, ldPage(emitted())));
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", counts: { pass: 0, inconclusive: 1 }, fields: { jsonld: 1 }, firstErrors: [{ findings: [{ field: "jsonld", status: "inconclusive", detail: expect.stringContaining("the old page") }] }] } });
    if (r.ok) expect(wire("migration.run_checks", r.result).success).toBe(true);
  });

  it("an old field in a shape the reader skips keeps the run from passing, naming the field", async () => {
    S.urls = [reached(1, "/a/")];
    pair("/a/", product({ sku: ["EX-1"] }, { availability: ["https://schema.org/OutOfStock"] }), emitted());
    const r = await run();
    expect(r).toMatchObject({
      ok: true,
      result: { status: "inconclusive", counts: { pass: 0, inconclusive: 1 }, fields: { sku: 1, availability: 1 }, firstErrors: [{ findings: [{ field: "sku", status: "inconclusive" }, { field: "availability", status: "inconclusive" }] }] },
    });
    if (r.ok) expect(wire("migration.run_checks", r.result).success).toBe(true);
  });

  it("a variant URL in the product rows reads skip, so the run is not a pass", async () => {
    S.urls = [reached(1, "/a/"), reached(2, "/a/?attribute_pa_color=black")];
    pair("/a/", product(), emitted());
    expect(await run()).toMatchObject({ ok: true, result: { status: "skip", counts: { pass: 1, skip: 1 } } });
    expect(mocks.fetch.mock.calls.some((c) => String(c[0]).includes("attribute_pa"))).toBe(false);
  });

  describe("lead-only products", () => {
    it("a product marked lead-only or catalog-only is left out unfetched and counted apart; the rest decide the run", async () => {
      S.urls = [reached(1, "/a/"), reached(2, "/lead/"), reached(3, "/catalog/")];
      pair("/a/", product(), emitted());
      S.products = [
        { permalink: "/a/", attributes: { tags: ["x"] } },
        { permalink: "/lead/", attributes: { leadOnly: true } },
        { permalink: "/catalog/", attributes: { catalogOnly: true } },
      ];
      const r = await run();
      expect(r).toMatchObject({ ok: true, result: { status: "pass", total: 3, processed: 1, chunk: 3, leadOnly: 2, counts: { pass: 1, fail: 0 }, firstErrors: [] } });
      if (r.ok) expect(wire("migration.run_checks", r.result).success).toBe(true);
      expect(mocks.fetch.mock.calls.map((c) => String(c[0])).filter((u) => /lead|catalog/.test(u))).toEqual([]);
    });

    it("every product lead-only leaves nothing compared: skip, never a pass", async () => {
      S.urls = [reached(1, "/lead/")];
      S.products = [{ permalink: "/lead/", attributes: { leadOnly: true } }];
      expect(await run()).toMatchObject({ ok: true, result: { status: "skip", processed: 0, leadOnly: 1 } });
    });

    it.each<[string, { permalink: string | null; attributes: unknown; deletedAt?: Date | null }]>([
      ["a false mark", { permalink: "/a/", attributes: { leadOnly: false, catalogOnly: false } }],
      ["a mark that is not true", { permalink: "/a/", attributes: { leadOnly: "true" } }],
      ["no attributes", { permalink: "/a/", attributes: null }],
      ["another product's permalink", { permalink: "/b/", attributes: { leadOnly: true } }],
      ["a deleted product", { permalink: "/a/", attributes: { leadOnly: true }, deletedAt: new Date("2026-10-01T00:00:00Z") }],
    ])("%s does not leave a row out: it is compared, and may fail", async (_why, row) => {
      S.urls = [reached(1, "/a/")];
      pair("/a/", product(), emitted({ offers: undefined }));
      S.products = [row];
      expect(await run()).toMatchObject({ ok: true, result: { status: "fail", leadOnly: 0, fields: { offers: 1 } } });
    });

    it("only this check looks them up, for the chunk it reads", async () => {
      S.urls = [reached(1, "/a/")];
      pair("/a/", product(), emitted());
      const head = await run({ checkIds: ["seo.head"] });
      expect(head.ok).toBe(true);
      if (head.ok) expect(head.result).not.toHaveProperty("leadOnly");
      expect(P.product.findMany).not.toHaveBeenCalled();
      await run();
      expect(P.product.findMany).toHaveBeenCalledTimes(1);
      expect(P.product.findMany.mock.calls[0][0]).toMatchObject({ where: { permalink: { in: ["/a/"] }, deletedAt: null } });
    });

  });

  it(`a map longer than one chunk (${PAGE_CHUNK}) continues by cursor, alone or with the check named, and adds up across calls`, async () => {
    S.urls = Array.from({ length: PAGE_CHUNK + 2 }, (_, i) => reached(i + 1, `/p${i + 1}/`));
    for (const u of S.urls) pair(String(u.oldPath), product(), emitted());
    S.products = [{ permalink: "/p1/", attributes: { leadOnly: true } }, { permalink: `/p${PAGE_CHUNK + 1}/`, attributes: { catalogOnly: true } }];
    const first = await run();
    expect(first).toMatchObject({ ok: true, result: { checkId: CHECK, finished: false, status: "inconclusive", chunk: PAGE_CHUNK, processed: PAGE_CHUNK - 1, total: PAGE_CHUNK + 2, leadOnly: 1 } });
    if (!first.ok) return;
    const { nextCursor, runId } = first.result as { nextCursor: string; runId: string };
    expect(runData()).toMatchObject({ id: runId, status: "inconclusive", finishedAt: null, cursor: `u00${PAGE_CHUNK}` });

    S.run = { ...runData(), projectId: "proj-1" };
    const second = await run({ cursor: nextCursor });
    expect(second).toMatchObject({ ok: true, result: { checkId: CHECK, runId, finished: true, status: "pass", chunk: 2, processed: PAGE_CHUNK, total: PAGE_CHUNK + 2, leadOnly: 2, nextCursor: null } });
    if (second.ok) expect(wire("migration.run_checks", second.result).success).toBe(true);
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit).toHaveBeenCalledTimes(2);
  });

  it("an old site that cannot be read is an inconclusive run, never a fail or a pass", async () => {
    S.urls = [reached(1, "/a/")];
    answer(`${SRC}/a/`, { outcome: "inconclusive", url: `${SRC}/a/`, status: 503, reason: "HTTP 503" });
    answer(`${NEW}/a/`, page(`${NEW}/a/`, ldPage(emitted())));
    expect(await run()).toMatchObject({ ok: true, result: { status: "inconclusive", finished: true, counts: { inconclusive: 1 } } });
  });

  it("flag off ⇒ refused before any read or fetch", async () => {
    S.features = { migrationDashboard: false };
    expect(await run()).toMatchObject({ ok: false, status: 500, error: DISABLED });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(P.product.findMany).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("migration.attest — the owner's sign-off, and the one writer of switchedAt", () => {
  const attest = (checkId: string, status = "pass") => invoke("migration.attest", { checkId, status, note: "Done on the shadow site", confirm: true });

  it("cutover.switched as a pass sets switchedAt — and records the sign-off as that check's run", async () => {
    const r = await attest("cutover.switched");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(wire("migration.attest", r.result).success).toBe(true);
    const data = projectWrite() as { switchedAt: Date; attestations: Record<string, unknown> };
    expect(data.switchedAt).toBeInstanceOf(Date);
    expect((r.result as { switchedAt: string }).switchedAt).toBe(data.switchedAt.toISOString());
    expect(data.attestations["cutover.switched"]).toMatchObject({ status: "pass", note: "Done on the shadow site", actor: "apikey:test" });
    expect(runData()).toMatchObject({ checkId: "cutover.switched", phase: "after", status: "pass", bindings: { snapshotId: "snap-1" } });
    expect(P.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ tool: "migration.attest", args: { checkId: "cutover.switched", status: "pass" } });
  });

  it("signing the switch off again keeps the first time; a fail never sets it", async () => {
    const first = new Date("2026-10-23T22:00:00Z");
    S.project = frozenProject({ switchedAt: first });
    expect(await attest("cutover.switched")).toMatchObject({ ok: true, result: { switchedAt: first.toISOString() } });
    S.project = frozenProject();
    expect(await attest("cutover.switched", "fail")).toMatchObject({ ok: true, result: { switchedAt: null } });
    expect(written().some((d) => "switchedAt" in d)).toBe(false);
  });

  it("any other sign-off leaves switchedAt alone; a check+sign-off row is stored but is not a run", async () => {
    expect(await attest("pay.test-order")).toMatchObject({ ok: true, result: { recordedRun: true, switchedAt: null } });
    expect(await attest("adapter.operator")).toMatchObject({ ok: true, result: { recordedRun: false } });
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    expect(written().some((d) => "switchedAt" in d)).toBe(false);
  });

  it("two sign-offs saved at the same moment both survive — the later one re-reads, never overwrites (R2)", async () => {
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((r) => { release = r; });
    // Both calls read the same row before either writes.
    const read = async () => {
      const p = S.project;
      if (++reads === 2) release();
      await bothRead;
      return p;
    };
    P.migrationProject.findFirst.mockImplementationOnce(read).mockImplementationOnce(read);
    const [a, b] = await Promise.all([attest("pay.test-order"), attest("adapter.operator")]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect(Object.keys(S.project!.attestations as object).sort()).toEqual(["adapter.operator", "pay.test-order"]);
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit).toHaveBeenCalledTimes(2);
  });

  it("a sign-off that keeps colliding gives up, bounded, and saves nothing (R2)", async () => {
    for (let i = 0; i < 3; i++) P.migrationProject.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await attest("pay.test-order");
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/same moment.*nothing was saved/);
    expect(P.migrationProject.updateMany).toHaveBeenCalledTimes(3);
    expect(P.migrationCheckRun.create).not.toHaveBeenCalled();
  });
});

describe("migration.status", () => {
  it("reads the board: project, URL count, the ready counter and the latest runs", async () => {
    S.urls = [{ id: "u1" }, { id: "u2" }];
    P.migrationCheckRun.findMany.mockResolvedValueOnce([
      { checkId: "url.parity", status: "pass", finishedAt: new Date(), bindings: { snapshotId: "snap-1", configHash: configHashOf(NEW) } },
      { checkId: "pay.test-order", status: "pass", finishedAt: new Date(), bindings: { snapshotId: "snap-0", configHash: configHashOf(NEW) } },
    ] as never);
    const r = await invoke("migration.status", {}, ["settings:read"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(wire("migration.status", r.result).success).toBe(true);
    const res = r.result as { urlCount: number; ready: { ready: number; required: number; missing: string[] }; checks: { checkId: string; fresh: boolean }[]; project: { snapshotId: string } };
    expect(res.project.snapshotId).toBe("snap-1");
    expect(res.urlCount).toBe(2);
    expect(res.ready.ready).toBe(1); // the test-order pass is bound to an older snapshot
    expect(res.ready.missing).toContain("pay.test-order");
    expect(res.checks.map((c) => [c.checkId, c.fresh])).toEqual([["url.parity", true], ["pay.test-order", false]]);
    expect(P.$transaction).not.toHaveBeenCalled();
    // The newest run per check is the one read: newest first, then one per checkId.
    expect((P.migrationCheckRun.findMany.mock.calls[0] as unknown[])[0]).toMatchObject({ orderBy: { startedAt: "desc" }, distinct: ["checkId"] });
  });

  const fresh = async () => {
    const r = await invoke("migration.status", {}, ["settings:read"]);
    if (!r.ok) throw new Error(r.error);
    const res = r.result as { ready: { ready: number }; checks: { checkId: string; fresh: boolean }[] };
    return [res.ready.ready, res.checks.map((c) => c.fresh)];
  };
  const runsCreated = () => P.migrationCheckRun.create.mock.calls.map((c) => {
    const d = (c[0] as { data: Record<string, unknown> }).data;
    return { checkId: d.checkId, status: d.status, finishedAt: d.finishedAt, bindings: d.bindings };
  });

  it("a deploy makes earlier measured passes stale but never a sign-off; with no build known, builds are not compared (R2)", async () => {
    S.urls = [url(1, "/a/")];
    answer(`${NEW}/a/`, page(`${NEW}/a/`));
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-a");
    expect(await invoke("migration.run_checks", {})).toMatchObject({ ok: true, result: { status: "pass" } });
    expect(await invoke("migration.attest", { checkId: "pay.test-order", status: "pass", note: "Order 1042", confirm: true })).toMatchObject({ ok: true });
    const runs = runsCreated();
    expect(runs.map((r) => r.bindings)).toEqual([
      { snapshotId: "snap-1", configHash: configHashOf(NEW), buildSha: "build-a" },
      { snapshotId: "snap-1", configHash: configHashOf(NEW) },
    ]);
    P.migrationCheckRun.findMany.mockResolvedValue(runs as never);
    expect(await fresh()).toEqual([2, [true, true]]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "build-b");
    expect(await fresh()).toEqual([1, [false, true]]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    expect(await fresh()).toEqual([2, [true, true]]);
  });

  it("a pass measured on one new site does not count for another; set back, it counts again (R1)", async () => {
    S.urls = [url(1, "/a/")];
    answer(`${NEW}/a/`, page(`${NEW}/a/`));
    expect(await invoke("migration.run_checks", {})).toMatchObject({ ok: true, result: { status: "pass" } });
    expect(await invoke("migration.attest", { checkId: "pay.test-order", status: "pass", note: "Order 1042", confirm: true })).toMatchObject({ ok: true });
    const runs = P.migrationCheckRun.create.mock.calls.map((c) => {
      const d = (c[0] as { data: Record<string, unknown> }).data;
      return { checkId: d.checkId, status: d.status, finishedAt: d.finishedAt, bindings: d.bindings };
    });
    expect(runs.map((r) => r.bindings)).toEqual([
      { snapshotId: "snap-1", configHash: configHashOf(NEW) },
      { snapshotId: "snap-1", configHash: configHashOf(NEW) },
    ]);
    P.migrationCheckRun.findMany.mockResolvedValue(runs as never);
    expect(await fresh()).toEqual([2, [true, true]]);
    S.project = frozenProject({ targetUrl: "https://shadow.example" });
    expect(await fresh()).toEqual([0, [false, false]]);
    S.project = frozenProject({ targetUrl: null });
    expect(await fresh()).toEqual([0, [false, false]]);
    S.project = frozenProject();
    expect(await fresh()).toEqual([2, [true, true]]);
  });
});

describe("sitemapKind", () => {
  it.each([
    ["https://x.example/product-sitemap.xml", "product"],
    ["https://x.example/product-sitemap2.xml", "product"],
    ["https://x.example/product_cat-sitemap.xml", "product_cat"],
    ["https://x.example/wp-sitemap-posts-page-1.xml", "page"],
    ["https://x.example/wp-sitemap-taxonomies-product_cat-2.xml", "product_cat"],
    ["https://x.example/wp-sitemap-posts-my-type-1.xml", "my-type"],
    ["https://x.example/sitemap.xml", "url"],
    ["not a url", "url"],
  ])("%s → %s", (u, kind) => expect(sitemapKind(u)).toBe(kind));
});
