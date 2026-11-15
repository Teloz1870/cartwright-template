import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  refreshFxRates: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/fx/refresh", () => ({ refreshFxRates: mocks.refreshFxRates }));

import { GET } from "@/app/api/cron/fx-refresh/route";

describe("FX refresh cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    // Outside production, whatever the shell running the suite says: an ambient
    // VERCEL_ENV=production (a Vercel build) would make the route refuse (503).
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
    mocks.getBrand.mockResolvedValue({ features: { fxAutoUpdate: true } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a failing HTTP status when the feed refresh fails", async () => {
    mocks.refreshFxRates.mockResolvedValue({
      ok: false,
      reason: "fx-source-unreachable",
      error: "offline",
    });
    const response = await GET(
      new NextRequest("https://shop.example/api/cron/fx-refresh"),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      refreshed: false,
      reason: "fx-source-unreachable",
    });
  });

  it("keeps the disabled fixed-rate demo path as a successful no-op", async () => {
    mocks.getBrand.mockResolvedValue({ features: { fxAutoUpdate: false } });
    const response = await GET(
      new NextRequest("https://shop.example/api/cron/fx-refresh"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      reason: "fxAutoUpdate-feature-disabled",
    });
  });
});

// CRON-AUTH-b on a real route: production refuses without the secret and runs
// the job for the right one; the suite above is the non-production path, which
// still runs without a secret.
describe("FX refresh cron route in production", () => {
  const SECRET = "fx-cron-secret";
  const call = (authorization?: string) =>
    GET(
      new NextRequest("https://shop.example/api/cron/fx-refresh", {
        headers: authorization ? { authorization } : {},
      }),
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getBrand.mockResolvedValue({ features: { fxAutoUpdate: true } });
    mocks.refreshFxRates.mockResolvedValue({
      ok: true,
      fetchedAt: "2026-10-11T16:00:00.000Z",
      source: "test",
      updatedCurrencies: [],
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses with 503 and does not run the job without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(503);
    expect(mocks.getBrand).not.toHaveBeenCalled();
    expect(mocks.refreshFxRates).not.toHaveBeenCalled();
  });

  it("answers 401 to a wrong secret and does not run the job", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call("Bearer not-it")).status).toBe(401);
    expect(mocks.refreshFxRates).not.toHaveBeenCalled();
  });

  it("runs the job for the right secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(mocks.refreshFxRates).toHaveBeenCalledTimes(1);
  });
});
