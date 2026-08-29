import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { integrationSettings: { upsert: mocks.upsert } },
}));

import { brand } from "@/brand.config";
import {
  parseEcbEuroRates,
  refreshFxRates,
} from "@/lib/fx/refresh";

const xml = `<gesmes:Envelope><Cube><Cube time="2026-08-28"><Cube currency="DKK" rate="7.4600"/><Cube currency="USD" rate="1.1700"/><Cube currency="GBP" rate="0.8600"/><Cube currency="SEK" rate="11.1000"/><Cube currency="NOK" rate="11.7000"/></Cube></Cube></gesmes:Envelope>`;

describe("FX refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({});
  });

  it("parses the ECB feed and keeps EUR as the unit anchor", () => {
    expect(parseEcbEuroRates(xml)).toMatchObject({ EUR: 1, DKK: 7.46, USD: 1.17 });
  });

  it("returns a visible failure when the source is unreachable", async () => {
    const result = await refreshFxRates({
      fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "fx-source-unreachable",
      error: "offline",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stores rates re-anchored to the configured base currency", async () => {
    const result = await refreshFxRates({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => xml,
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rates[brand.policies.currency]).toBe(1);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("does not report success when persistence fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("db down"));
    const result = await refreshFxRates({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => xml,
      }),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "fx-rates-db-write-failed",
      error: "db down",
    });
  });
});
