import { beforeEach, describe, expect, it, vi } from "vitest";
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
    mocks.getBrand.mockResolvedValue({ features: { fxAutoUpdate: true } });
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
