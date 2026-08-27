// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The regression this pins is NOT "is the guard correct" (tests/unit/safe-path
 * .test.ts owns that) — it is "does the login form actually USE it". Three
 * routes hand the form a `?callbackUrl=`; before this, all three were dropped
 * and every sign-in hard-navigated to /account, so the OAuth authorization-code
 * flow could only complete for an already-signed-in user.
 *
 * Rendering the real component with a real DOM is the only way to prove that:
 * a source-text assertion would survive the bug coming back.
 */

let search = new URLSearchParams();
const signIn = vi.fn();

vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const { default: LoginForm } = await import("@/components/LoginForm");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let href: string;

beforeEach(() => {
  signIn.mockReset();
  signIn.mockResolvedValue({ ok: true });
  href = "";
  // jsdom refuses real navigation, so observe the assignment instead.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return href;
      },
      set href(v: string) {
        href = v;
      },
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(qs: string) {
  search = new URLSearchParams(qs);
  await act(async () => {
    root.render(<LoginForm githubEnabled googleEnabled emailEnabled />);
  });
}

async function submitPassword() {
  const form = container.querySelector("form")!;
  (form.querySelector<HTMLInputElement>("#email")!).value = "a@b.c";
  (form.querySelector<HTMLInputElement>("#password")!).value = "pw";
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/**
 * The magic-link email input is CONTROLLED, so assigning `.value` directly is
 * invisible to React (it diffs against its own tracked value and drops the
 * change). Going through the prototype setter is what makes React see it —
 * without this the form's `if (!email.trim()) return` swallows every submit and
 * the assertions below pass for the wrong reason.
 */
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitMagicLink() {
  await act(async () => buttonByText("Magic link").click());
  const input = container.querySelector<HTMLInputElement>("#magic-link-email")!;
  await act(async () => typeInto(input, "a@b.c"));
  const form = input.closest("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function buttonByText(text: string) {
  return [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
}

const AUTHORIZE = "/oauth/authorize?response_type=code&client_id=abc&scope=profile+orders";

describe("LoginForm honours a same-origin ?callbackUrl", () => {
  it("password sign-in lands on the callbackUrl instead of /account", async () => {
    await render(`callbackUrl=${encodeURIComponent(AUTHORIZE)}`);
    await submitPassword();
    expect(href).toBe(AUTHORIZE);
  });

  it("propagates it to GitHub and Google sign-in", async () => {
    await render(`callbackUrl=${encodeURIComponent("/da/account/orders/1/review")}`);

    await act(async () => buttonByText("Continue with GitHub").click());
    expect(signIn).toHaveBeenLastCalledWith("github", {
      callbackUrl: "/da/account/orders/1/review",
    });

    await act(async () => buttonByText("continueGoogle").click());
    expect(signIn).toHaveBeenLastCalledWith("google", {
      callbackUrl: "/da/account/orders/1/review",
    });
  });

  it("passes it down to the magic-link form, so the emailed link returns here", async () => {
    await render(`callbackUrl=${encodeURIComponent(AUTHORIZE)}`);

    await submitMagicLink();

    expect(signIn).toHaveBeenLastCalledWith("email", {
      email: "a@b.c",
      redirect: false,
      callbackUrl: AUTHORIZE,
    });
  });
});

describe("LoginForm refuses an off-origin ?callbackUrl", () => {
  // An accepted off-origin value would be an open redirect on the login page of
  // every Cartwright shop: phishing that starts on the merchant's own domain.
  for (const hostile of [
    "//evil.com",
    "https://evil.com/steal",
    "/\\evil.com",
    "javascript:alert(1)",
    // Smuggled protocol-relative URL — one leading slash, resolves off-origin.
    "/\t/evil.com",
  ]) {
    it(`falls back to /account for ${hostile}`, async () => {
      await render(`callbackUrl=${encodeURIComponent(hostile)}`);
      await submitPassword();
      expect(href).toBe("/account");

      await act(async () => buttonByText("Continue with GitHub").click());
      expect(signIn).toHaveBeenLastCalledWith("github", { callbackUrl: "/account" });
    });
  }
});

describe("no ?callbackUrl ⇒ byte-identical to the pre-fix behaviour", () => {
  it("password → /account, social → /account, magic-link omits the key", async () => {
    await render("");
    await submitPassword();
    expect(href).toBe("/account");

    await act(async () => buttonByText("Continue with GitHub").click());
    expect(signIn).toHaveBeenLastCalledWith("github", { callbackUrl: "/account" });

    await submitMagicLink();
    // undefined, so next-auth applies its own `?? window.location.href` default.
    expect(signIn).toHaveBeenLastCalledWith("email", {
      email: "a@b.c",
      redirect: false,
      callbackUrl: undefined,
    });
  });
});
