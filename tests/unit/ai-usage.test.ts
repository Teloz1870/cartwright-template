import { describe, expect, it } from "vitest";
import {
  estimateCostDkk,
  mergeUsage,
  parseAggregate,
  type AiUsageAggregate,
  type UsageTokens,
} from "@/lib/ai/usage";

/**
 * Hul E — token cost-metering. Tester de pure funktioner (cost-estimat,
 * aggregat-fletning, robust parsing). recordAiUsage's DB-side er ikke testet
 * her (best-effort write).
 */

describe("estimateCostDkk", () => {
  it("beregner kroner for en kendt model (USD_TO_DKK default 7)", () => {
    // haiku: 1 USD/Mtok input, 5 USD/Mtok output.
    // 1000 in + 1000 out = (0.001 + 0.005) USD = 0.006 USD * 7 = 0.042 DKK.
    expect(estimateCostDkk("claude-haiku-4-5", 1000, 1000)).toBeCloseTo(0.042, 6);
  });

  it("returnerer 0 for ukendt/lokal model", () => {
    expect(estimateCostDkk("gemma4:e4b", 100000, 100000)).toBe(0);
    expect(estimateCostDkk("ukendt-model", 100000, 100000)).toBe(0);
  });
});

describe("parseAggregate", () => {
  it("null/tom → frisk aggregat", () => {
    const a = parseAggregate(null);
    expect(a.requestCount).toBe(0);
    expect(a.perModel).toEqual({});
    expect(a.byDay).toEqual({});
  });

  it("korrupt JSON → frisk aggregat (kaster ikke)", () => {
    expect(parseAggregate("{ ikke json").requestCount).toBe(0);
  });

  it("gyldig JSON bevares + manglende felter defaultes", () => {
    const a = parseAggregate(JSON.stringify({ requestCount: 3, totalTokens: 50 }));
    expect(a.requestCount).toBe(3);
    expect(a.totalTokens).toBe(50);
    expect(a.perModel).toEqual({});
  });
});

describe("mergeUsage", () => {
  const fresh = parseAggregate(null);

  it("fletter ét request ind med totaler, perModel og byDay", () => {
    const a = mergeUsage(
      fresh,
      "claude-haiku-4-5",
      { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 },
      "2026-06-05",
      "2026-06-05T10:00:00.000Z",
    );
    expect(a.requestCount).toBe(1);
    expect(a.inputTokens).toBe(1000);
    expect(a.outputTokens).toBe(1000);
    expect(a.totalTokens).toBe(2000);
    expect(a.estCostDkk).toBeCloseTo(0.042, 6);
    expect(a.perModel["claude-haiku-4-5"].requests).toBe(1);
    expect(a.byDay["2026-06-05"].totalTokens).toBe(2000);
    expect(a.updatedAt).toBe("2026-06-05T10:00:00.000Z");
  });

  it("akkumulerer over flere requests (samme dag + model)", () => {
    let a: AiUsageAggregate = fresh;
    a = mergeUsage(a, "claude-haiku-4-5", { inputTokens: 500, outputTokens: 500 }, "2026-06-05", "t1");
    a = mergeUsage(a, "claude-haiku-4-5", { inputTokens: 500, outputTokens: 500 }, "2026-06-05", "t2");
    expect(a.requestCount).toBe(2);
    expect(a.totalTokens).toBe(2000);
    expect(a.perModel["claude-haiku-4-5"].requests).toBe(2);
    expect(a.byDay["2026-06-05"].requests).toBe(2);
  });

  it("udleder totalTokens fra input+output når det mangler", () => {
    const a = mergeUsage(fresh, "x", { inputTokens: 30, outputTokens: 70 }, "d", "t");
    expect(a.totalTokens).toBe(100);
  });

  it("holder separate buckets pr. model og pr. dag", () => {
    let a: AiUsageAggregate = fresh;
    a = mergeUsage(a, "claude-haiku-4-5", { totalTokens: 10 }, "2026-06-05", "t1");
    a = mergeUsage(a, "claude-opus-4-7", { totalTokens: 20 }, "2026-06-06", "t2");
    expect(Object.keys(a.perModel)).toEqual(["claude-haiku-4-5", "claude-opus-4-7"]);
    expect(Object.keys(a.byDay)).toEqual(["2026-06-05", "2026-06-06"]);
  });

  it("pruner byDay til maks 90 dage", () => {
    let a: AiUsageAggregate = fresh;
    // Tilføj 95 unikke dage
    for (let i = 1; i <= 95; i++) {
      const dayStr = `2026-01-${String(i).padStart(3, "0")}`; // e.g. 2026-01-001, 2026-01-002
      a = mergeUsage(a, "claude-haiku-4-5", { totalTokens: 10 }, dayStr, "t");
    }
    const days = Object.keys(a.byDay);
    expect(days.length).toBe(90);
    // Skal have slettet de 5 tidligste (001 til 005) og bevaret de 90 seneste (006 til 095)
    expect(days).not.toContain("2026-01-001");
    expect(days).not.toContain("2026-01-005");
    expect(days).toContain("2026-01-006");
    expect(days).toContain("2026-01-095");
  });
});

describe("parseAggregate edge cases", () => {
  it("håndterer explicit null/undefined/forkerte typer i JSON", () => {
    const raw = JSON.stringify({
      requestCount: null,
      inputTokens: undefined,
      outputTokens: "string-som-ikke-er-tal",
      perModel: null,
      byDay: undefined,
    });
    const a = parseAggregate(raw);
    expect(a.requestCount).toBe(0);
    expect(a.inputTokens).toBe(0);
    expect(a.outputTokens).toBe(0);
    expect(a.perModel).toEqual({});
    expect(a.byDay).toEqual({});
  });
});

describe("recordAiUsage best-effort edge cases", () => {
  it("returnerer med det samme uden fejl hvis usage er undefined/tomt", async () => {
    // Dette skal ikke kaste en TypeError eller forsøge at tilgå Prisma
    const recordAiUsage = (await import("@/lib/ai/usage")).recordAiUsage;
    await expect(
      recordAiUsage({
        provider: "anthropic",
        model: "claude-haiku-4-5",
        modality: "text",
        usage: undefined as unknown as UsageTokens,
      }),
    ).resolves.not.toThrow();

    await expect(
      recordAiUsage({
        provider: "anthropic",
        model: "claude-haiku-4-5",
        modality: "text",
        usage: {},
      }),
    ).resolves.not.toThrow();
  });
});
