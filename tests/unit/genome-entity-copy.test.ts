import { describe, expect, it, vi, beforeEach } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import { CUSTOMER_TOOL_ALLOWLIST } from "@/lib/ai/client";

/**
 * WS5a — per-entity voiced copy (genomeEntityCopy). The genome blob gains an
 * entityOverrides map; readEntityCopy returns the override or the entity's own
 * copy (PDP/PLP gate on the flag, so off = byte-identical). The
 * genome.set_entity_copy tool sets/clears overrides — confirm-gated, audited,
 * settings:write, and never reachable by the shopper agent.
 */

const mocks = vi.hoisted(() => ({
  prisma: { brandingSettings: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

const CTX: ToolCtx = { actor: "system:test", requestId: "test-entity-copy" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("entityOverrides — parse + read", () => {
  it("parseGenome roundtrips entityOverrides and drops non-strings", async () => {
    const { parseGenome } = await import("@/lib/genome/store");
    const blob = parseGenome(
      JSON.stringify({ entityOverrides: { "product:p1:description": "Voiced!", junk: 5 } }),
    );
    expect(blob.entityOverrides).toEqual({ "product:p1:description": "Voiced!" });
  });

  it("entityCopyKey is stable", async () => {
    const { entityCopyKey } = await import("@/lib/genome/read");
    expect(entityCopyKey("product", "abc", "description")).toBe("product:abc:description");
  });

  it("readEntityCopy returns the override when set, else the fallback", async () => {
    const { readEntityCopy } = await import("@/lib/genome/read");
    const { invalidateGenomeCache } = await import("@/lib/genome/store");

    invalidateGenomeCache();
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({
      genomeJson: JSON.stringify({ entityOverrides: { "product:p1:description": "Voiced copy here" } }),
    });
    expect(await readEntityCopy("product", "p1", "description", "FALLBACK")).toBe("Voiced copy here");

    invalidateGenomeCache();
    expect(await readEntityCopy("product", "other-id", "description", "FALLBACK")).toBe("FALLBACK");
  });

  it("readEntityCopy ignores a whitespace-only override", async () => {
    const { readEntityCopy } = await import("@/lib/genome/read");
    const { invalidateGenomeCache } = await import("@/lib/genome/store");
    invalidateGenomeCache();
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({
      genomeJson: JSON.stringify({ entityOverrides: { "category:c1:description": "   " } }),
    });
    expect(await readEntityCopy("category", "c1", "description", "FALLBACK")).toBe("FALLBACK");
  });
});

describe("genome.set_entity_copy — tool contract + moat", () => {
  it("is registered as a revertible settings:write tool", () => {
    const t = getTool("genome.set_entity_copy");
    expect(t).toBeDefined();
    expect(t?.scope).toBe("settings:write");
    expect(t?.revertible).toBe(true);
  });

  it("requires confirm: true (422)", async () => {
    const r = await invokeTool(
      "genome.set_entity_copy",
      { kind: "product", id: "p1", field: "description", value: "x" },
      CTX,
      ["settings:write"],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("enforces settings:write scope (403 without it)", async () => {
    const r = await invokeTool(
      "genome.set_entity_copy",
      { kind: "product", id: "p1", field: "description", value: "x", confirm: true },
      CTX,
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("is NEVER exposed to the shopper storefront agent", () => {
    expect(CUSTOMER_TOOL_ALLOWLIST as readonly string[]).not.toContain("genome.set_entity_copy");
  });
});
