import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { AiSettings } from "@/lib/ai/settings";
import { CHAT_MODEL } from "@/lib/ai/client";
// Module-level so the registry (every tool module) loads at collection, not inside a 5 s test.
import { POST } from "@/app/api/admin/chat/route";

/**
 * ADMIN-TIER-ENFORCE, end to end through the REAL AI SDK. A model is offered
 * only its tier's tools, so when a read-only model asks for `products_delete`
 * anyway the SDK finds no such tool (NoSuchToolError) before any `execute` —
 * the executor never sees the call. The route's `repairToolCall` hook is what
 * turns that into the promised refusal: an audit-log row, no handler call, and
 * an error the model reads that names its tier.
 *
 * streamText, tool() and the UI stream are the installed `ai` package; only the
 * model is a MockLanguageModelV4. The tier is the engine's own resolution
 * (`chatModelResolved` → MODEL_CAPABILITIES) — just its network handle is swapped.
 */

const mocks = vi.hoisted(() => ({
  invokeTool: vi.fn(),
  auditCreate: vi.fn(),
  settings: { current: null as unknown },
  model: { current: null as unknown },
}));

vi.mock("@/lib/admin", () => ({
  requireAdminApi: async () => ({ user: { id: "admin-1", role: "admin" } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  adminChatRateLimiter: { check: () => ({ allowed: true }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: mocks.auditCreate } } }));
vi.mock("@/lib/ai/usage", () => ({ recordAiUsage: vi.fn() }));
vi.mock("@/lib/ai/settings", () => ({ getAiSettings: async () => mocks.settings.current }));
vi.mock("@/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/client")>();
  return {
    ...actual,
    getAnthropicApiKey: async () => "sk-test",
    chatModelResolved: async (...args: Parameters<typeof actual.chatModelResolved>) => ({
      ...(await actual.chatModelResolved(...args)),
      handle: mocks.model.current,
    }),
  };
});
vi.mock("@/lib/tools/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools/registry")>()),
  invokeTool: mocks.invokeTool,
}));

function localSettings(model: string): AiSettings {
  return {
    provider: "local",
    anthropicModel: CHAT_MODEL,
    anthropicApiKey: "sk-test",
    localAiEndpoint: "http://localhost:11434/v1",
    localAiModel: model,
    localAiFallbackMode: "off",
    lastDegradedAt: null,
    anthropicConfigured: true,
    localConfigured: true,
  };
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** Step 1: the model calls `toolName`. Step 2: it answers in text. */
function modelCalling(toolName: string, args: Record<string, unknown>) {
  const step = (chunks: unknown[]) => ({
    stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] }),
  });
  return new MockLanguageModelV4({
    doStream: [
      step([
        { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(args) },
        { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
      ]),
      step([
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Done." },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ]),
    ] as never,
  });
}

/** Drives POST to the end of the stream; returns what the model was sent on its second step. */
async function chat(localModel: string, toolName: string, args: Record<string, unknown>) {
  mocks.settings.current = localSettings(localModel);
  const model = modelCalling(toolName, args);
  mocks.model.current = model;
  const res = await POST(
    new Request("http://localhost/api/admin/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Slet kaffe" }] }],
      }),
    }) as never,
  );
  expect(res.status).toBe(200);
  const ui = await res.text();
  expect(model.doStreamCalls).toHaveLength(2);
  return { secondPrompt: JSON.stringify(model.doStreamCalls[1].prompt), ui };
}

beforeEach(() => {
  mocks.auditCreate.mockReset().mockResolvedValue({});
  mocks.invokeTool.mockReset().mockResolvedValue({ ok: true, result: { done: true } });
});

describe("a model that asks for an admin tool outside its tier (real streamText)", () => {
  it("gemma4:e2b calling products_delete: one audit row, no handler, and the model is told its tier", async () => {
    const { secondPrompt } = await chat("gemma4:e2b", "products_delete", { slug: "kaffe" });

    expect(mocks.invokeTool).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      actor: "operator-chat:admin-1",
      tool: "products.delete",
      argsJson: JSON.stringify({ slug: "kaffe" }),
      ok: false,
      errorMsg: "Tool is outside the model's capability tier (read-only)",
    });
    expect(secondPrompt).toContain(
      "products.delete is not available to this model: its capability tier is read-only. Pick a model with a larger tier in /admin/integrations to use it.",
    );
  });

  it("a low-risk-writes model (gemma4:e4b) calling settings_update_branding is refused the same way, naming its tier", async () => {
    const { secondPrompt } = await chat("gemma4:e4b", "settings_update_branding", { storeName: "X" });

    expect(mocks.invokeTool).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      tool: "settings.update_branding",
      errorMsg: "Tool is outside the model's capability tier (low-risk-writes)",
    });
    expect(secondPrompt).toContain("its capability tier is low-risk-writes");
  });

  it("a name that is no admin tool at all keeps the SDK's own refusal: no audit row, no handler", async () => {
    const { secondPrompt } = await chat("gemma4:e2b", "cart_add", { productId: "p1" });

    expect(mocks.invokeTool).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(secondPrompt).toContain("Model tried to call unavailable tool 'cart_add'");
  });

  it("a tool inside the tier runs through the executor (control)", async () => {
    await chat("gemma4:e2b", "products_search", { q: "kaffe" });

    expect(mocks.invokeTool).toHaveBeenCalledTimes(1);
    expect(mocks.invokeTool.mock.calls[0].slice(0, 2)).toMatchObject(["products.search", { q: "kaffe" }]);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
