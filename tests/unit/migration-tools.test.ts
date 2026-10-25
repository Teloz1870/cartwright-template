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
import { PARITY_CHUNK } from "@/lib/migration/runner";
import { configHashOf } from "@/lib/migration/store";
import type { MigrationResponse } from "@/lib/migration/fetch";

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
  const prisma = {
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
        count: vi.fn(async () => state.urls.length),
        findMany: vi.fn(async ({ where, take }: { where: { id?: { gt: string } }; take: number }) =>
          state.urls.filter((u) => !where.id || u.id > where.id.gt).slice(0, take)),
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
  ({ id: `u${String(n).padStart(4, "0")}`, oldUrl: `${SRC}${oldPath}`, expect: "same", newPath: null, ...extra });
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
    ["migration.freeze_sitemap", {}],
    ["migration.freeze_sitemap", { confirm: false }],
    ["migration.freeze_sitemap", { sitemapUrl: "ftp://old-shop.example/s.xml", dryRun: true }],
    ["migration.run_checks", { checkIds: ["url.content"] }],
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
  it("creates the project from origins, under one audit entry", async () => {
    S.project = null;
    const r = await invoke("migration.project_set", { sourceUrl: `${SRC}/shop/`, targetUrl: `${NEW}/da`, confirm: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toEqual({ id: "proj-new", sourceUrl: SRC, targetUrl: NEW, created: true, freezeReset: false });
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
