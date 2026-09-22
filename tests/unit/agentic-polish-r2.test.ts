import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { withLenientMcpAccept } from "@/lib/mcp/accept";

/**
 * Round 2 of the honest-ergonomics program. Pinned here:
 *
 *  1. The MCP Accept leniency widens exactly the JSON-implying shapes to the
 *     canonical pair — and nothing else. A client that asks for text/html
 *     still meets the transport's own 406.
 *  2. /{locale}/llms.txt serves the locale-scoped agent guide and 404s any
 *     locale the brand doesn't run — never inventing a language.
 */

const mocks = vi.hoisted(() => ({
  brand: {
    locales: ["da", "en"],
    defaultLocale: "en",
  },
  llmsGet: vi.fn(async (request: NextRequest) => {
    const locale = request.nextUrl.searchParams.get("locale");
    return new Response(`# doc for ${locale}`, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }),
}));

vi.mock("@/lib/brand", () => ({ getBrand: async () => mocks.brand }));
vi.mock("@/app/llms.txt/route", () => ({ GET: mocks.llmsGet }));

describe("withLenientMcpAccept", () => {
  const post = (accept?: string) =>
    new Request("https://shop.example/api/mcp", {
      method: "POST",
      headers: accept === undefined ? {} : { accept },
      body: "{}",
    });

  it.each([
    ["application/json", true],
    ["*/*", true],
    ["application/*", true],
    [undefined, true],
    ["application/json;q=0.9, text/plain", true],
  ] as const)("widens %s to the canonical pair", (accept, _widened) => {
    const result = withLenientMcpAccept(post(accept));
    expect(result.headers.get("accept")).toBe("application/json, text/event-stream");
  });

  it("leaves a spec-complete client untouched", () => {
    const request = post("application/json, text/event-stream");
    expect(withLenientMcpAccept(request)).toBe(request);
  });

  it("does not rescue a client that asked for something else entirely", () => {
    const request = post("text/html");
    expect(withLenientMcpAccept(request)).toBe(request);
  });

  it("never touches GET — the SSE stream negotiation stays strict", () => {
    const request = new Request("https://shop.example/api/mcp", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(withLenientMcpAccept(request)).toBe(request);
  });
});

describe("/{locale}/llms.txt — the section-level index", () => {
  const call = async (locale: string) => {
    const route = await import("@/app/[locale]/llms.txt/route");
    return route.GET(new NextRequest(`https://shop.example/${locale}/llms.txt`), {
      params: Promise.resolve({ locale }),
    });
  };

  it("serves the guide scoped to a real locale", async () => {
    const response = await call("da");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("# doc for da");
  });

  it("404s a locale the brand does not run", async () => {
    const response = await call("de");
    expect(response.status).toBe(404);
    expect(mocks.llmsGet).toHaveBeenCalledTimes(1); // only the 'da' call above
  });
});
