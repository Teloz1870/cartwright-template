import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The PAGE-level half of the callbackUrl fix — an already-authenticated visitor
 * (second tab, back button, an OAuth continuation link clicked while signed in
 * elsewhere). `post-login-destination.test.ts` covers the pure helper; this file
 * exists because that left the CALL SITE unpinned, and review proved three
 * mutants survived the whole suite: passing `undefined` instead of the query
 * value (a full revert), reading `raw[1]` instead of `raw[0]`, and replacing the
 * redirect with a bare `redirect("/account")` — which also silently reverts the
 * PRE-EXISTING admin → /admin default.
 */

const redirect = vi.fn((url: string) => {
  // Next's redirect() throws to unwind; mirror that so the page stops here.
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
const auth = vi.fn();

// Partial, not wholesale: the page now renders the locale-aware `Link`, and
// next-intl's `createNavigation` reads `redirect`/`permanentRedirect` off this
// module at import time — a mock returning only `redirect` removes
// `permanentRedirect` and the suite dies before a single test runs.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (u: string) => redirect(u),
}));
vi.mock("@/lib/auth", () => ({
  auth: () => auth(),
  isGithubAuthEnabled: false,
  isGoogleAuthEnabled: false,
}));
vi.mock("@/lib/mailer/resend", () => ({ isEmailConfigured: async () => false }));
vi.mock("@/lib/brand", () => ({ getBrand: async () => ({ features: {} }) }));
vi.mock("@/components/LoginForm", () => ({ default: () => null }));
vi.mock("@/components/surfaces/DesignSurface", () => ({ displayFont: {} }));

const { default: LoginPage } = await import("@/app/[locale]/account/login/page");

async function load(searchParams: Record<string, string | string[] | undefined>) {
  try {
    await LoginPage({ searchParams: Promise.resolve(searchParams) });
  } catch (e) {
    if ((e as Error).message !== "NEXT_REDIRECT") throw e;
  }
}

afterEach(() => {
  redirect.mockClear();
  auth.mockReset();
});

const AUTHORIZE = "/oauth/authorize?response_type=code&client_id=abc";

describe("login page, already-authenticated visitor", () => {
  it("sends a customer to the callbackUrl instead of /account", async () => {
    auth.mockResolvedValue({ user: { role: "customer" } });
    await load({ callbackUrl: AUTHORIZE });
    expect(redirect).toHaveBeenCalledWith(AUTHORIZE);
  });

  it("sends an ADMIN to the callbackUrl too — an explicit destination wins", async () => {
    auth.mockResolvedValue({ user: { role: "admin" } });
    await load({ callbackUrl: AUTHORIZE });
    expect(redirect).toHaveBeenCalledWith(AUTHORIZE);
  });

  it("reads the FIRST value of a repeated callbackUrl, not a later one", async () => {
    // ?callbackUrl=a&callbackUrl=b arrives as an array. Taking raw[1] would let
    // an attacker append a second value after a legitimate first one.
    auth.mockResolvedValue({ user: { role: "customer" } });
    await load({ callbackUrl: [AUTHORIZE, "/da/account/orders"] });
    expect(redirect).toHaveBeenCalledWith(AUTHORIZE);
  });

  it("keeps the pre-existing role defaults when there is no callbackUrl", async () => {
    auth.mockResolvedValue({ user: { role: "admin" } });
    await load({});
    expect(redirect).toHaveBeenCalledWith("/admin");

    redirect.mockClear();
    auth.mockResolvedValue({ user: { role: "customer" } });
    await load({});
    expect(redirect).toHaveBeenCalledWith("/account");
  });

  it("refuses an off-origin callbackUrl and falls back to the role default", async () => {
    auth.mockResolvedValue({ user: { role: "customer" } });
    await load({ callbackUrl: "//evil.com" });
    expect(redirect).toHaveBeenCalledWith("/account");
  });

  it("hands redirect() a header-safe value for a non-ASCII path", async () => {
    // Raw code points in a Location header are ERR_INVALID_CHAR -> 500.
    auth.mockResolvedValue({ user: { role: "customer" } });
    await load({ callbackUrl: "/da/produkter/é中" });
    expect(redirect).toHaveBeenCalledWith("/da/produkter/%C3%A9%E4%B8%AD");
  });

  it("does not redirect a signed-out visitor — the form renders", async () => {
    auth.mockResolvedValue(null);
    await load({ callbackUrl: AUTHORIZE });
    expect(redirect).not.toHaveBeenCalled();
  });
});
