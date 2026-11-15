import { describe, it, expect } from "vitest";
import { isSameOriginPath, safeCallbackPath } from "@/lib/safe-path";

/**
 * The engine's single same-origin guard. `safeCallbackPath` decides where a
 * signed-out visitor is allowed to land after login, so every branch here is a
 * security assertion: an accepted off-origin value is an open redirect on the
 * login page of every Cartwright shop.
 *
 * The "is this the same function WebMCP uses" assertion deliberately lives in
 * tests/unit/webmcp-paths.test.ts instead of here — the CLI's `--profile light`
 * deletes lib/webmcp/ AND that test file together, so an import of
 * @/lib/webmcp/paths from a CORE test would be a TS2307 on the default profile.
 */
describe("isSameOriginPath", () => {
  it("accepts internal paths, including query + fragment", () => {
    for (const p of [
      "/",
      "/produkter",
      "/produkter?q=oak",
      "/product/some-slug#reviews",
      "/da/account/orders/cm123/review",
      "/account/subscriptions",
      "/oauth/authorize?response_type=code&client_id=abc&scope=profile+orders",
    ]) {
      expect(isSameOriginPath(p), p).toBe(true);
    }
  });

  it("rejects every way of naming another origin", () => {
    for (const p of [
      "//evil.com",
      "//evil.com/path",
      "/\\evil.com",
      "/\\/evil.com",
      "https://evil.com",
      "http://evil.com/x",
      "HTTPS://evil.com",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "mailto:a@b.c",
      "produkter",
      "\\\\evil.com",
      "",
    ]) {
      expect(isSameOriginPath(p), p).toBe(false);
    }
  });

  it("rejects control-character smuggling of a protocol-relative URL", () => {
    // The vector a prefix test cannot see: the URL parser strips TAB/LF/CR
    // BEFORE parsing, so each of these starts with exactly one slash and would
    // still resolve to https://evil.com. Browsers normalise identically when
    // you assign location.href, so these are real open-redirect payloads.
    for (const p of [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\t\\evil.com",
      "/\r\n/evil.com",
    ]) {
      expect(isSameOriginPath(p), JSON.stringify(p)).toBe(false);
    }
  });

  it("refuses to be talked into the sentinel base origin", () => {
    // Surfaced by Gemini in review: parsed against the internal
    // https://cartwright.invalid base these yield origin === base, so the origin
    // comparison ALONE accepts them — and a real browser then leaves the
    // merchant's origin for a reserved TLD. Rejecting the stripped control
    // characters is what closes it; without that guard these return true.
    expect(isSameOriginPath("/\t/cartwright.invalid")).toBe(false);
    expect(isSameOriginPath("/\n/cartwright.invalid")).toBe(false);
  });

  it("rejects the PLAIN protocol-relative sentinel, not just its control-char forms", () => {
    // The gap that made the layer-1 mutant survive all 2464 tests: the sentinel
    // parse base is nameable, so `new URL("//cartwright.invalid", base).origin`
    // EQUALS base and the origin comparison waves it through. Only the `//`
    // prefix check rejects these — the battery previously covered only the
    // `/\t/cartwright.invalid` spelling and so could not see that.
    for (const p of [
      "//cartwright.invalid",
      "//cartwright.invalid/x",
      "//user@cartwright.invalid",
      "//CARTWRIGHT.INVALID",
      "/\\cartwright.invalid",
    ]) {
      expect(isSameOriginPath(p), p).toBe(false);
    }
  });

  it("rejects TAB/LF/CR even where stripping them would be harmless", () => {
    // Broader than "only the off-origin ones" on purpose: a raw stripped control
    // character in an internal path is always smuggling, and rejecting the class
    // beats chasing its members. This one would have resolved same-origin.
    expect(isSameOriginPath("/\tevil.com")).toBe(false);
    expect(isSameOriginPath("/produkter\n")).toBe(false);
  });

  it("still accepts percent-encoded and dot segments (no over-broad rejection)", () => {
    // NOT stripped by the parser, resolve same-origin, legal in a real URL —
    // pinned so the control-character guard cannot creep wider.
    expect(isSameOriginPath("/%2F%2Fevil.com")).toBe(true);
    expect(isSameOriginPath("/./evil.com")).toBe(true);
    expect(isSameOriginPath("/a%20b?q=1#frag")).toBe(true);
  });

  it("rejects non-strings rather than coercing them", () => {
    for (const v of [undefined, null, 42, {}, [], ["/ok"], true, () => "/ok"]) {
      expect(isSameOriginPath(v), String(v)).toBe(false);
    }
  });
});

describe("safeCallbackPath", () => {
  it("passes an accepted path through unchanged", () => {
    expect(safeCallbackPath("/oauth/authorize?client_id=a&scope=b+c")).toBe(
      "/oauth/authorize?client_id=a&scope=b+c",
    );
    expect(safeCallbackPath("/da/account/orders/1/review")).toBe(
      "/da/account/orders/1/review",
    );
  });

  it("returns a HEADER-SAFE serialisation, not the decoded input", () => {
    // Next decodes the query before we see it, so `%00` arrives as a raw NUL and
    // a non-ASCII slug arrives as raw code points. Handed to redirect() those
    // land in a Location header, where Node throws ERR_INVALID_CHAR -> 500.
    // Re-serialising through the parser percent-encodes exactly what a header
    // cannot carry. This bites legitimate non-ASCII paths too, not just attacks.
    expect(safeCallbackPath("/\u0000foo")).toBe("/%00foo");
    expect(safeCallbackPath("/\u00e9\u4e2d")).toBe("/%C3%A9%E4%B8%AD");
    expect(safeCallbackPath("/caf\u00e9")).toBe("/caf%C3%A9");
  });

  it("leaves an already-safe path byte-identical", () => {
    // The serialisation must not churn ordinary paths — query and fragment
    // included, `+` in a query preserved.
    for (const p of [
      "/account",
      "/da/account/orders/cm123/review",
      "/oauth/authorize?response_type=code&client_id=abc&scope=profile+orders",
      "/a%20b?q=1#frag",
    ]) {
      expect(safeCallbackPath(p), p).toBe(p);
    }
  });

  it("returns undefined — never a rewritten URL — for anything it rejects", () => {
    // undefined (not a default) is what lets each call site keep its own
    // historical destination via `?? "/account"`.
    for (const v of [
      "//evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/\t/evil.com",
      "",
      null,
      undefined,
      7,
    ]) {
      expect(safeCallbackPath(v), JSON.stringify(v)).toBeUndefined();
    }
  });
});
