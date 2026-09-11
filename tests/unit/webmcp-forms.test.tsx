// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// These components render inside app/[locale]'s NextIntlClientProvider in the
// app; rendered bare here, any next-intl hook throws. Namespace-aware echo
// (house pattern) so a call site reaching for the wrong namespace fails loudly.
// It touches only the HUMAN-facing strings — the agent outcomes asserted below
// are stable English literals in the source, which is the point of them.
vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return { ...actual, useTranslations: (ns: string) => (key: string) => `${ns}.${key}` };
});

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

/**
 * The schema an agent actually READS. The declarative API has no inputSchema
 * of its own — the browser synthesises one from the form's named controls, and
 * `required` comes from the `required` ATTRIBUTE and nowhere else. An external
 * WebMCP audit of demo.cartwright.app (2026-09-10) found `site_search` and
 * `newsletter_signup` advertising `required: []` because the inputs lacked it.
 *
 * Asserted through Google's own polyfill (public/vendor/webmcp-polyfill.js,
 * the reference derivation the check page loads) rather than by grepping for
 * the attribute: the contract is the schema an agent sees, and this is the
 * code that produces it.
 */
describe("the derived tool schema is what an agent reads", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    // Loaded ONCE: the polyfill installs window listeners on every run.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "public", "vendor", "webmcp-polyfill.js"),
      "utf8",
    );
    // The polyfill no-ops if a modelContext already exists; start clean.
    delete (document as unknown as { modelContext?: unknown }).modelContext;
    new Function(src)();
  });

  beforeEach(() => {
    pushed = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function derivedTool(toolName: string) {
    const ctx = (document as unknown as {
      modelContext: {
        getTools: () => Promise<
          Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
        >;
      };
    }).modelContext;
    const tool = (await ctx.getTools()).find((t) => t.name === toolName);
    expect(tool, `${toolName} is not a registered tool`).toBeDefined();
    return tool!;
  }
  const derivedSchema = async (toolName: string) => (await derivedTool(toolName)).inputSchema;

  it("site_search requires `query`", async () => {
    await act(async () => root.render(withFlag(true, <SearchBox />)));
    expect(await derivedSchema("site_search")).toEqual({
      type: "object",
      properties: { query: { type: "string", description: "Free-text product search." } },
      required: ["query"],
    });
  });

  it("newsletter_signup requires `email`", async () => {
    const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
    await act(async () => root.render(withFlag(true, <NewsletterSignup />)));
    expect(await derivedSchema("newsletter_signup")).toEqual({
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The email address to subscribe — a valid address such as name@example.com.",
        },
      },
      required: ["email"],
    });
  });

  /**
   * The description IS the routing signal a planner reads, so it is pinned
   * verbatim. Two lessons from review: a description that names a button by
   * its label ("press Subscribe") is wrong the moment the label is "Sign up"
   * or "Tilmeld", and a description that points at another tool must point at
   * one that exists.
   */
  it("site_search says it navigates, and points at a tool that exists", async () => {
    await act(async () => root.render(withFlag(true, <SearchBox />)));
    const { description } = await derivedTool("site_search");
    expect(description).toBe(
      "Open this store's search results page so the user can see matching products. " +
        "This navigates the browser; to read product data without leaving the page, use search_products instead.",
    );
    // Guards the case the verbatim pin cannot: the OTHER tool being renamed.
    // Known names = the imperative tools AND the declarative form tools.
    const { WEBMCP_TOOL_BINDINGS } = await import("@/components/WebMcpRegistrar");
    const { WEBMCP_FORM_TOOL_NAMES } = await import("@/lib/model-context");
    const known = [...Object.keys(WEBMCP_TOOL_BINDINGS), ...Object.values(WEBMCP_FORM_TOOL_NAMES)];
    const referenced = description.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    expect(referenced).toContain("search_products");
    for (const name of referenced) expect(known).toContain(name);
  });

  it("newsletter_signup says it is an opt-in the user confirms — without naming a button", async () => {
    const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
    await act(async () => root.render(withFlag(true, <NewsletterSignup />)));
    const { description } = await derivedTool("newsletter_signup");
    expect(description).toBe(
      "Subscribe an email address to this store's marketing newsletter — an opt-in to promotional email. " +
        "Nothing is sent until the user submits the form themselves; the call completes when they do.",
    );
    // The button label is per-locale and per-shop ("Sign up", "Tilmeld"…).
    expect(description).not.toMatch(/\bpress\b|\bclick\b/i);
  });

  it("an agent's requestSubmit() of an EMPTY query is refused with a reason, not dropped", async () => {
    // What a browser that submits via requestSubmit() does: constraint
    // validation first, THEN the submit event. With `required` and no
    // noValidate, an empty query fires `invalid` and no submit at all — the
    // page never answers. With noValidate, handleSubmit enforces the
    // schema itself. The capture listener is the polyfill's own mechanism.
    await act(async () => root.render(withFlag(true, <SearchBox />)));
    const form = host.querySelector("form")!;
    const answers: unknown[] = [];
    form.addEventListener(
      "submit",
      (e) => {
        Object.assign(e, { agentInvoked: true, respondWith: (v: unknown) => answers.push(v) });
      },
      { capture: true },
    );
    await act(async () => form.requestSubmit());
    await expect(answers[0]).resolves.toEqual({ error: "Provide a search query." });
    expect(pushed).toEqual([]); // refused: no navigation
  });

  it("a HUMAN's empty search still opens the catalogue", async () => {
    await act(async () => root.render(withFlag(true, <SearchBox />)));
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(pushed).toEqual(["/produkter"]);
  });

  it("Google's polyfill executes site_search end to end", async () => {
    await act(async () => root.render(withFlag(true, <SearchBox />)));
    const ctx = (document as unknown as {
      modelContext: {
        getTools: () => Promise<Array<{ name: string }>>;
        executeTool: (tool: unknown, args: Record<string, unknown>) => Promise<unknown>;
      };
    }).modelContext;
    const tool = (await ctx.getTools()).find((t) => t.name === "site_search");
    // An omitted argument on a fresh form: nothing to search for.
    let omitted: unknown;
    await act(async () => {
      omitted = await ctx.executeTool(tool, {});
    });
    expect(omitted).toEqual({ error: "Provide a search query." });
    let hit: unknown;
    await act(async () => {
      hit = await ctx.executeTool(tool, { query: "oak table" });
    });
    expect(hit).toEqual({ status: "navigating", query: "oak table", path: "/produkter?q=oak%20table" });
    expect(pushed).toEqual(["/produkter?q=oak%20table"]);
    // An explicit empty query. (An OMITTED one after a previous call would
    // resubmit the old value — the polyfill only fills what it is given.)
    let empty: unknown;
    await act(async () => {
      empty = await ctx.executeTool(tool, { query: "" });
    });
    expect(empty).toEqual({ error: "Provide a search query." });
    expect(pushed).toEqual(["/produkter?q=oak%20table"]); // the refusals navigated nowhere
  });

  /** Parsed, not grepped: React 19 serializes the prop as camelCase `noValidate=""`. */
  function parsedControls(markup: string, inputType: string) {
    const doc = new DOMParser().parseFromString(markup, "text/html");
    const form = doc.querySelector("form")!;
    const input = form.querySelector(`input[type="${inputType}"]`) as HTMLInputElement;
    return { noValidate: form.noValidate, required: input.required };
  }

  it("the search form carries both — the agent submits it", () => {
    expect(parsedControls(renderToStaticMarkup(withFlag(true, <SearchBox />)), "search")).toEqual({
      noValidate: true,
      required: true,
    });
  });

  it("the newsletter form carries both — the page answers every submit", async () => {
    const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
    expect(parsedControls(renderToStaticMarkup(withFlag(true, <NewsletterSignup />)), "email")).toEqual({
      noValidate: true,
      required: true,
    });
  });

  /**
   * The newsletter is noValidate, so the browser no longer blocks a bad
   * address by itself — handleSubmit must, with the browser's OWN rule
   * (ValidityState), not just its looser regex. Otherwise `name@gmail..com`
   * becomes a confirmed subscriber (review measured exactly that once).
   */
  describe("newsletter: the browser's email rule, answered by the page", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue({ json: async () => ({ ok: true }) } as unknown as Response);
    });
    afterEach(() => fetchSpy.mockRestore());

    async function mount(flag = true) {
      const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
      await act(async () => root.render(withFlag(flag, <NewsletterSignup />)));
      return {
        form: host.querySelector("form")!,
        input: host.querySelector('input[type="email"]') as HTMLInputElement,
      };
    }

    it("an agent's EMPTY email is answered with an error, and nothing is sent", async () => {
      const { form } = await mount();
      const answers: unknown[] = [];
      form.addEventListener(
        "submit",
        (e) => Object.assign(e, { agentInvoked: true, respondWith: (v: unknown) => answers.push(v) }),
        { capture: true },
      );
      await act(async () => form.requestSubmit());
      await expect(answers[0]).resolves.toEqual({ error: "Enter a valid email address." });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each(["name@gmail..com", "a,b@c.dk", "æøå@firma.dk"])(
      "%s — passes the regex, fails the browser's rule: refused, localized, never sent",
      async (address) => {
        const { form, input } = await mount();
        input.value = address;
        await act(async () => form.requestSubmit());
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(host.textContent).toContain("Storefront.newsletterInvalidEmail");
        expect(input.getAttribute("aria-invalid")).toBe("true");
      },
    );

    it.each(["name@gmail..com", "a,b@c.dk", "æøå@firma.dk"])(
      "an agent-filled %s is answered with an error, never sent",
      async (address) => {
      const { form, input } = await mount();
      input.value = address;
      const answers: unknown[] = [];
      form.addEventListener(
        "submit",
        (e) => Object.assign(e, { agentInvoked: true, respondWith: (v: unknown) => answers.push(v) }),
        { capture: true },
      );
      await act(async () => form.requestSubmit());
      await expect(answers[0]).resolves.toEqual({ error: "Enter a valid email address." });
      expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it("focus moves to the rejected field, as native validation would have done", async () => {
      const { form, input } = await mount();
      input.value = "abc";
      await act(async () => form.requestSubmit());
      expect(document.activeElement).toBe(input);
    });

    it("flag off: focus is left to the browser, exactly as before", async () => {
      const { form, input } = await mount(false);
      // Empty is VALID without `required`, so the submit reaches the handler,
      // whose regex rejects it — the one flag-off path through this code.
      await act(async () => form.requestSubmit());
      expect(host.textContent).toContain("Storefront.newsletterInvalidEmail");
      expect(document.activeElement).not.toBe(input);
    });

    it("surrounding whitespace is not a rejection — the browser strips it before validating", async () => {
      const { form, input } = await mount();
      input.value = " anna@example.com ";
      await act(async () => form.requestSubmit());
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("Google's polyfill runs the confirm flow end to end: filled, nothing sent, then the human submits", async () => {
      const { form, input } = await mount();
      const ctx = (document as unknown as {
        modelContext: {
          getTools: () => Promise<Array<{ name: string }>>;
          executeTool: (tool: unknown, args: Record<string, unknown>) => Promise<unknown>;
        };
      }).modelContext;
      const tool = (await ctx.getTools()).find((t) => t.name === "newsletter_signup");
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = ctx.executeTool(tool, { email: "anna@example.com" });
      });
      // No autosubmit: the agent's call fills the form and WAITS.
      expect(input.value).toBe("anna@example.com");
      expect(fetchSpy).not.toHaveBeenCalled();
      let result: unknown;
      await act(async () => {
        form.requestSubmit(); // the human confirms
        result = await pending;
      });
      expect(result).toEqual({ status: "subscribed" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("a valid address is sent exactly once", async () => {
      const { form, input } = await mount();
      input.value = "anna@example.com";
      await act(async () => form.requestSubmit());
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("flag off: neither `required` nor `novalidate` — the human markup is unchanged", async () => {
    const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
    expect(parsedControls(renderToStaticMarkup(withFlag(false, <SearchBox />)), "search")).toEqual({
      noValidate: false,
      required: false,
    });
    expect(parsedControls(renderToStaticMarkup(withFlag(false, <NewsletterSignup />)), "email")).toEqual({
      noValidate: false,
      required: false,
    });
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

describe("Newsletter + Contact respondWith outcomes (agent-facing, stable English)", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function setNativeValue(el: Element, value: string) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function agentSubmit(form: HTMLFormElement): Promise<unknown[]> {
    const responses: unknown[] = [];
    await act(async () => {
      const submit = new Event("submit", { bubbles: true, cancelable: true }) as SubmitEvent;
      (submit as unknown as Record<string, unknown>).agentInvoked = true;
      (submit as unknown as Record<string, unknown>).respondWith = (r: unknown) =>
        responses.push(r);
      form.dispatchEvent(submit);
    });
    return responses;
  }

  it("NewsletterSignup: invalid email answers the agent with the validation error", async () => {
    const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
    await act(async () => {
      root.render(withFlag(true, <NewsletterSignup />));
    });
    const form = container.querySelector("form")!;
    await act(async () => setNativeValue(container.querySelector('input[name="email"]')!, "not-an-email"));

    const responses = await agentSubmit(form);
    expect(responses).toHaveLength(1);
    await expect(responses[0]).resolves.toEqual({ error: "Enter a valid email address." });
  });

  it("NewsletterSignup: subscribed on ok, stable English error when the server rejects", async () => {
    const { default: NewsletterSignup } = await import("@/components/NewsletterSignup");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: "Ugyldig e-mailadresse." })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(withFlag(true, <NewsletterSignup />));
    });
    const form = container.querySelector("form")!;
    const email = container.querySelector('input[name="email"]')!;

    await act(async () => setNativeValue(email, "a@b.example"));
    const first = await agentSubmit(form);
    await expect(first[0]).resolves.toEqual({ status: "subscribed" });

    await act(async () => setNativeValue(email, "c@d.example"));
    const second = await agentSubmit(form);
    // The human sees the server's localized message; the AGENT gets stable
    // English it can act on — never raw Danish server text.
    await expect(second[0]).resolves.toEqual({
      error: "That email address was rejected — check the format and try again.",
    });
  });

  it("SmartContactForm: too-short message answers the agent before any network call", async () => {
    const { default: SmartContactForm } = await import("@/components/SmartContactForm");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(withFlag(true, <SmartContactForm />));
    });
    const form = container.querySelector('form[toolname="contact_store"]') as HTMLFormElement;
    await act(async () => setNativeValue(form.querySelector('textarea[name="message"]')!, "short"));

    const responses = await agentSubmit(form);
    expect(responses).toHaveLength(1);
    const outcome = (await responses[0]) as { error?: string };
    expect(String(outcome.error)).toContain("at least 10 characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SmartContactForm: an AI-answerable message resolves {status: 'answered'}", async () => {
    const { default: SmartContactForm } = await import("@/components/SmartContactForm");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ canAnswer: true, answer: "We ship in 1-2 days." })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(withFlag(true, <SmartContactForm />));
    });
    const form = container.querySelector('form[toolname="contact_store"]') as HTMLFormElement;
    await act(async () =>
      setNativeValue(
        form.querySelector('textarea[name="message"]')!,
        "Do you ship to Norway, and how long does it take?",
      ),
    );

    const responses = await agentSubmit(form);
    expect(responses).toHaveLength(1);
    await expect(responses[0]).resolves.toEqual({
      status: "answered",
      answer: "We ship in 1-2 days.",
    });
  });
});
