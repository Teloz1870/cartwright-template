import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";

/**
 * MIGD-6a — dns.web and dns.ttl through `migration.run_checks`: one check per
 * call, no cursor, ONE run row under ONE audit entry, bound like any other run,
 * and nothing sent while the runtime flag is off. node:dns is a fake Resolver
 * over a table of names (no network); the database is a small in-memory fake.
 */

const mocks = vi.hoisted(() => {
  const state = {
    project: null as Record<string, unknown> | null,
    features: { migrationDashboard: true } as Record<string, boolean>,
    /** name → records; `@<ip>` keys answer only a Resolver whose servers include that ip. */
    zone: {} as Record<string, { a?: [string, number][]; cname?: string[]; ns?: string[] }>,
    resolvers: 0,
  };
  const prisma = {
    migrationProject: { findFirst: vi.fn(async () => state.project) },
    migrationCheckRun: { create: vi.fn(async (args: unknown) => args) },
  };
  return { state, prisma, withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()) };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/brand", async (orig) => ({
  ...(await orig<typeof import("@/lib/brand")>()),
  getFeatureGateState: async () => ({ available: true, features: { ...mocks.state.features } }),
}));
vi.mock("node:dns/promises", () => {
  const code = (c: string) => Promise.reject(Object.assign(new Error(c), { code: c }));
  class Resolver {
    servers: string[] = [];
    constructor() { mocks.state.resolvers++; }
    setServers(s: string[]) { this.servers = s; }
    private name(host: string) {
      const at = this.servers.map((s) => mocks.state.zone[`${host}@${s}`]).find(Boolean);
      return at ?? (this.servers.length ? undefined : mocks.state.zone[host]);
    }
    resolve4(h: string, o?: { ttl?: boolean }) {
      const n = this.name(h);
      if (!o?.ttl) throw new Error("resolve4 without { ttl: true }");
      return !n ? code("ENOTFOUND") : n.a ? Promise.resolve(n.a.map(([address, ttl]) => ({ address, ttl }))) : code("ENODATA");
    }
    resolve6(h: string) { return this.name(h) ? code("ENODATA") : code("ENOTFOUND"); }
    resolveCname(h: string) { const n = this.name(h); return n?.cname ? Promise.resolve(n.cname) : code(n ? "ENODATA" : "ENOTFOUND"); }
    resolveNs(h: string) { const n = this.name(h); return n?.ns ? Promise.resolve(n.ns) : code(n ? "ENODATA" : "ENOTFOUND"); }
  }
  return { Resolver };
});

const P = mocks.prisma;
const S = mocks.state;
const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-migration-dns" };
const invoke = (args: unknown) => invokeTool("migration.run_checks", args, CTX, ["settings:read"] as never);
const wire = (result: unknown) => getTool("migration.run_checks")!.output.safeParse(JSON.parse(JSON.stringify(result)));
const runData = () => (P.migrationCheckRun.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

const project = (over: Record<string, unknown> = {}) => ({
  id: "proj-1", sourceUrl: "https://old-shop.example", targetUrl: "https://new-shop.example.net", sourceKind: "woocommerce",
  frozenAt: null, switchedAt: null, snapshot: null, settings: null, attestations: null, equivalenceCases: null,
  createdAt: new Date("2026-10-20T08:00:00Z"), updatedAt: new Date("2026-10-24T08:00:00Z"), ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
  S.project = project();
  S.features = { migrationDashboard: true };
  S.resolvers = 0;
  S.zone = {
    "new-shop.example.net": { a: [["76.76.21.21", 60]] },
    "old-shop.example": { a: [["198.51.100.10", 42]], ns: ["ns1.dns-host.example"] },
    "www.old-shop.example": { a: [["198.51.100.10", 42]] },
    "ns1.dns-host.example": { a: [["192.0.2.53", 3600]] },
    "old-shop.example@192.0.2.53": { a: [["198.51.100.10", 3600]] },
    "www.old-shop.example@192.0.2.53": { a: [["198.51.100.10", 300]] },
  };
});

describe("migration.run_checks — dns.web", () => {
  it("before the switch: one finished run, status skip (information), phase before, bound and audited once", async () => {
    const r = await invoke({ checkIds: ["dns.web"] });
    expect(r).toMatchObject({ ok: true, result: { checkId: "dns.web", status: "skip", phase: "before", finished: true, nextCursor: null, domain: "old-shop.example" } });
    if (!r.ok) return;
    expect(wire(r.result).success).toBe(true);
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    expect(runData()).toMatchObject({
      projectId: "proj-1", checkId: "dns.web", phase: "before", status: "skip", actor: "apikey:test",
      bindings: { buildSha: "abc123", configHash: expect.any(String) }, finishedAt: expect.any(Date),
    });
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ tool: "migration.run_checks", args: { projectId: "proj-1", checkIds: ["dns.web"] }, requestId: "test-migration-dns" });
  });

  it("after the signed-off switch the same records are a fail, phase after", async () => {
    S.project = project({ switchedAt: new Date("2026-10-25T06:00:00Z") });
    const r = await invoke({ checkIds: ["dns.web"] });
    expect(r).toMatchObject({ ok: true, result: { status: "fail", phase: "after" } });
    expect(runData()).toMatchObject({ checkId: "dns.web", phase: "after", status: "fail" });
  });

  it("is refused without the new site's address, before any lookup or write", async () => {
    S.project = project({ targetUrl: null });
    const r = await invoke({ checkIds: ["dns.web"] });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/new site's address first/);
    expect(S.resolvers).toBe(0);
    expect(P.migrationCheckRun.create).not.toHaveBeenCalled();
  });
});

describe("migration.run_checks — dns.ttl", () => {
  it("reads the zone's own TTL (3600 s there, 42 s left in a cache) and warns", async () => {
    const r = await invoke({ checkIds: ["dns.ttl"] });
    expect(r).toMatchObject({ ok: true, result: { checkId: "dns.ttl", status: "warn", nameservers: ["ns1.dns-host.example"] } });
    if (!r.ok) return;
    expect(wire(r.result).success).toBe(true);
    expect((r.result as { hosts: { ttl: number | null }[] }).hosts.map((h) => h.ttl)).toEqual([3600, 300]);
    expect(runData()).toMatchObject({ checkId: "dns.ttl", status: "warn", phase: "before" });
  });

  it("is a before-the-switch check: refused once the switch is signed off", async () => {
    S.project = project({ switchedAt: new Date("2026-10-25T06:00:00Z") });
    const r = await invoke({ checkIds: ["dns.ttl"] });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/before the DNS switch only/);
    expect(P.migrationCheckRun.create).not.toHaveBeenCalled();
  });
});

describe("migration.run_checks — the contract around the DNS checks", () => {
  it.each([
    [{ checkIds: ["dns.web"], cursor: "run-1" }],
    [{ checkIds: ["dns.web", "dns.ttl"] }],
    [{ checkIds: ["data.counts", "dns.web"] }],
    [{ checkIds: ["dns.mail"] }],
  ])("%o is refused (422) before any handler code runs", async (args) => {
    expect(await invoke(args)).toMatchObject({ ok: false, status: 422 });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
  });

  it.each(["http://192.0.2.10", "http://[2001:db8::1]"])("a source at the IP %s has no DNS to check: refused before any lookup or write", async (sourceUrl) => {
    S.project = project({ sourceUrl });
    const r = await invoke({ checkIds: ["dns.web"] });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/is an IP address; there is no DNS to check/);
    expect(S.resolvers).toBe(0);
    expect(P.migrationCheckRun.create).not.toHaveBeenCalled();
  });

  it("flag off ⇒ refused before any read or DNS query", async () => {
    S.features = { migrationDashboard: false };
    for (const id of ["dns.web", "dns.ttl"]) expect(await invoke({ checkIds: [id] })).toMatchObject({ ok: false, status: 500 });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(S.resolvers).toBe(0);
  });

  it("migration.status lists the DNS checks as runnable", async () => {
    P.migrationProject.findFirst.mockResolvedValueOnce(null);
    const r = await invokeTool("migration.status", {}, CTX, ["settings:read"] as never);
    expect(r).toMatchObject({ ok: true, result: { runnable: ["url.parity", "url.content", "seo.head", "seo.product-jsonld", "data.counts", "redirect.imported", "redirect.active", "redirect.legacy-shadow", "dns.web", "dns.ttl"] } });
  });
});
