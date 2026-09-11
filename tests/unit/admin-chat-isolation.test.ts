/**
 * Isolations-tests for operatør-chat:
 * - Customer-chat må ALDRIG eksponere tools i ADMIN_TOOL_ALLOWLIST
 * - Admin-scopes (ADMIN_CHAT_SCOPES) skal kunne kalde alle tools i
 *   ADMIN_TOOL_ALLOWLIST (eller fejle med 422/Zod, ikke 403)
 * - Admin må IKKE kalde CUSTOMER_ONLY_TOOLS (cart.*)
 * - CONFIRM_REQUIRED-listen matcher write-tools i allowlisten
 *
 * Hvis nogen af disse tests fejler, har vi reel sikkerheds-risiko.
 */
import { describe, it, expect } from "vitest";
import { invokeTool, getTool } from "@/lib/tools/registry";
import { CUSTOMER_CHAT_SCOPES, ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import {
  ADMIN_TOOL_ALLOWLIST,
  CONFIRM_REQUIRED,
  CUSTOMER_ONLY_TOOLS,
  isAdminTool,
  isCustomerTool,
} from "@/lib/ai/client";
import type { ToolCtx } from "@/lib/tools/types";

const CTX: ToolCtx = { actor: "system:test" };

// Minimalt validt args per tool så Zod-validation passerer (eller fejler
// med 422 — ikke 403). Kun struktur, ingen DB-side-effects forventet.
function minimalArgsFor(name: string): unknown {
  const base: Record<string, unknown> = {
    "products.search": { limit: 1 },
    "products.get": { slug: "x" },
    "products.create": {
      name: "Test",
      slug: "test",
      description: "Lang nok beskrivelse her",
      priceDkk: 100,
      stock: 0,
      frameColor: "Sort",
      lensColor: "Grå",
      brand: "Test",
      categoryId: "x",
    },
    "products.update": { slug: "x", patch: {} },
    "products.delete": { slug: "x", confirm: true },
    "categories.list": {},
    "categories.upsert": { slug: "x", name: "Test" },
    "categories.delete": { slug: "x", confirm: true },
    "pages.list": {},
    "pages.upsert": { slug: "x", title: "Test", body: "Lang nok body her" },
    "pages.delete": { slug: "x", confirm: true },
    "orders.list": { limit: 1 },
    "orders.get": { orderId: "x" },
    "orders.update_status": { orderId: "x", status: "paid" },
    "discounts.list": {},
    "discounts.create": { code: "TEST", type: "percent", value: 10 },
    "discounts.toggle": { code: "TEST" },
    "analytics.summary": {},
    "audit.list": {},
    "audit.revert": { auditLogId: "x", confirm: true },
    "settings.get": { type: "shipping" },
    "settings.update_shipping": {
      shippingFeeOere: 4900,
      freeShippingThresholdOere: 49900,
    },
    "settings.update_branding": {
      storeName: "x",
      heroImage: "https://x.com/x",
      announcement: "x".repeat(10),
    },
    "marketing.create_campaign": {
      discountCode: "X",
      discountType: "percent",
      discountValue: 10,
      announcement: "x".repeat(10),
    },
  };
  return base[name] ?? {};
}

describe("Admin-chat isolation", () => {
  it("CUSTOMER_CHAT_SCOPES kan IKKE kalde nogen admin-tool uden delt customer-scope", async () => {
    for (const toolName of ADMIN_TOOL_ALLOWLIST) {
      const tool = getTool(toolName);
      if (!tool) continue;
      // Skip scopes customer-chat deler med enkelte customer-tools:
      // catalog:read til produktvisning og orders:write til orders.create.
      // Isolation for de delte scopes håndhæves af CUSTOMER_TOOL_ALLOWLIST.
      if (CUSTOMER_CHAT_SCOPES.includes(tool.scope)) continue;

      const r = await invokeTool(
        toolName,
        minimalArgsFor(toolName),
        CTX,
        CUSTOMER_CHAT_SCOPES,
      );
      expect(r.ok, `${toolName} burde være 403 for customer`).toBe(false);
      if (r.ok) continue;
      expect(
        r.status,
        `${toolName} returnerede ${r.status}, forventet 403`,
      ).toBe(403);
    }
  });

  it("CUSTOMER_TOOL_ALLOWLIST eksponerer ikke admin-only tools med delte scopes", () => {
    for (const toolName of ADMIN_TOOL_ALLOWLIST) {
      const tool = getTool(toolName);
      if (!tool) continue;
      // products.search/products.get er bevidst delte catalog-tools.
      if (tool.scope === "catalog:read") continue;
      expect(
        isCustomerTool(toolName),
        `${toolName} må ikke være eksponeret for customer-chat`,
      ).toBe(false);
    }
  });

  it("ADMIN_CHAT_SCOPES dækker scopes for alle tools i ADMIN_TOOL_ALLOWLIST", () => {
    // Hvis en tool i allowlisten har et scope der IKKE er i ADMIN_CHAT_SCOPES,
    // vil admin-chat-kald fejle 403 — det er en konfigurations-fejl.
    for (const toolName of ADMIN_TOOL_ALLOWLIST) {
      const tool = getTool(toolName);
      expect(tool, `Tool ${toolName} skal findes i registry`).toBeDefined();
      if (!tool) continue;
      expect(
        ADMIN_CHAT_SCOPES.includes(tool.scope),
        `Tool ${toolName} (scope: ${tool.scope}) mangler i ADMIN_CHAT_SCOPES`,
      ).toBe(true);
    }
  });

  it("CUSTOMER_ONLY_TOOLS er IKKE i ADMIN_TOOL_ALLOWLIST", () => {
    for (const customerTool of CUSTOMER_ONLY_TOOLS) {
      expect(
        (ADMIN_TOOL_ALLOWLIST as readonly string[]).includes(customerTool),
        `${customerTool} er customer-only, må ikke være i admin-allowlist`,
      ).toBe(false);
    }
  });

  it("CONFIRM_REQUIRED indeholder kun tools fra ADMIN_TOOL_ALLOWLIST", () => {
    for (const tool of CONFIRM_REQUIRED) {
      expect(
        (ADMIN_TOOL_ALLOWLIST as readonly string[]).includes(tool),
        `CONFIRM_REQUIRED tool ${tool} skal også være i ADMIN_TOOL_ALLOWLIST`,
      ).toBe(true);
    }
  });

  it("isAdminTool() matcher præcis ADMIN_TOOL_ALLOWLIST", () => {
    for (const name of ADMIN_TOOL_ALLOWLIST) {
      expect(isAdminTool(name)).toBe(true);
    }
    expect(isAdminTool("cart.add")).toBe(false);
    expect(isAdminTool("nonsense.xyz")).toBe(false);
  });
});
