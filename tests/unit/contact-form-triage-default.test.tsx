// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import { FeaturesProvider, type FeatureFlags } from "@/lib/feature-flags/context";

/**
 * The falsifier of #565 deleted `triageEnabled={…}` from the contact page and
 * the whole suite stayed green — the fix lived in a prop a caller had to
 * remember. The prop's DEFAULT is now the profile capability itself. This
 * file mocks the capability the way a `--profile site` scaffold's static twin
 * ships it (`supportTriage: false`) and mounts the form with NO prop: it must
 * never touch `/api/support/triage`. Mutation: default back to `true` → red.
 */
vi.mock("@/lib/profile-capabilities", () => ({
  profileCapabilities: { agentApi: false, accountAndAdmin: false, supportTriage: false, publicFeatureKeys: [] },
}));
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
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
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

describe("SmartContactForm's triage default is the profile capability", () => {
  it("supportTriage=false in the profile, no prop passed: submits to /api/inquiries without asking triage", async () => {
    const features = { ...brand.features, webMcp: false } as FeatureFlags;
    await act(async () => {
      root.render(
        <FeaturesProvider initial={features}>
          <SmartContactForm locale="en" />
        </FeaturesProvider>,
      );
    });
    await act(async () => {
      typeInto(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Test Testesen");
      typeInto(container.querySelector<HTMLInputElement>('input[name="email"]')!, "t@example.test");
      typeInto(container.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!, "I would like a quote, please.");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(calls.some((u) => u.includes("/api/support/triage"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/inquiries"))).toBe(true);
    expect(container.textContent).toContain("Thank you for your message!");
  });
});
