// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import { FeaturesProvider, type FeatureFlags } from "@/lib/feature-flags/context";

/**
 * A `--profile site` scaffold has no `/api/support/triage` (admin-owned), but
 * SmartContactForm POSTed there unconditionally before ever reaching
 * `/api/inquiries`. The missing route answered 405 through the catch-all, the
 * `response.json()` threw, and every visitor saw "Could not connect to the
 * server" — the shipped form could not submit at all (found by a review
 * falsifier on a real 2.9.2 scaffold; the endpoint itself worked via curl).
 *
 * The form's `triageEnabled` prop now defaults to the profile's own
 * `supportTriage` capability (true in the engine tree, false in the static
 * twin a site scaffold receives); with it off the form goes straight to the
 * human path. This file drives the prop explicitly; the sibling
 * `contact-form-triage-default.test.tsx` proves the default reads the
 * capability, so no caller can re-ship the bug by forgetting the prop.
 */
vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return { ...actual, useTranslations: (ns: string) => (key: string) => `${ns}.${key}` };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const { default: SmartContactForm } = await import("@/components/SmartContactForm");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ ok: true, canAnswer: false, answer: null }) } as Response;
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function mountAndSubmit(props: { triageEnabled?: boolean; locale?: "en" | "da" }) {
  const features = { ...brand.features, webMcp: false } as FeatureFlags;
  await act(async () => {
    root.render(
      <FeaturesProvider initial={features}>
        <SmartContactForm {...props} />
      </FeaturesProvider>,
    );
  });
  await act(async () => {
    typeInto(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Test Testesen");
    typeInto(container.querySelector<HTMLInputElement>('input[name="email"]')!, "t@example.test");
    typeInto(container.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!, "I would like a quote for a fence, please.");
  });
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("SmartContactForm without an AI triage route", () => {
  it("triageEnabled=false: never POSTs to /api/support/triage, submits to /api/inquiries", async () => {
    await mountAndSubmit({ triageEnabled: false, locale: "en" });
    expect(calls.some((u) => u.includes("/api/support/triage"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/inquiries"))).toBe(true);
    // The visitor sees the success card, not "Could not connect to the server".
    expect(container.textContent).toContain("Thank you for your message!");
    expect(container.textContent).not.toContain("Could not connect");
  });

  it("default (triage available): asks triage first, then escalates to a human", async () => {
    await mountAndSubmit({});
    expect(calls[0]).toContain("/api/support/triage");
    expect(calls.some((u) => u.includes("/api/inquiries"))).toBe(true);
  });
});
