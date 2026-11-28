import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simulateReadableStream, streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PUBLIC_UI_STREAM } from "@/lib/ai/ui-stream";

/**
 * The storefront chat's UI stream must not hand a shopper a failed tool's error text.
 * `ai` 7.0.171 made the client receive the model's error text by default; the public
 * chat restores the earlier redaction with PUBLIC_UI_STREAM. Driven through the
 * installed SDK, with only the model mocked.
 */
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const SECRET = "SQLITE_BUSY: database is locked at /var/data/shop.db";

async function uiStreamText(options?: Parameters<ReturnType<typeof streamText>["toUIMessageStreamResponse"]>[0]): Promise<string> {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ],
      }),
    }),
  });
  const result = streamText({
    model,
    prompt: "order status",
    tools: { lookup: tool({ inputSchema: z.object({}), execute: async (): Promise<string> => { throw new Error(SECRET); } }) },
  });
  return await result.toUIMessageStreamResponse(options).text();
}

describe("PUBLIC_UI_STREAM", () => {
  it("keeps a failed tool's error text out of the stream a shopper reads", async () => {
    const body = await uiStreamText(PUBLIC_UI_STREAM);
    expect(body).toContain("tool-output-error");
    expect(body).not.toContain("SQLITE_BUSY");
  });

  it("is needed: without it this SDK sends the error text through", async () => {
    expect(await uiStreamText()).toContain("SQLITE_BUSY");
  });

  it("is what the storefront chat route passes", () => {
    const src = readFileSync(join(__dirname, "..", "..", "app", "api", "assistant", "chat", "route.ts"), "utf8");
    expect(src).toContain("toUIMessageStreamResponse(PUBLIC_UI_STREAM)");
    expect(src).not.toMatch(/toUIMessageStreamResponse\(\s*\)/);
  });
});
