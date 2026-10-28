import { describe, it, expect } from "vitest";
import { brand } from "@/brand.config";
import { postLoginDestination } from "@/lib/auth/post-login";

// A configured locale, read from brand.config so the file passes in a scaffold
// whose locales are ["en"] as well as on the engine's ["da", "en"].
const L = brand.locales[0];

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
      `/${L}/account/login`,
      `/${L}/account/login?callbackUrl=%2Fda%2Faccount%2Flogin`,
      "/account/signup",
      `/${L}/account/signup`,
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

  // POST-LOGIN-INCLUDES: the auth-page test reads whole path segments, in the
  // shape of proxy.ts's PUBLIC_AUTH_PAGE_RE, instead of a substring.
  it("refuses the auth pages however the path is dressed", () => {
    for (const looping of [
      "/account/login?x=1",
      `/${L}/account/login?x=1`,
      "/account/login/",
      `/${L}/account/login/`,
      `/${L}/account/signup/?x=1`,
      `/${L}/account/login#top`,
      // safeCallbackPath resolves dot segments, so this IS the login page.
      `/${L}/blog/../account/login`,
      // A percent-escape cannot spell the page past the test.
      `/${L}/account/%6Cogin`,
      // Repeated trailing or inner slashes survive parsing (review R1).
      `/${L}/account/login//`,
      `/${L}/account/login//?callbackUrl=%2Fx`,
      `/${L}//account///signup`,
      // An escaped slash decodes to a dot segment the parser never saw (R1).
      `/${L}/blog/..%2Faccount/login`,
      `/${L}/account/login/..%2Flogin`,
      // Legacy Danish slugs the proxy 301s to the login and signup pages.
      "/konto/login",
      `/${L}/konto/login`,
      `/${L}/konto/opret/`,
      // next-intl matches the locale prefix case-insensitively and redirects
      // to the configured spelling, so these land on the auth page too (R2).
      `/${L.toUpperCase()}/account/login`,
      `/${L[0].toUpperCase()}${L.slice(1)}/account/signup?x=1`,
    ]) {
      expect(postLoginDestination(looping, "customer"), looping).toBe("/account");
      expect(postLoginDestination(looping, "admin"), looping).toBe("/admin");
    }
  });

  it("honours paths that only mention account/login, which a substring misread", () => {
    for (const target of [
      "/account/login-tips",
      `/${L}/account/login-tips`,
      `/${L}/account/login2`,
      `/${L}/account/signups`,
      "/blog/account/login",
      `/${L}/blog/account/login-tips`,
      `/${L}/x/account/login`,
      // An unconfigured first segment is not a locale prefix.
      "/x/account/login",
      `/${L}/account/login/history`,
      `/${L}/konto/login-hjaelp`,
      // Only the locale is case-folded: route segments are case-sensitive.
      `/${L}/ACCOUNT/login`,
      `/${L.toUpperCase()}/account/Login`,
    ]) {
      expect(postLoginDestination(target, "customer"), target).toBe(target);
    }
  });

  it("keeps an undecodable escape as a destination instead of throwing", () => {
    expect(postLoginDestination(`/${L}/account/%E0%A4%A`, "customer")).toBe(
      `/${L}/account/%E0%A4%A`,
    );
  });

  it("still falls back for an absolute URL, even one naming the login page", () => {
    // safeCallbackPath accepts relative paths only; an absolute URL never
    // reaches the auth-page test.
    expect(
      postLoginDestination(`https://cartwright.invalid/${L}/account/login-tips`, "customer"),
    ).toBe("/account");
  });
});
