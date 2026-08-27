// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import { FeaturesProvider, type FeatureFlags } from "@/lib/feature-flags/context";

/**
 * WebMCP's DECLARATIVE form surface (types/webmcp-dom.d.ts). Two contracts:
 *
 * 1. BYTE-IDENTITY: the tool* attributes render ONLY when the flag is on.
 *    Unsupported browsers ignoring the attributes is not the same thing as
 *    the attributes not being emitted — flag-off HTML must be unchanged.
 *    Asserted via renderToStaticMarkup under a FeaturesProvider, both ways.
 *
 * 2. RESPONSE CONTRACT: an agent-invoked submit gets the OUTCOME through
 *    event.respondWith. SearchBox answers synchronously with the navigation
 *    target. A human submit (no agentInvoked) must never touch respondWith.
 *
 * Autosubmit policy is pinned as data: search (read-only navigation) allows
 * it; newsletter and contact (communication) must NOT carry the attribute.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (path: string) => pushed.push(path) }),
}));

let pushed: string[] = [];

const { default: SearchBox } = await import("@/components/SearchBox");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function withFlag(on: boolean, node: React.ReactNode) {
  const features = { ...brand.features, webMcp: on } as FeatureFlags;
  return <FeaturesProvider initial={features}>{node}</FeaturesProvider>;
}

describe("declarative form attributes are flag-gated (byte-identity)", () => {
  it("SearchBox: flag off → NO tool* attributes; flag on → the full set incl. autosubmit", () => {
    const off = renderToStaticMarkup(withFlag(false, <SearchBox />));
    expect(off).not.toContain("toolname");
    expect(off).not.toContain("tooldescription");
    expect(off).not.toContain("toolautosubmit");

    const on = renderToStaticMarkup(withFlag(true, <SearchBox />));
    expect(on).toContain('toolname="site_search"');
    expect(on).toContain("tooldescription=");
    // React renders string "" as a bare attribute value — presence is the contract.
    expect(on).toContain("toolautosubmit");
    // The declarative API synthesizes the tool schema from NAMED controls —
    // an unnamed input means a tool with no parameters an agent can fill.
    expect(on).toContain('name="query"');
    expect(on).toContain("toolparamdescription=");
    expect(renderToStaticMarkup(withFlag(false, <SearchBox />))).not.toContain('name="query"');
  });

  it("NewsletterSignup + SmartContactForm: annotated WITHOUT autosubmit (communication)", async () => {
    const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
    const off = renderToStaticMarkup(withFlag(false, <NewsletterSignup />));
    expect(off).not.toContain("toolname");
    const on = renderToStaticMarkup(withFlag(true, <NewsletterSignup />));
    expect(on).toContain('toolname="newsletter_signup"');
    expect(on).toContain('name="email"');
    expect(on).not.toContain("toolautosubmit");
    // SmartContactForm's idle state IS the initial render, so the static
    // markup contains the form. Same assertions.
    const { default: SmartContactForm } = await import("@/components/SmartContactForm");
    const cOff = renderToStaticMarkup(withFlag(false, <SmartContactForm />));
    expect(cOff).not.toContain("toolname");
    const cOn = renderToStaticMarkup(withFlag(true, <SmartContactForm />));
    expect(cOn).toContain('toolname="contact_store"');
    expect(cOn).not.toContain("toolautosubmit");
  });

  it("the checkout form is NOT annotated — financial, deliberately outside the surface", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "components", "CheckoutForm.tsx"),
      "utf8",
    );
    expect(src).not.toContain("toolname");
  });
});

describe("agent-invoked submit gets the outcome via respondWith", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    pushed = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("SearchBox answers the agent with the navigation target and still navigates", async () => {
    await act(async () => {
      root.render(withFlag(true, <SearchBox />));
    });
    const input = container.querySelector("input")!;
    const form = container.querySelector("form")!;
    await act(async () => {
      // React's onChange is the input event under the hood.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!.call(input, "oak table");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const responses: unknown[] = [];
    await act(async () => {
      const submit = new Event("submit", { bubbles: true, cancelable: true }) as SubmitEvent;
      (submit as unknown as Record<string, unknown>).agentInvoked = true;
      (submit as unknown as Record<string, unknown>).respondWith = (r: unknown) =>
        responses.push(r);
      form.dispatchEvent(submit);
    });

    // respondWith is typed Promise-only (the draft's examples always pass a
    // promise) — the agent's answer is the RESOLVED value.
    expect(responses).toHaveLength(1);
    await expect(responses[0]).resolves.toEqual({
      status: "navigating",
      query: "oak table",
      path: "/produkter?q=oak%20table",
    });
    expect(pushed).toEqual(["/produkter?q=oak%20table"]);
  });

  it("a NATIVELY-filled submit reads the DOM, not stale React state", async () => {
    // A WebMCP agent fills the control natively and submits BEFORE React has
    // synced controlled state — the closure still holds "". FormData-first
    // must carry the agent's value. Simulated by setting .value with NO
    // input event.
    await act(async () => {
      root.render(withFlag(true, <SearchBox />));
    });
    const input = container.querySelector("input")!;
    const form = container.querySelector("form")!;
    input.value = "steel grinder"; // native fill — React state stays ""
    const responses: unknown[] = [];
    await act(async () => {
      const submit = new Event("submit", { bubbles: true, cancelable: true }) as SubmitEvent;
      (submit as unknown as Record<string, unknown>).agentInvoked = true;
      (submit as unknown as Record<string, unknown>).respondWith = (r: unknown) =>
        responses.push(r);
      form.dispatchEvent(submit);
    });
    await expect(responses[0]).resolves.toEqual({
      status: "navigating",
      query: "steel grinder",
      path: "/produkter?q=steel%20grinder",
    });
  });

  it("a HUMAN submit never touches respondWith", async () => {
    await act(async () => {
      root.render(withFlag(true, <SearchBox />));
    });
    const form = container.querySelector("form")!;
    const respondWith = vi.fn();
    await act(async () => {
      const submit = new Event("submit", { bubbles: true, cancelable: true }) as SubmitEvent;
      // No agentInvoked flag — a plain human submit that happens to carry
      // the API (browser exposes it on every SubmitEvent).
      (submit as unknown as Record<string, unknown>).respondWith = respondWith;
      form.dispatchEvent(submit);
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(pushed).toEqual(["/produkter"]);
  });
});
