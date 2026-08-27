import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * registryStats — anonym install-tælling på komponent-registry'en.
 *
 * Pinner kontrakten:
 *  - flag OFF ⇒ NUL RegistryHit-reads/-writes (canary-safe, byte-identisk).
 *  - flag ON  ⇒ upsert-increment pr. servet item (kun item-slug — anonym).
 *  - tælling kaster ALDRIG (fire-and-forget; manglende tabel før db:push).
 *  - /api/admin/registry-stats er admin-only (401) og rører ikke tabellen
 *    når flaget er off.
 */

const mocks = vi.hoisted(() => ({
  prisma: { registryHit: { upsert: vi.fn(), findMany: vi.fn() } },
  getFeatures: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getFeatures: mocks.getFeatures }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

import {
  incrementRegistryHit,
  listRegistryHits,
  scheduleRegistryHit,
} from "@/lib/registry-stats";
import { GET as adminStatsGET } from "@/app/api/admin/registry-stats/route";
import { GET as registryGET } from "@/app/api/registry/[[...path]]/route";
import { brand } from "@/brand.config";

beforeEach(() => {
  mocks.prisma.registryHit.upsert.mockReset().mockResolvedValue({});
  mocks.prisma.registryHit.findMany.mockReset().mockResolvedValue([]);
  mocks.getFeatures.mockReset().mockResolvedValue({ registryStats: false });
  mocks.auth.mockReset().mockResolvedValue(null);
});

describe("incrementRegistryHit", () => {
  it("flag OFF → ingen DB-writes overhovedet", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: false });
    await incrementRegistryHit("hero");
    expect(mocks.prisma.registryHit.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.registryHit.findMany).not.toHaveBeenCalled();
  });

  it("flag ON → anonym upsert-increment på item-slug alene", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    await incrementRegistryHit("svg-orbit-mark");
    expect(mocks.prisma.registryHit.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.registryHit.upsert).toHaveBeenCalledWith({
      where: { item: "svg-orbit-mark" },
      create: { item: "svg-orbit-mark", count: 1 },
      update: { count: { increment: 1 } },
    });
  });

  it("kaster aldrig — DB-fejl sluges (fx manglende tabel før db:push)", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    mocks.prisma.registryHit.upsert.mockRejectedValue(
      new Error("no such table: RegistryHit"),
    );
    await expect(incrementRegistryHit("hero")).resolves.toBeUndefined();
  });

  it("kaster aldrig — selv hvis flag-resolution fejler", async () => {
    mocks.getFeatures.mockRejectedValue(new Error("db down"));
    await expect(incrementRegistryHit("hero")).resolves.toBeUndefined();
    expect(mocks.prisma.registryHit.upsert).not.toHaveBeenCalled();
  });
});

describe("listRegistryHits", () => {
  it("læser sorteret (mest installerede først)", async () => {
    mocks.prisma.registryHit.findMany.mockResolvedValue([
      { item: "hero", count: 7, updatedAt: new Date() },
    ]);
    const rows = await listRegistryHits();
    expect(rows).toHaveLength(1);
    expect(mocks.prisma.registryHit.findMany).toHaveBeenCalledWith({
      orderBy: [{ count: "desc" }, { item: "asc" }],
      take: 500,
    });
  });
});

describe("GET /api/registry — fire-and-forget tælling", () => {
  const features = brand.features as unknown as Record<string, boolean>;
  const originalPublic = features.componentRegistryPublic;

  beforeEach(() => {
    // Registry-ruten gater på det statiske brand.config-flag.
    features.componentRegistryPublic = true;
  });

  afterEach(() => {
    features.componentRegistryPublic = originalPublic;
  });

  const req = (path: string) =>
    ({ nextUrl: new URL(`https://shop.example${path}`) }) as unknown as NextRequest;

  const params = (segments?: string[]) => ({
    params: Promise.resolve({ path: segments }),
  });

  it("flag OFF → item serveres uændret og INTET skrives", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: false });
    const res = await registryGET(req("/api/registry/r/hero.json"), params(["r", "hero.json"]));
    expect(res.status).toBe(200);
    // Tælling sker post-response (after-shim) — flush microtasks før assert.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.prisma.registryHit.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.registryHit.findMany).not.toHaveBeenCalled();
  });

  it("flag ON → servet section-item inkrementeres (uden at blokere svaret)", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    const res = await registryGET(req("/api/registry/r/hero.json"), params(["r", "hero.json"]));
    expect(res.status).toBe(200);
    await vi.waitFor(() =>
      expect(mocks.prisma.registryHit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { item: "hero" } }),
      ),
    );
  });

  it("flag ON → servet svg-item inkrementeres under svg-namespacet", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    const res = await registryGET(
      req("/api/registry/r/svg-orbit-mark.json"),
      params(["r", "svg-orbit-mark.json"]),
    );
    expect(res.status).toBe(200);
    await vi.waitFor(() =>
      expect(mocks.prisma.registryHit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { item: "svg-orbit-mark" } }),
      ),
    );
  });

  it("index + ukendte keys tælles IKKE", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    await registryGET(req("/api/registry"), params([]));
    const unknown = await registryGET(
      req("/api/registry/r/not-a-real-item.json"),
      params(["r", "not-a-real-item.json"]),
    );
    expect(unknown.status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.prisma.registryHit.upsert).not.toHaveBeenCalled();
  });

  it("DB-fejl under tælling vælter aldrig responsen", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    mocks.prisma.registryHit.upsert.mockRejectedValue(new Error("boom"));
    const res = await registryGET(req("/api/registry/r/hero.json"), params(["r", "hero.json"]));
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mocks.prisma.registryHit.upsert).toHaveBeenCalled());
  });
});

describe("scheduleRegistryHit (uden request-scope)", () => {
  it("falder tilbage til løs promise og tæller stadig", async () => {
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    scheduleRegistryHit("hero");
    await vi.waitFor(() =>
      expect(mocks.prisma.registryHit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { item: "hero" } }),
      ),
    );
  });
});

describe("GET /api/admin/registry-stats", () => {
  it("401 uden session", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await adminStatsGET();
    expect(res.status).toBe(401);
    expect(mocks.prisma.registryHit.findMany).not.toHaveBeenCalled();
  });

  it("401 for non-admin", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "customer" } });
    const res = await adminStatsGET();
    expect(res.status).toBe(401);
    expect(mocks.prisma.registryHit.findMany).not.toHaveBeenCalled();
  });

  it("admin + flag OFF → enabled:false uden at røre tabellen", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mocks.getFeatures.mockResolvedValue({ registryStats: false });
    const res = await adminStatsGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, items: [] });
    expect(mocks.prisma.registryHit.findMany).not.toHaveBeenCalled();
  });

  it("admin + flag ON → sorterede counts", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mocks.getFeatures.mockResolvedValue({ registryStats: true });
    const now = new Date("2026-06-10T00:00:00.000Z");
    mocks.prisma.registryHit.findMany.mockResolvedValue([
      { item: "hero", count: 7, updatedAt: now },
      { item: "svg-orbit-mark", count: 3, updatedAt: now },
    ]);
    const res = await adminStatsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.items).toEqual([
      { item: "hero", count: 7, updatedAt: now.toISOString() },
      { item: "svg-orbit-mark", count: 3, updatedAt: now.toISOString() },
    ]);
  });
});
