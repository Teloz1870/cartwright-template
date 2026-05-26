/**
 * invokeTool er den centrale dispatcher. Disse tests sikrer at scope-gating,
 * Zod-validering, og fejl-håndtering virker som forventet — uden at ramme DB.
 *
 * Vi tester mod den faktiske registry der har products.search registreret,
 * men *uden* at lade den ramme DB (vi giver invalid args så Zod fejler tidligt,
 * eller vi tester scope-deny der returneres FØR handler køres).
 */
import { describe, it, expect } from "vitest";
import { invokeTool, getTool, listTools } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";

const TEST_CTX: ToolCtx = {
  actor: "system:test",
  requestId: "test-req-1",
};

describe("invokeTool — dispatcher", () => {
  it("returnerer 404 for ukendt tool", async () => {
    const r = await invokeTool("nonexistent.tool", {}, TEST_CTX, [
      "products:write",
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });

  it("returnerer 403 hvis granted scopes ikke dækker tool.scope", async () => {
    // products.search kræver catalog:read; granted har kun orders:read
    const r = await invokeTool("products.search", { q: "test" }, TEST_CTX, [
      "orders:read",
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.error).toContain("catalog:read");
  });

  it("returnerer 403 ved tom scope-liste", async () => {
    const r = await invokeTool("products.search", { q: "x" }, TEST_CTX, []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
  });

  it("returnerer 422 hvis input fejler Zod-validering", async () => {
    // products.search forventer limit som number; vi sender en streng
    const r = await invokeTool(
      "products.search",
      { limit: "femten" },
      TEST_CTX,
      ["catalog:read"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    if (r.status !== 422) return; // type narrow til 422-varianten
    expect(r.issues).toBeDefined();
  });

  it("returnerer 422 for products.delete uden confirm:true", async () => {
    const r = await invokeTool(
      "products.delete",
      { slug: "test-product" },
      TEST_CTX,
      ["products:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });
});

describe("registry — discovery", () => {
  it("listTools returnerer alle registrerede tools", () => {
    const tools = listTools();
    expect(tools.length).toBeGreaterThanOrEqual(5); // 5 products-tools p.t.
  });

  it("alle tool-navne følger '<domain>.<verb>' konvention", () => {
    for (const tool of listTools()) {
      expect(tool.name).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("ingen duplikerede tool-navne", () => {
    const names = listTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("getTool finder products.search ved navn", () => {
    const t = getTool("products.search");
    expect(t).toBeDefined();
    expect(t?.scope).toBe("catalog:read");
    expect(t?.skipAudit).toBe(true);
  });

  it("destruktive tools (products.delete) er markeret revertible", () => {
    const t = getTool("products.delete");
    expect(t?.revertible).toBe(true);
  });
});
