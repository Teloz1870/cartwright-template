import { describe, it, expect } from "vitest";
import { withBadgeAttribution } from "@/lib/attribution";

describe("withBadgeAttribution (badge viral-loop tracking)", () => {
  it("appends utm_source, utm_medium and ref derived from the shop's own URL", () => {
    const out = withBadgeAttribution(
      "https://cartwright.app",
      "builtwith",
      "https://solbrillen.dk",
    );
    const url = new URL(out);
    expect(url.origin).toBe("https://cartwright.app");
    expect(url.searchParams.get("utm_source")).toBe("cartwright-badge");
    expect(url.searchParams.get("utm_medium")).toBe("builtwith");
    expect(url.searchParams.get("ref")).toBe("solbrillen.dk");
  });

  it("preserves existing path and query on the target", () => {
    const out = withBadgeAttribution(
      "https://cartwright.app/docs?tab=ai",
      "llms",
      "https://teloz.net",
    );
    const url = new URL(out);
    expect(url.pathname).toBe("/docs");
    expect(url.searchParams.get("tab")).toBe("ai");
    expect(url.searchParams.get("utm_medium")).toBe("llms");
    expect(url.searchParams.get("ref")).toBe("teloz.net");
  });

  it("omits ref (but keeps utm params) when the site URL is unparsable", () => {
    const out = withBadgeAttribution("https://cartwright.app", "llms", "not a url");
    const url = new URL(out);
    expect(url.searchParams.get("utm_source")).toBe("cartwright-badge");
    expect(url.searchParams.get("ref")).toBeNull();
  });

  it("returns the target unchanged when the target itself is unparsable", () => {
    expect(withBadgeAttribution("not a url", "builtwith", "https://teloz.net")).toBe(
      "not a url",
    );
  });
});
