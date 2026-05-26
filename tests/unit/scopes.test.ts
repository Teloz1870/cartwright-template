import { describe, it, expect } from "vitest";
import { hasScope, isValidScope, SCOPES, CUSTOMER_CHAT_SCOPES } from "@/lib/scopes";
import { CUSTOMER_CONFIRM_REQUIRED } from "@/lib/ai/client";
import { getTool } from "@/lib/tools/registry";

describe("scopes", () => {
  it("isValidScope godkender alle definerede scopes", () => {
    for (const s of SCOPES) {
      expect(isValidScope(s)).toBe(true);
    }
  });

  it("isValidScope afviser ukendte scopes", () => {
    expect(isValidScope("nuclear:launch")).toBe(false);
    expect(isValidScope("")).toBe(false);
    expect(isValidScope("products:")).toBe(false);
  });

  it("hasScope er sand når granted indeholder required", () => {
    expect(hasScope(["products:read", "orders:read"], "products:read")).toBe(true);
  });

  it("hasScope er falsk når granted IKKE indeholder required", () => {
    expect(hasScope(["products:read"], "products:write")).toBe(false);
    expect(hasScope([], "products:read")).toBe(false);
  });

  it("hasScope accepterer wildcard på domæne", () => {
    expect(hasScope(["products:*"], "products:write")).toBe(true);
    expect(hasScope(["products:*"], "products:read")).toBe(true);
  });

  it("wildcard dækker IKKE på tværs af domæner", () => {
    expect(hasScope(["products:*"], "orders:read")).toBe(false);
  });

  it("CUSTOMER_CHAT_SCOPES må ALDRIG indeholde skrivetools til admin-domæner", () => {
    // Hvis denne test fejler er der sikkerheds-implikationer.
    const forbidden = [
      "products:write",
      "discounts:write",
      "settings:write",
      "pages:write",
      "categories:write",
      "audit:revert",
      "marketing:write",
    ];
    for (const f of forbidden) {
      expect(CUSTOMER_CHAT_SCOPES).not.toContain(f);
    }
  });

  it("orders.create er eksponeret med customer write-scope og confirmation", () => {
    expect(getTool("orders.create")?.scope).toBe("orders:write");
    expect(CUSTOMER_CHAT_SCOPES).toContain("orders:write");
    expect(CUSTOMER_CONFIRM_REQUIRED.has("orders.create")).toBe(true);
  });
});
