import { describe, it, expect } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import {
  ADMIN_TOOL_ALLOWLIST,
  CONFIRM_REQUIRED,
  CUSTOMER_TOOL_ALLOWLIST,
} from "@/lib/ai/client";
import { sanitizeVibeHtml } from "@/lib/v0/transform/sanitize";

/**
 * Mockup-first tools (mockup.set / mockup.clear) — registry-level contract +
 * the moat: exposed to the BUILD agent (admin chat + MCP via the allowlist),
 * confirm-gated, and NEVER to the shopper storefront agent. Sanitization is
 * the vibe-sandbox's one policy (sanitizeVibeHtml) — asserted here without a
 * DB roundtrip (mirrors compose-tools.test.ts).
 */

const CTX: ToolCtx = { actor: "system:test", requestId: "test-mockup" };
const ADMIN_SCOPES = ["settings:read", "settings:write"] as const;
const MOCKUP_TOOLS = ["mockup.set", "mockup.clear"] as const;

describe("mockup tools — registry contract", () => {
  for (const name of MOCKUP_TOOLS) {
    it(`${name} is registered as a settings:write tool`, () => {
      const t = getTool(name);
      expect(t).toBeDefined();
      expect(t?.scope).toBe("settings:write");
    });
  }

  it("descriptions document the welcome-canvas interplay", () => {
    // mockup.set takes over above the first-run canvas; mockup.clear does not
    // resurrect it on a touched site — both facts must stay in the contract
    // the agent reads (tool descriptions are the API docs).
    expect(getTool("mockup.set")?.description).toMatch(/welcome canvas/i);
    expect(getTool("mockup.clear")?.description).toMatch(/welcome canvas/i);
  });
});

describe("mockup tools — the moat (allowlists)", () => {
  it("are exposed to the admin / build agent", () => {
    for (const n of MOCKUP_TOOLS) {
      expect(ADMIN_TOOL_ALLOWLIST as readonly string[]).toContain(n);
    }
  });

  it("every mockup write is confirm-gated", () => {
    for (const n of MOCKUP_TOOLS) {
      expect(CONFIRM_REQUIRED.has(n as never)).toBe(true);
    }
  });

  it("are NEVER exposed to the shopper storefront agent", () => {
    for (const n of MOCKUP_TOOLS) {
      expect(CUSTOMER_TOOL_ALLOWLIST as readonly string[]).not.toContain(n);
    }
  });
});

describe("mockup tools — validation + scope enforcement", () => {
  it("mockup.set requires confirm: true (422)", async () => {
    const r = await invokeTool("mockup.set", { html: "<section>x</section>" }, CTX, [
      ...ADMIN_SCOPES,
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("mockup.set requires a non-empty html string (422)", async () => {
    const r = await invokeTool("mockup.set", { html: "", confirm: true }, CTX, [
      ...ADMIN_SCOPES,
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("mockup.clear requires confirm: true (422)", async () => {
    const r = await invokeTool("mockup.clear", {}, CTX, [...ADMIN_SCOPES]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("enforces settings:write scope (403 without it)", async () => {
    for (const [name, args] of [
      ["mockup.set", { html: "<section>x</section>", confirm: true }],
      ["mockup.clear", { confirm: true }],
    ] as const) {
      const r = await invokeTool(name, args, CTX, ["settings:read"]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(403);
    }
  });
});

describe("mockup tools — sanitize reuse (the vibe-sandbox policy)", () => {
  it("html that sanitizes to nothing is rejected before any write (handler throws → 500)", async () => {
    // Script-only payload: sanitizeVibeHtml strips it to "" — the handler
    // must refuse to publish an empty takeover. This both proves the
    // sandbox sanitizer is wired in AND avoids a DB roundtrip.
    const scriptOnly = '<script>alert("xss")</script>';
    expect(sanitizeVibeHtml(scriptOnly)).toBe("");
    const r = await invokeTool(
      "mockup.set",
      { html: scriptOnly, confirm: true },
      CTX,
      [...ADMIN_SCOPES],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it("sanitizeVibeHtml is the exact policy (scripts/iframes/handlers/javascript: stripped, markup kept)", () => {
    const dirty =
      '<section onclick="evil()"><iframe src="https://x.test"></iframe>' +
      '<a href="javascript:evil()">go</a><h1 class="text-5xl">Mockup</h1></section>';
    const clean = sanitizeVibeHtml(dirty);
    expect(clean).not.toMatch(/onclick|iframe|javascript:/i);
    expect(clean).toContain('<h1 class="text-5xl">Mockup</h1>');
  });
});
