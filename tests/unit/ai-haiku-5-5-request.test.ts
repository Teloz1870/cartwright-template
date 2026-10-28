import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { generateObject, generateText, stepCountIs, streamText, tool } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * TREND37-a — Claude Haiku 5.5 (`claude-haiku-5-5`) is selectable in
 * /admin/integrations → AI. Anthropic's release notes (2026-10-07): on this
 * model `temperature`, `top_p`, `top_k`, manual extended thinking
 * (`budget_tokens`) and an assistant-message prefill can each return a 400.
 *
 * This file pins the request body the engine actually sends when a shop picks
 * it — through chatModelResolved(), the path every AI route uses — in the
 * three call shapes the routes use: generateText (health check, support
 * triage, annotate), generateObject (SEO, translate, theme, sections) and a
 * streamText tool loop over a chat history (admin + storefront chat). It also
 * checks that no file that resolves the engine's chat model passes a sampling
 * or thinking-budget setting in its source.
 */

const settings = vi.hoisted(() => ({ getAiSettings: vi.fn() }));
vi.mock("@/lib/ai/settings", () => settings);

import { chatModelResolved } from "@/lib/ai/client";

const MODEL = "claude-haiku-5-5";
type Body = Record<string, unknown> & {
  model?: string;
  thinking?: { type?: string; budget_tokens?: number };
  messages?: Array<{ role: string }>;
};
const bodies: Body[] = [];

/** One Anthropic Messages answer whose text is `text`. */
const message = (text: string) =>
  new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: MODEL,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

function resolveWith(anthropicModel: string) {
  settings.getAiSettings.mockResolvedValue({
    provider: "anthropic",
    anthropicModel,
    anthropicApiKey: "sk-ant-test",
    localAiEndpoint: null,
    localAiModel: null,
    localAiFallbackMode: "off",
    lastDegradedAt: null,
    anthropicConfigured: true,
    localConfigured: false,
  });
  return chatModelResolved("chat");
}

/** What Haiku 5.5 answers with a 400 — none of it may be on the wire. */
function expectAcceptedByHaiku55(body: Body) {
  expect(body.model).toBe(MODEL);
  for (const key of ["temperature", "top_p", "top_k"]) {
    expect(body, `${key} is on the wire`).not.toHaveProperty(key);
  }
  expect(body.thinking?.budget_tokens, "a thinking budget is on the wire").toBeUndefined();
  expect(body.thinking?.type, "manual extended thinking is on the wire").not.toBe("enabled");
  // A prefill is an assistant message at the END of the history.
  expect(body.messages?.at(-1)?.role, "the request ends on an assistant prefill").toBe("user");
}

beforeEach(() => {
  bodies.length = 0;
  vi.stubEnv("CLOUDFLARE_AI_GATEWAY_URL", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Body;
      bodies.push(body);
      if (body.stream) {
        // The tool loop only needs its first request recorded.
        return new Response(
          JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "test" } }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      return message(body.output_config || body.output_format ? '{"title":"Kaffe"}' : "ok");
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the request the engine sends for claude-haiku-5-5", () => {
  it("generateText (the health-check shape) carries nothing Haiku 5.5 rejects", async () => {
    const resolved = await resolveWith(MODEL);
    expect(resolved.model).toBe(MODEL);
    expect(resolved.capabilities.tools).toBe("all");
    const out = await generateText({ model: resolved.handle, system: "Be brief.", prompt: "ok" });
    expect(out.text).toBe("ok");
    expect(bodies).toHaveLength(1);
    expectAcceptedByHaiku55(bodies[0]);
  });

  it("generateObject (the SEO / translate shape) carries nothing Haiku 5.5 rejects", async () => {
    const resolved = await resolveWith(MODEL);
    const { object } = await generateObject({
      model: resolved.handle,
      schema: z.object({ title: z.string() }),
      prompt: "Write a title.",
    });
    expect(object).toEqual({ title: "Kaffe" });
    expect(bodies).toHaveLength(1);
    expectAcceptedByHaiku55(bodies[0]);
  });

  it("a streamText tool loop over a chat history (the chat-route shape) carries nothing Haiku 5.5 rejects", async () => {
    const resolved = await resolveWith(MODEL);
    const result = streamText({
      model: resolved.handle,
      system: "You are the shop's assistant.",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello — what are you looking for?" },
        { role: "user", content: "Coffee beans" },
      ],
      tools: {
        "products.search": tool({
          description: "Search products",
          inputSchema: z.object({ q: z.string() }),
          execute: async () => [],
        }),
      },
      stopWhen: stepCountIs(20),
      onError() {},
    });
    await result.consumeStream();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].stream).toBe(true);
    expectAcceptedByHaiku55(bodies[0]);
    expect(bodies[0].tools).toBeDefined();
  });
});

describe("files that resolve the engine's chat model", () => {
  const ROOT = process.cwd();
  const SKIP = new Set(["node_modules", ".next", "generated", ".git"]);

  function walk(dir: string, out: string[] = []): string[] {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return out; // a pruned scaffold may not have the folder
    }
    for (const name of names) {
      if (SKIP.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.tsx?$/.test(name)) out.push(path);
    }
    return out;
  }

  const callers = ["lib", "app", "plugins"]
    .flatMap((d) => walk(join(ROOT, d)))
    .filter((f) => /\bchatModel(Resolved)?\(/.test(readFileSync(f, "utf8")));

  it("finds the AI routes (the scan is not empty)", () => {
    expect(callers.length).toBeGreaterThan(0);
  });

  it.each(callers.map((f) => relative(ROOT, f)))(
    "%s passes no temperature, topP, topK or thinking budget",
    (file) => {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/\b(temperature|topP|topK|budgetTokens|budget_tokens)\s*:/);
    },
  );
});
