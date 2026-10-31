// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import { localeHref } from "@/lib/urls";

/**
 * REG-LOGIN-LOCALE: after a sign-up, RegisterForm sends the visitor to the
 * login page in the language the form was read in, built by lib/urls.ts — not
 * to a bare `/account/login`, which cost a redirect and left the language to
 * the proxy. Locales come from brand.config, so this runs on a one-language
 * scaffold too; the second-language case is skipped there.
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  registerUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
// A copy of the shop's brand, so one test can set `urls` without touching the
// real module; lib/urls.ts reads the same copy at every call.
vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand } };
});
vi.mock("@/app/[locale]/account/actions", () => ({ registerUser: mocks.registerUser }));

const { default: RegisterForm } = await import("@/components/RegisterForm");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A locale this shop publishes besides its default one, or undefined. */
const SECONDARY = brand.locales.find((l) => l !== brand.defaultLocale);
const whenMultiLocale = SECONDARY ? it : it.skip;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  mocks.push.mockReset();
  mocks.registerUser.mockReset().mockResolvedValue({ ok: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function signUpIn(locale: string) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale={locale} messages={{}}>
        <RegisterForm />
      </NextIntlClientProvider>,
    );
  });
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("RegisterForm — the login page it sends a new customer to", () => {
  it("keeps the shop's default language", async () => {
    await signUpIn(brand.defaultLocale);
    expect(mocks.registerUser).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      localeHref("/account/login?oprettet=1", brand.defaultLocale),
    );
  });

  whenMultiLocale("keeps a second language, instead of falling back to the default", async () => {
    await signUpIn(SECONDARY!);
    expect(mocks.push).toHaveBeenCalledWith(localeHref("/account/login?oprettet=1", SECONDARY!));
  });

  it("under urls.trailingSlash it is the address the shop serves, slash and all", async () => {
    // Literal on purpose: a hand-built `/${locale}/account/login?…` equals the
    // helper's answer at the default URL shape, and only differs here.
    const mutable = brand as { urls?: unknown };
    const saved = mutable.urls;
    mutable.urls = { trailingSlash: true, localePrefix: "always" };
    try {
      await signUpIn(brand.defaultLocale);
      expect(mocks.push).toHaveBeenCalledWith(`/${brand.defaultLocale}/account/login/?oprettet=1`);
    } finally {
      mutable.urls = saved;
    }
  });

  it("does not navigate when the sign-up is refused", async () => {
    mocks.registerUser.mockResolvedValue({ ok: false, error: "Too many attempts." });
    await signUpIn(brand.defaultLocale);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Too many attempts.");
  });
});
