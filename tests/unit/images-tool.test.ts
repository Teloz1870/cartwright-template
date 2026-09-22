/**
 * Tests for billed-tools (images.search_unsplash + products.attach_image).
 *
 * Vi tester scope-gating + Zod-validation uden at ramme DB eller Unsplash API.
 * Live-integration verificeres manuelt i Phase 7 af planen.
 */
import { describe, it, expect } from "vitest";
import { invokeTool, getTool, listTools } from "@/lib/tools/registry";
import {
  ADMIN_TOOL_ALLOWLIST,
  CONFIRM_REQUIRED,
  isAdminTool,
} from "@/lib/ai/client";
import { CUSTOMER_CHAT_SCOPES, ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import type { ToolCtx } from "@/lib/tools/types";

const CTX: ToolCtx = { actor: "system:test" };

describe("Billed-tools — registrering og scope-gating", () => {
  it("images.search_unsplash er registreret i registry", () => {
    expect(getTool("images.search_unsplash")).toBeDefined();
  });

  it("products.attach_image er registreret i registry", () => {
    expect(getTool("products.attach_image")).toBeDefined();
  });

  it("begge tools er i ADMIN_TOOL_ALLOWLIST", () => {
    expect((ADMIN_TOOL_ALLOWLIST as readonly string[]).includes("images.search_unsplash")).toBe(true);
    expect((ADMIN_TOOL_ALLOWLIST as readonly string[]).includes("products.attach_image")).toBe(true);
  });

  it("products.attach_image er IKKE i CONFIRM_REQUIRED (additivt)", () => {
    // Beslutning: append-only er ikke destructive — ingen plan-card.
    expect(CONFIRM_REQUIRED.has("products.attach_image" as never)).toBe(false);
  });

  it("images.search_unsplash er IKKE i CONFIRM_REQUIRED (read-only)", () => {
    expect(CONFIRM_REQUIRED.has("images.search_unsplash" as never)).toBe(false);
  });

  it("isAdminTool() genkender begge nye tools", () => {
    expect(isAdminTool("images.search_unsplash")).toBe(true);
    expect(isAdminTool("products.attach_image")).toBe(true);
  });

  it("Tools tilføjet til totaltælling", () => {
    expect(listTools().length).toBeGreaterThanOrEqual(26);
  });

  it("Customer-scopes kan IKKE kalde products.attach_image", async () => {
    const r = await invokeTool(
      "products.attach_image",
      { slug: "test", imageUrl: "https://example.com/img.jpg" },
      CTX,
      CUSTOMER_CHAT_SCOPES,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
  });

  it("images.search_unsplash afviser tom query (Zod)", async () => {
    const r = await invokeTool(
      "images.search_unsplash",
      { query: "" },
      CTX,
      ADMIN_CHAT_SCOPES,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("products.attach_image afviser ikke-https URL", async () => {
    const r = await invokeTool(
      "products.attach_image",
      { slug: "test", imageUrl: "not-a-url" },
      CTX,
      ADMIN_CHAT_SCOPES,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });
});
