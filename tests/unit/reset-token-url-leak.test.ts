import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RESET-TOKEN-URL-LEAK — the password-reset token never sits in the address
 * bar while the reset page runs. GA4's `gtag('config')` sends `location.href`
 * to Google (Consent Mode's cookieless ping too), and so can any other script.
 *
 * The page answers `?token=` with a server-side redirect to
 * `/api/account/reset-password`, which moves the token into an httpOnly cookie
 * scoped to the reset page and sends the browser back with no query; the
 * server action reads the token from that cookie. Cookies, redirect and the
 * token check are mocked; the URL helpers and the locale routing are real.
 *
 * Every brand value a row depends on is set by the row, so the file passes in
 * a scaffold whose own brand.config differs (an en-only scaffold, for one).
 */

const ORIGIN = "https://shop.example";
const TOKEN = "q3J9xV0bR2mWfLkT8sYdP4nHcE6uA1zG5oIjN7wQeXs";
const COOKIE = "cw_reset_token";

const ALWAYS = { locales: ["da", "en"], defaultLocale: "da", urls: { localePrefix: "always" } };
const NEVER_SLASHED = {
  locales: ["da"],
  defaultLocale: "da",
  urls: { localePrefix: "never", trailingSlash: true },
};

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: vi.fn(),
  del: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.jar.has(name) ? { name, value: mocks.jar.get(name) } : undefined,
    set: mocks.set,
    delete: mocks.del,
  }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  redirect: (to: string) => {
    throw { redirectTo: to };
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "da",
}));
vi.mock("@/lib/auth/password-reset", () => ({
  consumePasswordResetToken: mocks.consume,
}));
vi.mock("@/lib/brand", () => ({ getBrand: async () => ({ features: {} }) }));
vi.mock("@/components/surfaces/DesignSurface", () => ({ displayFont: {} }));

async function withBrand(patch: Record<string, unknown>) {
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({ ...actual, brand: { ...actual.brand, ...patch } }));
}

const loadRoute = () => import("@/app/api/account/reset-password/route");
const loadPage = () => import("@/app/[locale]/account/reset-password/page");
const loadAction = () => import("@/app/[locale]/account/reset-password/actions");

async function renderPage(searchParams: Record<string, string | string[]>) {
  const { default: Page } = await loadPage();
  return Page({
    params: Promise.resolve({ locale: "da" }),
    searchParams: Promise.resolve(searchParams),
  } as Parameters<typeof Page>[0]);
}

/** Where the page redirects to, or null when it renders. */
async function pageRedirect(searchParams: Record<string, string | string[]>) {
  try {
    await renderPage(searchParams);
    return null;
  } catch (e) {
    const to = (e as { redirectTo?: string }).redirectTo;
    if (!to) throw e;
    return to;
  }
}

/** The props the page hands the (client) form component. */
async function formProps(tree: unknown): Promise<Record<string, unknown> | null> {
  const { default: Form } = await import(
    "@/app/[locale]/account/reset-password/ResetPasswordForm"
  );
  const walk = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    }
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.type === Form) return el.props ?? {};
    return walk(el.props?.children);
  };
  return walk(tree);
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  mocks.jar.clear();
  mocks.set.mockReset();
  mocks.del.mockReset();
  mocks.consume.mockReset();
});

afterEach(() => {
  vi.doUnmock("@/brand.config");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the reset page never runs with the token in its address", () => {
  it("a link with ?token= ends on the page with no query, the token in an httpOnly cookie", async () => {
    await withBrand(ALWAYS);

    // 1. The page redirects before it renders anything.
    const hop = await pageRedirect({ token: TOKEN });
    expect(hop).not.toBeNull();
    expect(hop!.startsWith("/api/account/reset-password?")).toBe(true);

    // 2. The route moves the token into a cookie and sends the browser back.
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`${ORIGIN}${hop}`));
    expect(res.status).toBe(303);
    const final = res.headers.get("location")!;
    expect(final).toBe("/da/account/reset-password");
    expect(final).not.toContain(TOKEN);
    expect(new URL(final, ORIGIN).search).toBe("");
    expect(res.headers.get("cache-control")).toBe("no-store");

    expect(mocks.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = mocks.set.mock.calls[0];
    expect(name).toBe(COOKIE);
    expect(value).toBe(TOKEN);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/da/account/reset-password",
    });
    expect(options.maxAge).toBeGreaterThan(0);
    expect(options.maxAge).toBeLessThanOrEqual(60 * 60);

    // 3. Back on the page, nothing redirects and the token is not handed to
    //    the client — the form only learns that one is waiting.
    mocks.jar.set(COOKIE, TOKEN);
    const tree = await renderPage({});
    const props = await formProps(tree);
    expect(props).toEqual({ hasToken: true });
    expect(JSON.stringify(props)).not.toContain(TOKEN);
  });

  it("a repeated ?token= is moved out of the address too", async () => {
    await withBrand(ALWAYS);
    const hop = await pageRedirect({ token: [TOKEN, "second"] });
    expect(new URL(hop!, ORIGIN).searchParams.get("token")).toBe(TOKEN);
  });

  it("without a token or its cookie the page renders the 'request a new link' state", async () => {
    await withBrand(ALWAYS);
    const tree = await renderPage({});
    expect(await formProps(tree)).toEqual({ hasToken: false });
  });

  it('under localePrefix "never" with trailing slashes it lands on the unprefixed page', async () => {
    await withBrand(NEVER_SLASHED);
    const { GET } = await loadRoute();
    const res = await GET(
      new NextRequest(`${ORIGIN}/api/account/reset-password?token=${TOKEN}&locale=da`),
    );
    expect(res.headers.get("location")).toBe("/account/reset-password/");
    // A cookie path matches the slashed address as well.
    expect(mocks.set.mock.calls[0][2]).toMatchObject({ path: "/account/reset-password" });
  });

  it("an unknown locale falls back to the default and never leaves the site", async () => {
    await withBrand(ALWAYS);
    const { GET } = await loadRoute();
    for (const locale of ["//evil.example", "xx", ""]) {
      const res = await GET(
        new NextRequest(
          `${ORIGIN}/api/account/reset-password?${new URLSearchParams({ token: TOKEN, locale })}`,
        ),
      );
      expect(res.headers.get("location"), locale).toBe("/da/account/reset-password");
    }
  });

  it("the cookie is Secure in production", async () => {
    await withBrand(ALWAYS);
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await loadRoute();
    await GET(new NextRequest(`${ORIGIN}/api/account/reset-password?token=${TOKEN}&locale=da`));
    expect(mocks.set.mock.calls[0][2]).toMatchObject({ secure: true, httpOnly: true });
  });

  it("no token, or one far longer than a real one, sets no cookie", async () => {
    await withBrand(ALWAYS);
    const { GET } = await loadRoute();
    for (const query of ["locale=da", `locale=da&token=${"a".repeat(600)}`]) {
      const res = await GET(new NextRequest(`${ORIGIN}/api/account/reset-password?${query}`));
      expect(res.headers.get("location")).toBe("/da/account/reset-password");
    }
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe("the reset action reads the token from the cookie", () => {
  it("succeeds with the cookie, ignores a token posted in the form, and drops the cookie", async () => {
    await withBrand(ALWAYS);
    mocks.jar.set(COOKIE, TOKEN);
    mocks.consume.mockResolvedValue({ ok: true });
    const { resetPasswordAction } = await loadAction();

    const state = await resetPasswordAction(
      { status: "idle" },
      form({ token: "posted-in-the-form", password: "new-strong-pw", confirm: "new-strong-pw" }),
    );

    expect(state).toEqual({ status: "success", message: "resetActions_success" });
    expect(mocks.consume).toHaveBeenCalledWith(TOKEN, "new-strong-pw");
    expect(mocks.del).toHaveBeenCalledWith({ name: COOKIE, path: "/da/account/reset-password" });
  });

  it("an expired or invalid token fails exactly as before, and the cookie stays", async () => {
    await withBrand(ALWAYS);
    mocks.jar.set(COOKIE, TOKEN);
    mocks.consume.mockResolvedValue({
      ok: false,
      code: "invalid_or_expired_link",
      error: "That reset link is no longer valid. Request a new one.",
    });
    const { resetPasswordAction } = await loadAction();

    const state = await resetPasswordAction(
      { status: "idle" },
      form({ password: "new-strong-pw", confirm: "new-strong-pw" }),
    );

    expect(state).toEqual({ status: "error", message: "resetActions_invalidOrExpiredLink" });
    expect(mocks.consume).toHaveBeenCalledWith(TOKEN, "new-strong-pw");
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("without the cookie it answers 'missing token' and checks nothing", async () => {
    await withBrand(ALWAYS);
    const { resetPasswordAction } = await loadAction();

    const state = await resetPasswordAction(
      { status: "idle" },
      form({ token: TOKEN, password: "new-strong-pw", confirm: "new-strong-pw" }),
    );

    expect(state).toEqual({ status: "error", message: "resetActions_missingToken" });
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
