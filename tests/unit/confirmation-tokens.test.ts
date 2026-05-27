import { describe, it, expect, beforeEach } from "vitest";
import {
  createPendingConfirmation,
  consumeConfirmation,
  hashArgs,
  stripConfirm,
  _resetPendingConfirmations,
} from "@/lib/confirmation-tokens";

beforeEach(() => {
  _resetPendingConfirmations();
});

describe("confirmation-tokens — plan-først security primitive", () => {
  it("token consumes successfully when tool + args + owner matcher", () => {
    const token = createPendingConfirmation({
      tool: "products.delete",
      toolArgs: { slug: "test-product" },
      ownerId: "admin-1",
    });
    const r = consumeConfirmation({
      token,
      tool: "products.delete",
      toolArgs: { slug: "test-product" },
      ownerId: "admin-1",
    });
    expect(r.ok).toBe(true);
  });

  it("token er one-time-use — anden consume returnerer fejl", () => {
    const token = createPendingConfirmation({
      tool: "products.delete",
      toolArgs: { slug: "x" },
      ownerId: "admin-1",
    });
    consumeConfirmation({ token, tool: "products.delete", toolArgs: { slug: "x" }, ownerId: "admin-1" });
    const second = consumeConfirmation({
      token,
      tool: "products.delete",
      toolArgs: { slug: "x" },
      ownerId: "admin-1",
    });
    expect(second.ok).toBe(false);
  });

  it("AI'ens fake-token (UUID-format men aldrig udstedt) afvises", () => {
    const r = consumeConfirmation({
      token: "00000000-0000-0000-0000-000000000000",
      tool: "products.delete",
      toolArgs: { slug: "x" },
      ownerId: "admin-1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("Ukendt");
  });

  it("hvis args ændres mellem proposal og consume → afvist", () => {
    const token = createPendingConfirmation({
      tool: "products.delete",
      toolArgs: { slug: "original-slug" },
      ownerId: "admin-1",
    });
    const r = consumeConfirmation({
      token,
      tool: "products.delete",
      toolArgs: { slug: "different-slug" }, // ← byttet ud
      ownerId: "admin-1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("Args er ændret");
  });

  it("hvis tool-navn ændres → afvist (kan ikke bruge token til andet tool)", () => {
    const token = createPendingConfirmation({
      tool: "products.delete",
      toolArgs: { slug: "x" },
      ownerId: "admin-1",
    });
    const r = consumeConfirmation({
      token,
      tool: "products.create", // ← andet tool!
      toolArgs: { slug: "x" },
      ownerId: "admin-1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("andet tool");
  });

  it("hvis ownerId ændres → afvist (token er owner-scoped)", () => {
    const token = createPendingConfirmation({
      tool: "products.delete",
      toolArgs: { slug: "x" },
      ownerId: "admin-1",
    });
    const r = consumeConfirmation({
      token,
      tool: "products.delete",
      toolArgs: { slug: "x" },
      ownerId: "admin-2", // ← anden owner
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("anden session");
  });

  it("stripConfirm fjerner kun top-level confirm før hash og tool execution", () => {
    expect(stripConfirm({ slug: "x", confirm: true, nested: { confirm: true } })).toEqual({
      slug: "x",
      nested: { confirm: true },
    });
    expect(stripConfirm(null)).toBeNull();
    expect(stripConfirm(["confirm"])).toEqual(["confirm"]);
  });

  it("hashArgs er deterministisk og rækkefølge-invariant", () => {
    const h1 = hashArgs("products.update", { slug: "a", patch: { stock: 10 } });
    const h2 = hashArgs("products.update", { patch: { stock: 10 }, slug: "a" });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{32}$/);
  });

  it("forskelligt tool eller forskellige args giver forskellig hash", () => {
    expect(hashArgs("a", {})).not.toBe(hashArgs("b", {}));
    expect(hashArgs("a", { x: 1 })).not.toBe(hashArgs("a", { x: 2 }));
  });
});
