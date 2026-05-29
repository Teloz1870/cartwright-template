/**
 * Smoke-tests for de nye tool-domæner: orders, discounts, categories, pages,
 * settings. Vi tester scope-gating + Zod-validation uden at ramme DB (alle
 * fejl-paths returnerer FØR handler eksekveres).
 */
import { describe, it, expect } from "vitest";
import { invokeTool, getTool, listTools } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";

const CTX: ToolCtx = { actor: "system:test" };

describe("Tools — domain coverage", () => {
  it("registry indeholder mindst 22 tools efter batch 2", () => {
    expect(listTools().length).toBeGreaterThanOrEqual(22);
  });

  it("alle forventede tool-domæner er registreret", () => {
    const names = listTools().map((t) => t.name);
    // Spot-check nøgletools fra hvert domæne
    expect(names).toContain("products.search");
    expect(names).toContain("orders.list");
    expect(names).toContain("orders.update_status");
    expect(names).toContain("discounts.create");
    expect(names).toContain("discounts.toggle");
    expect(names).toContain("categories.upsert");
    expect(names).toContain("pages.upsert");
    expect(names).toContain("settings.get");
    expect(names).toContain("settings.update_shipping");
    expect(names).toContain("settings.update_branding");
    // Batch 2
    expect(names).toContain("analytics.summary");
    expect(names).toContain("marketing.create_campaign");
    expect(names).toContain("audit.list");
    expect(names).toContain("audit.revert");
  });

  it("orders.update_status afviser ugyldige statuser", async () => {
    const r = await invokeTool(
      "orders.update_status",
      { orderId: "x", status: "completed" }, // 'completed' findes ikke
      CTX,
      ["orders:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("discounts.create afviser percent > 100", async () => {
    const r = await invokeTool(
      "discounts.create",
      { code: "TEST200", type: "percent", value: 200 },
      CTX,
      ["discounts:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("discounts.create normaliserer kode til UPPERCASE+trimmed", () => {
    const tool = getTool("discounts.create");
    expect(tool).toBeDefined();
    const parsed = tool!.input.safeParse({
      code: "  sommer10  ",
      type: "percent",
      value: 10,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect((parsed.data as { code: string }).code).toBe("SOMMER10");
  });

  it("categories.delete kræver confirm:true", async () => {
    const r = await invokeTool(
      "categories.delete",
      { slug: "test-cat" },
      CTX,
      ["categories:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("pages.upsert kræver body med min 10 tegn", async () => {
    const r = await invokeTool(
      "pages.upsert",
      { slug: "test-page", title: "Test", body: "kort" },
      CTX,
      ["pages:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("settings.update_shipping accepterer gyldigt input via Zod", () => {
    const tool = getTool("settings.update_shipping");
    expect(tool).toBeDefined();
    const parsed = tool!.input.safeParse({
      shippingFeeOere: 4900,
      freeShippingThresholdOere: 49900,
    });
    expect(parsed.success).toBe(true);
  });

  it("settings.update_shipping afviser negativ pris", async () => {
    const r = await invokeTool(
      "settings.update_shipping",
      { shippingFeeOere: -1, freeShippingThresholdOere: 49900 },
      CTX,
      ["settings:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("settings.update_branding kræver gyldig URL for heroImage", async () => {
    const r = await invokeTool(
      "settings.update_branding",
      {
        storeName: "test",
        heroImage: "not-a-url",
        announcement: "x",
      },
      CTX,
      ["settings:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("audit.revert kræver confirm:true", async () => {
    const r = await invokeTool(
      "audit.revert",
      { auditLogId: "abc" },
      CTX,
      ["audit:revert"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("marketing.create_campaign accepterer fuldt input", () => {
    const tool = getTool("marketing.create_campaign");
    expect(tool).toBeDefined();
    const parsed = tool!.input.safeParse({
      discountCode: "weekend",
      discountType: "percent",
      discountValue: 20,
      announcement: "Sport-weekend — 20% rabat med koden WEEKEND ☀️",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Code skal være uppercased
    expect((parsed.data as { discountCode: string }).discountCode).toBe(
      "WEEKEND",
    );
  });

  it("marketing.create_campaign afviser kort announcement (<5 tegn)", async () => {
    const r = await invokeTool(
      "marketing.create_campaign",
      {
        discountCode: "X",
        discountType: "percent",
        discountValue: 10,
        announcement: "Hi",
      },
      CTX,
      ["marketing:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("customer-scope MÅ IKKE kunne kalde admin-tools", async () => {
    const customerScopes = ["catalog:read", "cart:write"] as const;

    // Hver af disse skal returnere 403
    const adminTools = [
      ["products.create", { name: "x" }],
      ["products.delete", { slug: "x", confirm: true }],
      ["orders.update_status", { orderId: "x", status: "paid" }],
      ["discounts.create", { code: "X", type: "percent", value: 10 }],
      ["categories.upsert", { slug: "x", name: "x" }],
      ["pages.upsert", { slug: "x", title: "x", body: "xxxxxxxxxx" }],
      ["settings.update_shipping", { shippingFeeOere: 0, freeShippingThresholdOere: 0 }],
      ["settings.update_branding", { storeName: "x", heroImage: "https://x.com", announcement: "x" }],
      [
        "marketing.create_campaign",
        {
          discountCode: "X",
          discountType: "percent",
          discountValue: 10,
          announcement: "xxxxx",
        },
      ],
      ["audit.revert", { auditLogId: "x", confirm: true }],
    ] as const;

    for (const [name, args] of adminTools) {
      const r = await invokeTool(name, args, CTX, customerScopes);
      expect(r.ok, `${name} burde have returneret 403`).toBe(false);
      if (r.ok) continue;
      expect(r.status, `${name} returnerede status ${r.status}, forventet 403`).toBe(403);
    }
  });
});
