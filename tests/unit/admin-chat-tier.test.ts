import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_TOOL_ALLOWLIST } from "@/lib/ai/admin-tools";
import { ANTHROPIC_MODEL_OPTIONS } from "@/lib/ai/anthropic-models";
import { isKnownModel, unknownModelNotice } from "@/lib/ai/model-capabilities";
import type { AiSettings } from "@/lib/ai/settings";
import { _resetPendingConfirmations, createPendingConfirmation } from "@/lib/confirmation-tokens";
import { getTool } from "@/lib/tools/registry";
import { CHAT_MODEL } from "@/lib/ai/client";
import { createAdminToolExecutor } from "@/lib/ai/admin-chat-executor";
// Module-level so the registry (every tool module) loads at collection, not inside a 5 s test.
import { POST } from "@/app/api/admin/chat/route";

/**
 * ADMIN-TIER-ENFORCE — the operator chat applies the model's capability tier
 * (lib/ai/model-capabilities.ts). It used to hand every model the whole
 * ADMIN_TOOL_ALLOWLIST, so a small local model or an id the engine does not
 * know was offered products.delete and every other write, and the form's
 * "tools run read-only" was not true.
 *
 * The route is driven for real down to the model resolution: the AI settings
 * are stubbed, `chatModelResolved` and the tier table are the engine's own,
 * and streamText hands back the tool table the model would have seen.
 */

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  invokeTool: vi.fn(),
  auditCreate: vi.fn(),
  settings: { current: null as unknown },
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
vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  getAnthropicApiKey: async () => "sk-test",
}));
vi.mock("@/lib/tools/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools/registry")>()),
  invokeTool: mocks.invokeTool,
}));
// The real module beneath: the client wraps models in middleware
// (wrapLanguageModel) the test has no reason to stub.
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mocks.streamText,
  tool: (def: unknown) => def,
  stepCountIs: () => undefined,
  convertToModelMessages: async (m: unknown) => m,
}));

function settings(provider: "anthropic" | "local", model: string): AiSettings {
  return {
    provider,
    anthropicModel: provider === "anthropic" ? model : CHAT_MODEL,
    anthropicApiKey: "sk-test",
    localAiEndpoint: "http://localhost:11434/v1",
    localAiModel: provider === "local" ? model : null,
    localAiFallbackMode: "off",
    lastDegradedAt: null,
    anthropicConfigured: true,
    localConfigured: provider === "local",
  };
}

type Executable = { execute: (args: unknown) => Promise<Record<string, unknown>> };

async function toolTable(
  provider: "anthropic" | "local",
  model: string,
  body: Record<string, unknown> = {},
): Promise<Record<string, Executable>> {
  mocks.settings.current = settings(provider, model);
  const req = new Request("http://localhost/api/admin/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [], ...body }),
  });
  const res = await POST(req as never);
  expect(res.status).toBe(200);
  return mocks.streamText.mock.calls.at(-1)?.[0].tools;
}

/** The API names the model sees for these registry names — only those the registry has, as the route does. */
const apiNames = (names: readonly string[]) =>
  names.filter((n) => getTool(n)).map((n) => n.replace(/\./g, "_")).sort();

const READ_ONLY = [
  "products.search",
  "products.get",
  "categories.list",
  "pages.list",
  "orders.list",
  "orders.get",
  "discounts.list",
  "analytics.summary",
  "audit.list",
  "settings.get",
];
const LOW_RISK_WRITES = [
  ...READ_ONLY,
  "categories.upsert",
  "pages.upsert",
  "discounts.toggle",
  "images.search_unsplash",
  "products.attach_image",
  "docs.import",
];
/** What every model was offered before the tier was applied: each allowlisted tool the registry has. */
const TODAY = apiNames(ADMIN_TOOL_ALLOWLIST);

beforeEach(() => {
  _resetPendingConfirmations();
  mocks.auditCreate.mockReset();
  mocks.invokeTool.mockReset().mockResolvedValue({ ok: true, result: { done: true } });
  mocks.streamText.mockReset().mockImplementation(() => ({
    toUIMessageStreamResponse: () => new Response(null, { status: 200 }),
  }));
});

describe("the operator chat offers a model only its capability tier's tools", () => {
  const dropdown = [...new Set([...ANTHROPIC_MODEL_OPTIONS.map((o) => o.value), CHAT_MODEL])];

  it.each(dropdown)("%s (an Anthropic dropdown model) is offered exactly the table it got before", async (id) => {
    expect(Object.keys(await toolTable("anthropic", id)).sort()).toEqual(TODAY);
  });

  // Ids no longer in the dropdown that keep a capability row: the dropdown's
  // earlier Sonnet/Opus 4.5, and Sonnet 4.6 / Opus 4.7 (the action saves any id).
  it.each(["claude-sonnet-4-5", "claude-opus-4-5", "claude-sonnet-4-6", "claude-opus-4-7"])(
    "%s (an older saved Anthropic id) keeps the all tier and exactly the table it got before",
    async (id) => {
      expect(dropdown).not.toContain(id);
      expect(isKnownModel(id)).toBe(true);
      expect(Object.keys(await toolTable("anthropic", id)).sort()).toEqual(TODAY);
    },
  );

  it("a read-only model (gemma4:e2b) gets the ten read tools and nothing that writes", async () => {
    const offered = Object.keys(await toolTable("local", "gemma4:e2b")).sort();
    expect(offered).toEqual(apiNames(READ_ONLY));
    expect(offered).not.toContain("products_delete");
  });

  it("a low-risk-writes model (gemma4:e4b) gets the reads plus six additive or confirm-gated writes", async () => {
    const offered = Object.keys(await toolTable("local", "gemma4:e4b")).sort();
    expect(offered).toEqual(apiNames(LOW_RISK_WRITES));
    for (const destructive of ["products_delete", "categories_delete", "pages_delete", "audit_revert", "mockup_set"]) {
      expect(offered).not.toContain(destructive);
    }
  });

  it.each([
    ["local", "mystery-model:3b"],
    ["anthropic", "claude-future-9"],
  ] as const)("an unknown %s model id (%s) gets the unknown tier — read-only, as its notice says", async (provider, id) => {
    expect(isKnownModel(id)).toBe(false);
    expect(unknownModelNotice(id)).toMatch(/tools run read-only/);
    expect(Object.keys(await toolTable(provider, id)).sort()).toEqual(apiNames(READ_ONLY));
  });
});

describe("a write inside the tier still needs the plan-first token", () => {
  const page = { slug: "om-os", title: "Om os", body: "Hej" };

  it("pages.upsert on a low-risk-writes model returns the plan card, and runs only with the token", async () => {
    const first = await (await toolTable("local", "gemma4:e4b")).pages_upsert.execute({ ...page, confirm: true });
    expect(first).toMatchObject({ requiresConfirmation: true, tool: "pages.upsert" });
    expect(mocks.invokeTool).not.toHaveBeenCalled();

    const token = first.confirmationToken as string;
    const tools = await toolTable("local", "gemma4:e4b", { confirmations: { "pages.upsert": token } });
    expect(await tools.pages_upsert.execute(page)).toEqual({ done: true });
    expect(mocks.invokeTool).toHaveBeenCalledTimes(1);
    expect(mocks.invokeTool.mock.calls[0].slice(0, 2)).toEqual(["pages.upsert", { ...page, confirm: true }]);
  });

  it("a read on a read-only model runs directly", async () => {
    const tools = await toolTable("local", "gemma4:e2b");
    expect(await tools.products_search.execute({ query: "kaffe" })).toEqual({ done: true });
    expect(mocks.invokeTool).toHaveBeenCalledTimes(1);
  });
});

describe("the executor refuses a tool name outside the tier", () => {
  const executor = () =>
    createAdminToolExecutor({
      offered: READ_ONLY,
      tier: "read-only",
      adminUserId: "admin-1",
      ip: null,
      userAgent: null,
    });

  it("every allowlisted tool beyond read-only is refused with a clear error, and its handler never runs", async () => {
    const outside = ADMIN_TOOL_ALLOWLIST.filter((n) => !READ_ONLY.includes(n));
    expect(outside).toContain("products.delete");
    for (const name of outside) {
      const r = (await executor()(name, { slug: "x" })) as Record<string, unknown>;
      expect(r.error).toBe(
        `${name} is not available to this model: its capability tier is read-only. Pick a model with a larger tier in /admin/integrations to use it.`,
      );
      expect(r).not.toHaveProperty("requiresConfirmation");
      expect(r).not.toHaveProperty("confirmationToken");
    }
    expect(mocks.invokeTool).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledTimes(outside.length);
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      actor: "operator-chat:admin-1",
      ok: false,
      errorMsg: "Tool is outside the model's capability tier (read-only)",
    });
  });

  it("a valid confirmation token for the call does not get it past the tier", async () => {
    const args = { slug: "x" };
    const token = createPendingConfirmation({ tool: "products.delete", toolArgs: args, ownerId: "admin-1" });
    const run = createAdminToolExecutor({
      offered: READ_ONLY,
      tier: "read-only",
      adminUserId: "admin-1",
      confirmations: { "products.delete": token },
      ip: null,
      userAgent: null,
    });
    expect(await run("products.delete", args)).toMatchObject({ error: /capability tier is read-only/ });
    expect(mocks.invokeTool).not.toHaveBeenCalled();
  });

  it("the tier is checked before suggest mode: an out-of-tier write in suggest mode is the tier refusal, on the record", async () => {
    const run = createAdminToolExecutor({
      offered: READ_ONLY,
      tier: "read-only",
      adminUserId: "admin-1",
      suggestMode: true,
      ip: null,
      userAgent: null,
    });
    expect(await run("products.delete", { slug: "x" })).toEqual({
      error:
        "products.delete is not available to this model: its capability tier is read-only. Pick a model with a larger tier in /admin/integrations to use it.",
    });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.invokeTool).not.toHaveBeenCalled();
  });

  it("a tool inside the tier runs", async () => {
    expect(await executor()("products.search", { query: "kaffe" })).toEqual({ done: true });
    expect(mocks.invokeTool).toHaveBeenCalledTimes(1);
  });
});

/**
 * A call the AI SDK could not match to the offered table (NoSuchToolError) never
 * reaches the executor; the route's repairToolCall hands it to
 * refuseUnofferedCall. tests/unit/admin-chat-tier-stream.test.ts drives that
 * through the real SDK; this pins which names it refuses.
 */
describe("refuseUnofferedCall — the refusal for a tool the model was not offered", () => {
  const refuse = () =>
    createAdminToolExecutor({
      offered: READ_ONLY,
      tier: "read-only",
      adminUserId: "admin-1",
      ip: null,
      userAgent: null,
    }).refuseUnofferedCall;

  it.each(["products_delete", "products.delete"])(
    "an allowlisted tool outside the tier (%s) gets one audit row with its registry name and the tier error",
    async (called) => {
      expect(await refuse()(called, JSON.stringify({ slug: "x" }))).toBe(
        "products.delete is not available to this model: its capability tier is read-only. Pick a model with a larger tier in /admin/integrations to use it.",
      );
      expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
      expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
        tool: "products.delete",
        argsJson: JSON.stringify({ slug: "x" }),
        ok: false,
        errorMsg: "Tool is outside the model's capability tier (read-only)",
      });
      expect(mocks.invokeTool).not.toHaveBeenCalled();
    },
  );

  it("input that is not JSON is recorded as the raw text", async () => {
    await refuse()("orders_update_status", "{not json");
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      tool: "orders.update_status",
      argsJson: JSON.stringify("{not json"),
    });
  });

  it.each(["products_search", "cart_add", "users_delete", "nonsense"])(
    "%s (offered, or no admin tool) is left to the SDK's own error: null, no row, nothing runs",
    async (called) => {
      expect(await refuse()(called, "{}")).toBeNull();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
      expect(mocks.invokeTool).not.toHaveBeenCalled();
    },
  );
});
