import { beforeEach, describe, expect, it, vi } from "vitest";
import { needsConfirmation } from "@/lib/ai/admin-tools";
import { _resetPendingConfirmations } from "@/lib/confirmation-tokens";
// Module-level so the registry (every tool module) loads at collection, not inside a 5 s test.
import { POST } from "@/app/api/admin/chat/route";

/**
 * The operator chat's plan-first gate (app/api/admin/chat/route.ts) is
 * args-aware: a confirm-gated tool stops for the plan card, EXCEPT a call
 * shape that is a read (READ_ONLY_WHEN). `redirects.import` with
 * `dryRun: true` writes nothing — the lib test "dry run returns the plan and
 * writes nothing" proves that — so from chat it must run directly and return
 * the plan, not a card that hides the preview the owner asked for.
 *
 * The route is driven for real: POST builds the AI tool table, streamText is
 * stubbed to hand that table back, and each tool's `execute` is the gate.
 */

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  invokeTool: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  requireAdminApi: async () => ({ user: { id: "admin-1", role: "admin" } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  adminChatRateLimiter: { check: () => ({ allowed: true }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: vi.fn() } } }));
vi.mock("@/lib/ai/usage", () => ({ recordAiUsage: vi.fn() }));
// The allowlist + gate stay real (pure data); only the AI stack is stubbed.
vi.mock("@/lib/ai/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/ai/admin-tools")>("@/lib/ai/admin-tools")),
  ADMIN_MAX_TOOL_CALLS_PER_SESSION: 50,
  getAnthropicApiKey: async () => "sk-test",
  chatModelResolved: async () => ({ provider: "anthropic", model: "test", handle: {} }),
}));
vi.mock("@/lib/tools/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools/registry")>()),
  invokeTool: mocks.invokeTool,
}));
vi.mock("ai", () => ({
  streamText: mocks.streamText,
  tool: (def: unknown) => def,
  stepCountIs: () => undefined,
  convertToModelMessages: async (m: unknown) => m,
}));

const CSV = "from,to,status\n/old,/new\n/sale,/campaign,302\n";
const PLAN = { dryRun: true, valid: [], errors: [], summary: { rows: 2, valid: 2, invalid: 0, replaces: 0 } };

type Executable = { execute: (args: unknown) => Promise<Record<string, unknown>> };

async function toolTable(body: Record<string, unknown> = {}): Promise<Record<string, Executable>> {
  const req = new Request("http://localhost/api/admin/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [], ...body }),
  });
  const res = await POST(req as never);
  expect(res.status).toBe(200);
  return mocks.streamText.mock.calls.at(-1)?.[0].tools;
}

beforeEach(() => {
  _resetPendingConfirmations();
  mocks.invokeTool.mockReset().mockResolvedValue({ ok: true, result: PLAN });
  mocks.streamText.mockReset().mockImplementation(() => ({
    toUIMessageStreamResponse: () => new Response(null, { status: 200 }),
  }));
});

describe("needsConfirmation — the gate is per tool AND per call shape", () => {
  it("only a strict dryRun: true on redirects.import is a read", () => {
    expect(needsConfirmation("redirects.import", { csv: CSV, dryRun: true })).toBe(false);
    expect(needsConfirmation("redirects.import", { csv: CSV })).toBe(true);
    expect(needsConfirmation("redirects.import", { csv: CSV, dryRun: false })).toBe(true);
    expect(needsConfirmation("redirects.import", { csv: CSV, dryRun: "true" })).toBe(true);
    // Another gated tool gets no exemption from a dryRun flag it does not have.
    expect(needsConfirmation("products.delete", { slug: "x", dryRun: true })).toBe(true);
    expect(needsConfirmation("products.search", {})).toBe(false);
  });
});

describe("operator chat — redirects.import through the plan-first gate", () => {
  it("a dry run runs directly and returns the handler's plan — no confirmation card", async () => {
    const tools = await toolTable();
    const r = await tools.redirects_import.execute({ csv: CSV, dryRun: true });
    expect(r).toEqual(PLAN);
    expect(r).not.toHaveProperty("requiresConfirmation");
    expect(mocks.invokeTool).toHaveBeenCalledTimes(1);
    expect(mocks.invokeTool.mock.calls[0].slice(0, 2)).toEqual(["redirects.import", { csv: CSV, dryRun: true }]);
  });

  it("a real import (dryRun false or absent) gets the plan card and never reaches the tool", async () => {
    const tools = await toolTable();
    for (const args of [{ csv: CSV }, { csv: CSV, dryRun: false }, { csv: CSV, confirm: true }]) {
      const r = await tools.redirects_import.execute(args);
      expect(r).toMatchObject({ requiresConfirmation: true, tool: "redirects.import" });
      expect(r.args).not.toHaveProperty("confirm");
      expect(r.confirmationToken).toEqual(expect.any(String));
      expect(r.preview).toBe(
        "Import redirects from CSV (3 lines) — chains, loops and duplicates are refused; preview first with dryRun: true",
      );
    }
    expect(mocks.invokeTool).not.toHaveBeenCalled();
  });

  it("the exemption is redirects.import's alone: another gated tool keeps its card", async () => {
    const tools = await toolTable();
    const r = await tools.products_delete.execute({ slug: "x", dryRun: true });
    expect(r).toMatchObject({ requiresConfirmation: true, tool: "products.delete" });
    expect(mocks.invokeTool).not.toHaveBeenCalled();
  });

  it("suggest mode blocks the write but lets the dry run through — it is a read", async () => {
    const tools = await toolTable({ suggestMode: true });
    expect(await tools.redirects_import.execute({ csv: CSV })).toMatchObject({ error: /Suggest mode/ });
    expect(await tools.redirects_import.execute({ csv: CSV, dryRun: true })).toEqual(PLAN);
    expect(mocks.invokeTool).toHaveBeenCalledTimes(1);
  });
});
