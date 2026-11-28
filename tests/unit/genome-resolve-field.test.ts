import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * resolveField (lib/genome/resolve.ts) — an EXHAUSTIVE, pure-unit table for the
 * TRIGGERED resolve state machine.
 *
 * Existing coverage is partial and split across two files: genome-resolver.test.ts
 * tests only the LLM resolver wiring (resolveCopyField), and genome.test.ts has a
 * prisma-mock "resolveField (triggered)" block covering just the three happy-path
 * branches (override short-circuit, resolver-runs-and-writes-cache, anchored→anchor).
 * This file isolates resolve.ts behind mocked store/fields/audit seams (no DB, no
 * prisma) and adds the branches neither file exercises: STALE cache rerun (deps
 * changed), cache that no longer passes schema re-validation, an INVALID override
 * falling through, invalid resolver output leaving NO mutation, and a resolver that
 * throws leaving NO mutation — plus a deps-keyed persistence assertion. The three
 * happy-path branches are re-asserted here too so the precedence table is readable
 * in one place.
 *
 * resolveField IS the moat invariant in its triggered form. The render path
 * (readField) is "override ?? cache ?? anchor, never an LLM"; resolveField is the
 * only path allowed to run the resolver, and it must:
 *   1. honour a valid override (no resolve),
 *   2. honour anchored / no-resolver fields (anchor, no resolve),
 *   3. reuse a cache whose deps still match (no LLM),
 *   4. re-run when the cache is stale (deps changed) or fails schema re-validation,
 *   5. NEVER mutate when the resolver output is invalid or throws (the render anchor stands),
 *   6. persist a fresh result under audit with the deps key.
 *
 * We mock the store/fields/audit seams so no DB, no real LLM, no zod version
 * coupling — the schema is a tiny stub (len ≥ 3) that mirrors the real z.string()
 * min-length behaviour for the precedence branches under test.
 */

const h = vi.hoisted(() => {
  // Minimal schema stub mirroring z.string().min(3): success only for strings ≥3 chars.
  const strSchema = {
    safeParse: (v: unknown) =>
      typeof v === "string" && v.length >= 3
        ? ({ success: true as const, data: v })
        : ({ success: false as const }),
  };
  const resolver = vi.fn();
  const FIELDS = {
    // resolvable + has a resolver — the only field that can reach the LLM branch.
    resolvableField: {
      anchor: "ANCHOR-R",
      lock: "resolvable",
      dependsOn: ["tone"],
      schema: strSchema,
      label: "R",
      resolver,
    },
    // anchored — must return the anchor, never resolve (no resolver at all).
    anchoredField: {
      anchor: "ANCHOR-A",
      lock: "anchored",
      dependsOn: [],
      schema: strSchema,
      label: "A",
    },
    // resolvable lock but NO resolver wired — also short-circuits to the anchor.
    noResolverField: {
      anchor: "ANCHOR-N",
      lock: "resolvable",
      dependsOn: [],
      schema: strSchema,
      label: "N",
    },
  };
  const state = {
    genome: {} as Record<string, unknown>,
    deps: {
      tone: "warm",
      audience: "consumer",
      formality: "casual",
      vibe: "cozy",
      storeName: "Acme",
    },
    mutated: null as unknown,
    auditCtx: null as unknown,
  };
  return { strSchema, resolver, FIELDS, state };
});

vi.mock("@/lib/genome/fields", () => ({ GENOME_FIELDS: h.FIELDS }));

vi.mock("@/lib/audit", () => ({
  // Run the work fn directly; capture the audit context for assertions.
  withAudit: async (ctx: unknown, fn: () => unknown) => {
    h.state.auditCtx = ctx;
    return fn();
  },
}));

vi.mock("@/lib/genome/store", () => ({
  loadGenome: async () => h.state.genome,
  activeDeps: () => h.state.deps,
  // Deterministic, field-agnostic key — enough to distinguish match vs stale.
  depsKey: (_field: unknown, deps: unknown) => JSON.stringify(deps),
  readGenomeJson: async () => "BEFORE",
  mutateGenome: async (updater: (cur: Record<string, unknown>) => unknown) => {
    h.state.mutated = updater(h.state.genome);
  },
}));

// Cast helper — the real GenomeFieldKey union is keyed off the real FIELDS; our
// synthetic keys stand in for it and `never` is assignable to the param type.
const K = (s: string) => s as never;
const ACTOR = { type: "test" } as never;

const matchingDepsKey = () => JSON.stringify(h.state.deps);

import { resolveField } from "@/lib/genome/resolve";

describe("resolveField — precedence + cache state machine", () => {
  beforeEach(() => {
    h.resolver.mockReset();
    h.state.genome = {};
    h.state.mutated = null;
    h.state.auditCtx = null;
  });

  it("a valid override wins — returns it, marks cached, never resolves", async () => {
    h.state.genome = { overrides: { resolvableField: "OVERRIDE-VAL" } };

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out).toEqual({ ok: true, value: "OVERRIDE-VAL", cached: true });
    expect(h.resolver).not.toHaveBeenCalled();
    expect(h.state.mutated).toBeNull();
  });

  it("an INVALID override is ignored — falls through to the resolver", async () => {
    h.state.genome = { overrides: { resolvableField: "xx" } }; // len 2 < 3 → schema fails
    h.resolver.mockResolvedValue("RESOLVED-OK");

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out).toEqual({ ok: true, value: "RESOLVED-OK", cached: false });
    expect(h.resolver).toHaveBeenCalledOnce();
  });

  it("an anchored field returns its anchor without resolving", async () => {
    const out = await resolveField(K("anchoredField"), ACTOR);
    expect(out).toEqual({ ok: true, value: "ANCHOR-A", cached: true });
    expect(h.resolver).not.toHaveBeenCalled();
  });

  it("a resolvable field with no resolver returns its anchor", async () => {
    const out = await resolveField(K("noResolverField"), ACTOR);
    expect(out).toEqual({ ok: true, value: "ANCHOR-N", cached: true });
  });

  it("a valid cache whose deps match is reused — no LLM call", async () => {
    h.state.genome = {
      resolved: { resolvableField: { value: "CACHED-VAL", deps: matchingDepsKey() } },
    };

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out).toEqual({ ok: true, value: "CACHED-VAL", cached: true });
    expect(h.resolver).not.toHaveBeenCalled();
  });

  it("a STALE cache (deps changed) is discarded — resolver re-runs and persists", async () => {
    h.state.genome = {
      resolved: { resolvableField: { value: "OLD-VAL", deps: "STALE-DEPS-KEY" } },
    };
    h.resolver.mockResolvedValue("FRESH-VAL");

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out).toEqual({ ok: true, value: "FRESH-VAL", cached: false });
    expect(h.resolver).toHaveBeenCalledOnce();
    // re-cached under the CURRENT deps key
    expect(h.state.mutated).toMatchObject({
      resolved: { resolvableField: { value: "FRESH-VAL", deps: matchingDepsKey() } },
    });
  });

  it("a cache value that no longer passes schema re-validation is discarded", async () => {
    // deps match, but the cached value is now invalid (len 2 < 3) — must re-resolve.
    h.state.genome = {
      resolved: { resolvableField: { value: "xx", deps: matchingDepsKey() } },
    };
    h.resolver.mockResolvedValue("REVALIDATED");

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out).toEqual({ ok: true, value: "REVALIDATED", cached: false });
    expect(h.resolver).toHaveBeenCalledOnce();
  });

  it("invalid resolver output → {ok:false} and NO mutation (anchor stands)", async () => {
    h.resolver.mockResolvedValue(""); // fails the schema

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("resolvableField");
    expect(h.state.mutated).toBeNull();
    expect(h.state.auditCtx).toBeNull();
  });

  it("a resolver that throws → {ok:false} with the message and NO mutation", async () => {
    h.resolver.mockRejectedValue(new Error("boom"));

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out).toEqual({ ok: false, error: "boom" });
    expect(h.state.mutated).toBeNull();
  });

  it("a fresh resolve persists under audit with the right context + deps key", async () => {
    h.resolver.mockResolvedValue("NEW-COPY");

    const out = await resolveField(K("resolvableField"), ACTOR);

    expect(out).toEqual({ ok: true, value: "NEW-COPY", cached: false });
    expect(h.resolver).toHaveBeenCalledWith(h.state.deps);
    // audit context carries the tool + key + deps key
    expect(h.state.auditCtx).toMatchObject({
      tool: "genome.resolve",
      args: { key: "resolvableField", deps: matchingDepsKey() },
    });
    // the resolved cache is written keyed by the producing deps
    expect(h.state.mutated).toMatchObject({
      resolved: { resolvableField: { value: "NEW-COPY", deps: matchingDepsKey() } },
    });
  });
});
