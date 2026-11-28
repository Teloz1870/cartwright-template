import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes (as in url1-locale-prefix.test.ts):
// next-intl's middleware runs for real behind proxy.ts below.
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";

/**
 * RED1 — a redirect saved in the database answers live without Upstash Redis.
 *
 * Before, proxy.ts read the map from Redis only, so on every scaffold without
 * `UPSTASH_*` a redirect was stored and never served (a migration brings ~550).
 * Pinned here:
 *  1. No Redis env ⇒ the map is the `Redirect` table; Redis env ⇒ Redis, and
 *     the database is never asked (the canary path is unchanged).
 *  2. One read per 60 s, `bustRedirectMap()` forces the next one, and a failing
 *     source degrades to "no redirect" instead of breaking the request.
 *  3. Nothing is built at import (AGENTS.md "Never construct heavy resources at
 *     import time"): importing the module touches neither Redis nor Prisma.
 *  4. End to end: the proxy, with no Redis env, answers a stored redirect 301.
 */

const findMany = vi.fn();
const fromEnv = vi.fn();
const redisGet = vi.fn();

function mockSources() {
  vi.doMock("@/lib/db", () => ({ prisma: { redirect: { findMany } } }));
  vi.doMock("@upstash/redis", () => ({
    Redis: { fromEnv: (...a: unknown[]) => (fromEnv(...a), { get: redisGet }) },
  }));
}

async function loadModule() {
  vi.resetModules();
  mockSources();
  return import("@/lib/redirects/load");
}

afterEach(() => {
  for (const mod of [
    "@/lib/db",
    "@upstash/redis",
    "@upstash/ratelimit",
    "@/brand.config",
    "next/server",
    "next-auth",
    "@/lib/auth.config",
  ]) {
    vi.doUnmock(mod);
  }
  findMany.mockReset();
  fromEnv.mockReset();
  redisGet.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});

function noRedis() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
}

describe("RED1 — loadRedirectMap: Redis ?? DB", () => {
  it("builds nothing at import", async () => {
    noRedis();
    await loadModule();
    expect(fromEnv).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("without Redis: reads the Redirect table", async () => {
    noRedis();
    findMany.mockResolvedValue([
      { fromPath: "/gammel", toPath: "/ny", statusCode: 301 },
      { fromPath: "/kampagne", toPath: "https://example.com/x", statusCode: 302 },
    ]);
    const { loadRedirectMap } = await loadModule();
    expect(await loadRedirectMap()).toEqual({
      "/gammel": { to: "/ny", status: 301 },
      "/kampagne": { to: "https://example.com/x", status: 302 },
    });
    expect(fromEnv).not.toHaveBeenCalled();
  });

  it("with Redis: reads Redis (string or parsed value) and never the database", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
    redisGet.mockResolvedValue(JSON.stringify({ "/a": { to: "/b", status: 301 } }));
    const { loadRedirectMap } = await loadModule();
    expect(await loadRedirectMap()).toEqual({ "/a": { to: "/b", status: 301 } });
    expect(redisGet).toHaveBeenCalledWith("cartwright_redirects");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("with Redis but no stored map: empty, still not the database", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
    redisGet.mockResolvedValue(null);
    const { loadRedirectMap } = await loadModule();
    expect(await loadRedirectMap()).toEqual({});
    expect(findMany).not.toHaveBeenCalled();
  });

  it("reads once per 60 s; bustRedirectMap forces the next read", async () => {
    noRedis();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
    findMany.mockResolvedValue([{ fromPath: "/gammel", toPath: "/ny", statusCode: 301 }]);
    const { loadRedirectMap, bustRedirectMap } = await loadModule();
    await loadRedirectMap();
    await loadRedirectMap();
    expect(findMany).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-15T00:01:01Z"));
    await loadRedirectMap();
    expect(findMany).toHaveBeenCalledTimes(2);
    bustRedirectMap();
    await loadRedirectMap();
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it("a failing database degrades to no redirect", async () => {
    noRedis();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    findMany.mockRejectedValue(new Error("db down"));
    const { loadRedirectMap } = await loadModule();
    expect(await loadRedirectMap()).toEqual({});
  });

  it("the store's sync drops the cache on every change (with or without Redis)", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../lib/redirects/store.ts", import.meta.url), "utf8"),
    );
    const sync = src.slice(src.indexOf("export async function syncRedirectsToRedis"));
    expect(sync.indexOf("bustRedirectMap()")).toBeGreaterThan(-1);
    expect(sync.indexOf("bustRedirectMap()")).toBeLessThan(sync.indexOf("if (!r) return false"));
  });
});

// ── end to end through proxy.ts ─────────────────────────────────────────────

const ORIGIN = "https://shop.example";
type Handler = (req: NextRequest) => Promise<Response> | Response;

async function loadProxy(): Promise<Handler> {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({
    ...actual,
    brand: { ...actual.brand, locales: ["da", "en"], defaultLocale: "da", urls: { localePrefix: "always" } },
  }));
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  mockSources();
  return (await import("@/proxy")).default as unknown as Handler;
}

describe("RED1 — the proxy without Redis", () => {
  it("answers a redirect stored in the database 301, in the reader's locale", async () => {
    noRedis();
    findMany.mockResolvedValue([{ fromPath: "/gammel", toPath: "/ny", statusCode: 301 }]);
    const proxy = await loadProxy();
    const res = await proxy(Object.assign(new NextRequest(new URL("/da/gammel", ORIGIN)), { auth: null }));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")?.replace(ORIGIN, "")).toBe("/da/ny");
    expect(fromEnv).not.toHaveBeenCalled();
  });

  it("a path with no stored redirect falls through as before", async () => {
    noRedis();
    findMany.mockResolvedValue([{ fromPath: "/gammel", toPath: "/ny", statusCode: 301 }]);
    const proxy = await loadProxy();
    const res = await proxy(Object.assign(new NextRequest(new URL("/da/noget-andet", ORIGIN)), { auth: null }));
    expect(res.status).not.toBe(301);
  });
});
