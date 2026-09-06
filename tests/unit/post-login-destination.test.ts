import { describe, it, expect } from "vitest";
import { postLoginDestination } from "@/lib/auth/post-login";

/**
 * The already-authenticated half of the callbackUrl fix. Surfaced independently
 * by two review engines: the login page used to drop `?callbackUrl=` for a
 * visitor who already had a session, stranding them on /account — the same
 * silent drop being fixed for signed-out visitors.
 */
describe("postLoginDestination", () => {
  it("honours a trusted callbackUrl over the role default, for both roles", () => {
    const target = "/oauth/authorize?response_type=code&client_id=abc";
    expect(postLoginDestination(target, "customer")).toBe(target);
    expect(postLoginDestination(target, "admin")).toBe(target);
  });

  it("falls back to the role default when there is no callbackUrl", () => {
    expect(postLoginDestination(undefined, "admin")).toBe("/admin");
    expect(postLoginDestination(undefined, "customer")).toBe("/account");
    expect(postLoginDestination(null, undefined)).toBe("/account");
  });

  it("falls back — never redirects — for an off-origin callbackUrl", () => {
    for (const hostile of [
      "//evil.com",
      "https://evil.com/steal",
      "/\\evil.com",
      "javascript:alert(1)",
      "/\t/evil.com",
      "/\t/cartwright.invalid",
      42,
    ]) {
      expect(postLoginDestination(hostile, "customer"), String(hostile)).toBe(
        "/account",
      );
      expect(postLoginDestination(hostile, "admin"), String(hostile)).toBe(
        "/admin",
      );
    }
  });

  it("refuses an auth-page target, which would bounce forever", () => {
    // This page redirects AWAY from itself for a signed-in visitor, so honouring
    // a login/signup target would ping-pong. Both locales, both pages, and with
    // a query string attached.
    for (const looping of [
      "/account/login",
      "/da/account/login",
      "/en/account/login?callbackUrl=%2Fda%2Faccount%2Flogin",
      "/account/signup",
      "/da/account/signup",
    ]) {
      expect(postLoginDestination(looping, "customer"), looping).toBe("/account");
    }
  });

  it("does not over-reject paths that merely mention account", () => {
    expect(postLoginDestination("/da/account/orders/1/review", "customer")).toBe(
      "/da/account/orders/1/review",
    );
    expect(postLoginDestination("/account/subscriptions", "customer")).toBe(
      "/account/subscriptions",
    );
    expect(postLoginDestination("/da/account", "customer")).toBe("/da/account");
  });
});
