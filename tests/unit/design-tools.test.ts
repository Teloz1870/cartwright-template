import { describe, it, expect } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";

/**
 * Track 1A (v0.16.0): design.get_layout + design.set_layout er registreret i
 * tool-registry'et og opfører sig efter contract'en:
 *  - get_layout: scope = "settings:read", skipAudit: true
 *  - set_layout: scope = "settings:write", revertible: true,
 *                kræver `confirm: true` (422 uden), mock'er DB i denne suite IKKE.
 *
 * Vi tester KUN registry-niveauet (scope/shape/confirmation). Den fulde
 * DB-roundtrip (withAudit → upsert → invalidateLayoutCache) verificeres i
 * integration mod fresh Turso DB i task #7.
 */

const TEST_CTX: ToolCtx = {
  actor: "system:test",
  requestId: "test-design-tools",
};

describe("design.get_layout — registry", () => {
  it("er registreret som tool", () => {
    const tool = getTool("design.get_layout");
    expect(tool).toBeDefined();
  });

  it("kræver scope settings:read", () => {
    const tool = getTool("design.get_layout");
    expect(tool?.scope).toBe("settings:read");
  });

  it("har skipAudit: true (read-only)", () => {
    const tool = getTool("design.get_layout");
    expect(tool?.skipAudit).toBe(true);
  });

  it("er ikke revertible", () => {
    const tool = getTool("design.get_layout");
    expect(tool?.revertible).not.toBe(true);
  });
});

describe("design.set_layout — registry + validering", () => {
  it("er registreret som tool", () => {
    const tool = getTool("design.set_layout");
    expect(tool).toBeDefined();
  });

  it("kræver scope settings:write", () => {
    const tool = getTool("design.set_layout");
    expect(tool?.scope).toBe("settings:write");
  });

  it("er revertible", () => {
    const tool = getTool("design.set_layout");
    expect(tool?.revertible).toBe(true);
  });

  it("returnerer 403 uden settings:write scope", async () => {
    const r = await invokeTool(
      "design.set_layout",
      {
        confirm: true,
        layout: {
          sections: [
            { key: "hero", enabled: true },
            { key: "ctaFooter", enabled: true },
          ],
        },
      },
      TEST_CTX,
      ["settings:read"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
  });

  it("returnerer 422 hvis confirm mangler", async () => {
    const r = await invokeTool(
      "design.set_layout",
      {
        layout: {
          sections: [
            { key: "hero", enabled: true },
            { key: "ctaFooter", enabled: true },
          ],
        },
      },
      TEST_CTX,
      ["settings:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("returnerer 422 hvis confirm er false", async () => {
    const r = await invokeTool(
      "design.set_layout",
      {
        confirm: false,
        layout: {
          sections: [
            { key: "hero", enabled: true },
            { key: "ctaFooter", enabled: true },
          ],
        },
      },
      TEST_CTX,
      ["settings:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("returnerer 422 hvis layout har tom sections", async () => {
    const r = await invokeTool(
      "design.set_layout",
      {
        confirm: true,
        layout: { sections: [] },
      },
      TEST_CTX,
      ["settings:write"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });
});

describe("design-tools — registry coverage", () => {
  it("design.import_from_url er fortsat registreret (regression)", () => {
    const tool = getTool("design.import_from_url");
    expect(tool).toBeDefined();
    expect(tool?.scope).toBe("settings:write");
  });
});
