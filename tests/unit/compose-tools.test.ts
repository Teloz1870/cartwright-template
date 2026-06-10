import { describe, it, expect } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import {
  ADMIN_TOOL_ALLOWLIST,
  CONFIRM_REQUIRED,
  CUSTOMER_TOOL_ALLOWLIST,
} from "@/lib/ai/client";

/**
 * WS4 — agent-compose tools (vertical.apply, design.set_slug, magic.compose_look).
 * Registry-level contract + the moat: exposed to the BUILD agent (admin chat +
 * MCP via the allowlist), confirm-gated, and NEVER to the shopper storefront
 * agent. DB roundtrips are not exercised here (mirrors design-tools.test.ts).
 */

const CTX: ToolCtx = { actor: "system:test", requestId: "test-compose" };
const ADMIN_SCOPES = ["settings:read", "settings:write", "pages:read", "pages:write"] as const;
const COMPOSE_WRITES = ["vertical.apply", "design.set_slug", "magic.compose_look"] as const;

describe("compose tools — registry contract", () => {
  for (const name of COMPOSE_WRITES) {
    it(`${name} is registered as a revertible settings:write tool`, () => {
      const t = getTool(name);
      expect(t).toBeDefined();
      expect(t?.scope).toBe("settings:write");
      expect(t?.revertible).toBe(true);
    });
  }
});

describe("compose tools — the moat (allowlists)", () => {
  it("are exposed to the admin / build agent", () => {
    for (const n of COMPOSE_WRITES) {
      expect(ADMIN_TOOL_ALLOWLIST as readonly string[]).toContain(n);
    }
    // the build agent can also drive the prompt page-builder + publish
    for (const n of ["magic.plan_page", "magic.generate_page", "pages.set_layout"]) {
      expect(ADMIN_TOOL_ALLOWLIST as readonly string[]).toContain(n);
    }
  });

  it("every compose write is confirm-gated", () => {
    for (const n of [...COMPOSE_WRITES, "pages.set_layout"] as const) {
      expect(CONFIRM_REQUIRED.has(n as never)).toBe(true);
    }
  });

  it("are NEVER exposed to the shopper storefront agent", () => {
    for (const n of [...COMPOSE_WRITES, "pages.set_layout", "magic.generate_page"]) {
      expect(CUSTOMER_TOOL_ALLOWLIST as readonly string[]).not.toContain(n);
    }
  });
});

describe("compose tools — validation + scope enforcement", () => {
  it("vertical.apply requires confirm: true (422)", async () => {
    const r = await invokeTool("vertical.apply", { slug: "cafe" }, CTX, [...ADMIN_SCOPES]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("magic.compose_look requires at least one of vertical/design (422)", async () => {
    const r = await invokeTool("magic.compose_look", { confirm: true }, CTX, [...ADMIN_SCOPES]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("enforces settings:write scope (403 without it)", async () => {
    const r = await invokeTool("vertical.apply", { slug: "cafe", confirm: true }, CTX, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("design.set_slug rejects an unknown design slug (handler throws → 500)", async () => {
    const r = await invokeTool(
      "design.set_slug",
      { designSlug: "definitely-not-a-real-design", confirm: true },
      CTX,
      [...ADMIN_SCOPES],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });
});
