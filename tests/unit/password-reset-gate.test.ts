import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes, not the minimal tests/shims/next-server.ts:
// next-intl's middleware runs for real behind proxy.ts (rewrites, redirects).
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";

/**
 * PASSWORD-RESET-GATE — the proxy's account gate lets a signed-out visitor
 * reach both halves of a password reset.
 *
 * Measured live 2026-10-24: a signed-out GET of `/da/account/forgot-password`
 * and `/da/account/reset-password` answered 307 → `/account/login` on
 * demo.cartwright.app and solbrillen-dk-teloz1.vercel.app. The gate's public
 * list held only login and signup, so the forgot-password form and the link in
 * the reset email (`${brand.url}/account/reset-password?token=…`,
 * lib/auth/password-reset.ts) both bounced, from the day the flow shipped (#114).
 *
 * The public pages are matched as a whole segment now, so a path that merely
 * CONTAINS `/account/login` (`/account/login-history`) is gated like any other
 * account page.
 *
 * Every brand value a row depends on is set by the row (locales, defaultLocale,
 * urls), so the file passes in a scaffold whose own brand.config differs.
 */

const ORIGIN = "https://shop.example";

const ALWAYS = { locales: ["da", "en"], defaultLocale: "da", urls: { localePrefix: "always" } };
const NEVER = { locales: ["da"], defaultLocale: "da", urls: { localePrefix: "never" } };

type Session = { user: { role: string } } | null;
type Handler = (req: NextRequest) => Promise<Response> | Response;

const request = (path: string, session: Session = null) =>
  Object.assign(new NextRequest(new URL(path, ORIGIN)), { auth: session });

const strip = (value: string | null) => (value ? value.replace(ORIGIN, "") : null);

async function hit(proxy: Handler, path: string, session: Session = null) {
  const res = await proxy(request(path, session));
  return {
    status: res.status,
    location: strip(res.headers.get("location")),
    rewrite: strip(res.headers.get("x-middleware-rewrite")),
  };
}

async function loadProxy(patch: Record<string, unknown>): Promise<Handler> {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({ ...actual, brand: { ...actual.brand, ...patch } }));
  // `auth(handler)` hands the handler straight back; each request carries its own `auth`.
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  // No merchant redirects, no default-locale override: an empty Redis.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
  vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ get: async () => null }) } }));
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(
      class {
        limit = async () => ({ success: true, limit: 20, remaining: 19, reset: Date.now() + 10_000 });
      },
      { slidingWindow: () => ({}) },
    ),
  }));
  return (await import("@/proxy")).default as unknown as Handler;
}

afterEach(() => {
  for (const mod of [
    "@/brand.config",
    "next/server",
    "next-auth",
    "@/lib/auth.config",
    "@upstash/redis",
    "@upstash/ratelimit",
  ]) {
    vi.doUnmock(mod);
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

const LOGIN = "/account/login";

describe('signed out, localePrefix "always" — both reset pages open', () => {
  it("serves the forgot-password form and the reset page under each locale", async () => {
    const proxy = await loadProxy(ALWAYS);
    for (const path of [
      "/da/account/forgot-password",
      "/en/account/forgot-password",
      "/da/account/reset-password",
      "/en/account/reset-password?token=abc",
    ]) {
      expect(await hit(proxy, path), path).toEqual({ status: 200, location: null, rewrite: null });
    }
  });

  it("sends the email's own link shape to its locale, token kept — not to the login page", async () => {
    const proxy = await loadProxy(ALWAYS);
    expect(await hit(proxy, "/account/reset-password?token=abc")).toMatchObject({
      status: 307,
      location: "/da/account/reset-password?token=abc",
    });
    expect(await hit(proxy, "/account/forgot-password")).toMatchObject({
      status: 307,
      location: "/da/account/forgot-password",
    });
  });

  it("opens them with a trailing slash too", async () => {
    const proxy = await loadProxy(ALWAYS);
    for (const path of ["/da/account/forgot-password/", "/en/account/reset-password/?token=abc"]) {
      expect(await hit(proxy, path), path).toEqual({ status: 200, location: null, rewrite: null });
    }
  });

  it("opens them on a shop with urls.trailingSlash, in one hop to the slash form", async () => {
    // next-intl reads Next's trailingSlash from this variable, which its plugin
    // sets from next.config.ts at build.
    vi.stubEnv("_next_intl_trailing_slash", "true");
    const proxy = await loadProxy({ ...ALWAYS, urls: { ...ALWAYS.urls, trailingSlash: true } });
    expect(await hit(proxy, "/da/account/forgot-password")).toMatchObject({
      status: 308,
      location: "/da/account/forgot-password/",
    });
    expect(await hit(proxy, "/da/account/reset-password/?token=abc")).toMatchObject({
      status: 200,
      location: null,
    });
  });

  it("still gates every other account page", async () => {
    const proxy = await loadProxy(ALWAYS);
    for (const path of [
      "/account",
      "/da/account",
      "/account/orders",
      "/da/account/orders",
      "/en/account/settings",
      "/da/account/wishlist",
    ]) {
      expect(await hit(proxy, path), path).toMatchObject({ status: 307, location: LOGIN });
    }
  });

  it("gates a path that only CONTAINS a public page's name — the match is a whole segment", async () => {
    const proxy = await loadProxy(ALWAYS);
    for (const path of [
      "/account/login-history",
      "/da/account/login-history",
      "/da/account/signup-bonus",
      "/da/account/forgot-password-x",
      "/da/account/reset-password/extra",
      "/da/account/loginfoo",
    ]) {
      expect(await hit(proxy, path), path).toMatchObject({ status: 307, location: LOGIN });
    }
  });

  it("opens a public page only at the root or under a CONFIGURED locale, spelled exactly", async () => {
    const proxy = await loadProxy(ALWAYS);
    for (const path of [
      "/da/account/Login", // the page names are lower-case
      "/da/account/Forgot-Password",
    ]) {
      expect(await hit(proxy, path), path).toMatchObject({ status: 307, location: LOGIN });
    }
    // PROXY-SEGMENT-BOUNDARIES: `/account` anywhere else is not the account
    // section at all, so the gate lets it pass and next-intl hands it to the
    // storefront, where the catch-all 404 answers (`app/[locale]/[...missing]`)
    // — never an account page, which lives only at `app/[locale]/account/`.
    for (const path of [
      "/fr/account/reset-password", // a two-letter prefix that is not one of brand.locales
      "/x/account/login", // any other single segment in front
      "/da/x/account/login", // a page name further down the path
      "/x/account/loginfoo",
    ]) {
      const res = await hit(proxy, path);
      expect(res.location, path).not.toBe(LOGIN);
      expect(res.location ?? path, path).not.toMatch(/^\/(?:da|en)\/account(?:\/|$)/);
    }
  });

  it("keeps login and signup open, as before", async () => {
    const proxy = await loadProxy(ALWAYS);
    for (const path of ["/da/account/login", "/en/account/signup", "/da/account/login/"]) {
      expect(await hit(proxy, path), path).toEqual({ status: 200, location: null, rewrite: null });
    }
  });
});

describe('signed out, localePrefix "never" — both reset pages open', () => {
  it("serves them without the locale", async () => {
    const proxy = await loadProxy(NEVER);
    expect(await hit(proxy, "/account/forgot-password")).toEqual({
      status: 200,
      location: null,
      rewrite: "/da/account/forgot-password",
    });
    expect(await hit(proxy, "/account/reset-password?token=abc")).toMatchObject({
      status: 200,
      location: null,
    });
    expect(await hit(proxy, "/account/reset-password/")).toMatchObject({ status: 200, location: null });
  });

  it("sends a prefixed address to its unprefixed form, not to the login page", async () => {
    const proxy = await loadProxy(NEVER);
    expect(await hit(proxy, "/da/account/reset-password?token=abc")).toMatchObject({
      status: 308,
      location: "/account/reset-password?token=abc",
    });
  });

  it("still gates the rest of /account, a path only containing \"login\" included", async () => {
    const proxy = await loadProxy(NEVER);
    for (const path of ["/account/orders", "/account/settings", "/account/login-history"]) {
      expect(await hit(proxy, path), path).toMatchObject({ status: 307, location: LOGIN });
    }
  });
});

describe("signed in — nothing changes", () => {
  it("serves the reset pages and the account pages, and still sends an admin from /account to /admin", async () => {
    const proxy = await loadProxy(ALWAYS);
    const customer = { user: { role: "customer" } };
    for (const path of ["/da/account/forgot-password", "/da/account/reset-password?token=abc", "/da/account/orders"]) {
      expect(await hit(proxy, path, customer), path).toEqual({ status: 200, location: null, rewrite: null });
    }
    expect(await hit(proxy, "/da/account", { user: { role: "admin" } })).toMatchObject({
      status: 307,
      location: "/admin",
    });
  });
});
