import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import {
  ADMIN_TOOL_ALLOWLIST,
  CONFIRM_REQUIRED,
  CUSTOMER_TOOL_ALLOWLIST,
} from "@/lib/ai/client";

/**
 * redirects.import — registry-level contract + the moat (mirrors
 * mockup-tools.test.ts): a settings:write tool, exposed to the build/admin
 * agent and confirm-gated there, never to the shopper agent. Over REST/MCP a
 * dry run is a read and needs no confirm; a real import without confirm is
 * refused before any handler code runs.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    redirect: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  withAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-redirects" };
const ADMIN_SCOPES = ["settings:read", "settings:write"] as const;
const CSV = "from,to,status\n/old,/new\n/sale,/campaign,302\n";

beforeEach(() => {
  mocks.prisma.redirect.findMany.mockReset().mockResolvedValue([]);
  mocks.prisma.redirect.upsert.mockReset().mockImplementation((args: unknown) => args);
  mocks.prisma.$transaction.mockReset().mockResolvedValue([]);
  mocks.withAudit
    .mockReset()
    .mockImplementation(async (_meta: unknown, fn: () => Promise<unknown>) => fn());
});

describe("redirects.import — registry contract + the moat", () => {
  it("is registered as a settings:write tool with a concrete output schema", () => {
    const t = getTool("redirects.import");
    expect(t).toBeDefined();
    expect(t?.scope).toBe("settings:write");
    expect(t?.description).toMatch(/dryRun:true/);
    expect(t?.description).toMatch(/chains/i);
  });

  it("is exposed to the admin / build agent, confirm-gated there, never to the shopper agent", () => {
    expect(ADMIN_TOOL_ALLOWLIST as readonly string[]).toContain("redirects.import");
    expect(CONFIRM_REQUIRED.has("redirects.import" as never)).toBe(true);
    expect(CUSTOMER_TOOL_ALLOWLIST as readonly string[]).not.toContain("redirects.import");
  });
});

describe("redirects.import — validation + scope enforcement", () => {
  it("dryRun: true needs no confirm and returns the plan without writing", async () => {
    const r = await invokeTool("redirects.import", { csv: CSV, dryRun: true }, CTX, [...ADMIN_SCOPES]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({
      dryRun: true,
      summary: { rows: 2, valid: 2, invalid: 0, replaces: 0 },
      errors: [],
    });
    expect(getTool("redirects.import")?.output.safeParse(r.result).success).toBe(true);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("a real import without confirm is refused (422) before any handler code runs", async () => {
    for (const args of [{ csv: CSV }, { csv: CSV, confirm: false }, { csv: CSV, dryRun: false }]) {
      const r = await invokeTool("redirects.import", args, CTX, [...ADMIN_SCOPES]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(422);
    }
    expect(mocks.prisma.redirect.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("an empty csv is refused (422)", async () => {
    const r = await invokeTool("redirects.import", { csv: "", confirm: true }, CTX, [...ADMIN_SCOPES]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("enforces settings:write (403 without it), for the dry run too", async () => {
    for (const args of [{ csv: CSV, dryRun: true }, { csv: CSV, confirm: true }]) {
      const r = await invokeTool("redirects.import", args, CTX, ["settings:read"]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(403);
    }
  });

  it("confirm: true applies the import — one transaction, one audit entry, result matches the schema", async () => {
    const r = await invokeTool("redirects.import", { csv: CSV, confirm: true }, CTX, [...ADMIN_SCOPES]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toEqual({ dryRun: false, imported: 2, skipped: 0, errors: [] });
    expect(getTool("redirects.import")?.output.safeParse(r.result).success).toBe(true);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({
      actor: "apikey:test",
      tool: "redirects.import",
      args: { count: 2, dryRun: false },
      requestId: "test-redirects",
    });
  });
});
