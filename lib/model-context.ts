/**
 * WebMCP model-context plumbing — detection + registration shared by the
 * global registrar (`components/WebMcpRegistrar.tsx`) and the diagnostics
 * page (`components/WebMcpCheck.tsx`); the planned per-page tool mounts
 * (`components/webmcp/*`, next slice) will import it too.
 *
 * Lives in core (NOT `lib/webmcp/`) for the same reason `isSameOriginPath`
 * moved to `lib/safe-path.ts`: the CLI's light profile deletes `lib/webmcp/`
 * wholesale, while importers of THIS module survive that prune (the check
 * page today; the planned per-page tool mounts next). A zero-import, client-safe
 * core module is the only placement that can never produce a TS2307 in a
 * materialized scaffold. Keep it dependency-free.
 *
 * API notes (W3C draft + Chrome 149 origin trial, verified 2026-08):
 * - `document.modelContext` is current; `navigator.modelContext` is the
 *   deprecated pre-150 namespace. We prefer document and fall back.
 * - There is NO `unregisterTool()` — cleanup happens by aborting the signal
 *   passed at registration. `provideContext()`/`clearContext()` were removed
 *   from the spec in March 2026; never reintroduce them.
 * - `registerTool` returns a promise in current Chrome builds and void in
 *   early ones — the type admits both and `registerWebMcpTools` awaits either.
 */

/**
 * The DECLARATIVE form tools' names (toolname-attributes on <form> — see
 * types/webmcp-dom.d.ts). They share the tool-name namespace with the
 * imperative tools, so the moat test's uniqueness check spans BOTH lists —
 * a new form tool that collides with a registered tool fails CI. Forms
 * reference these consts instead of retyping the literals.
 *
 * Moat note: form tools carry NO operation bindings — they are the human's
 * own forms, submitted through the same public endpoints with the human
 * confirming (no autosubmit on communication). That is the deliberate
 * carve-out from the "bindings ⊆ customer allowlist" rule, documented in
 * tests/unit/webmcp-moat.test.ts.
 */
export const WEBMCP_FORM_TOOL_NAMES = {
  siteSearch: "site_search",
  contactStore: "contact_store",
  newsletterSignup: "newsletter_signup",
} as const;

/**
 * The `registerTool` annotations, as Chrome's imperative-API guide defines
 * them (measured 2026-09-23; all three default to false in the browser):
 *
 * - `readOnlyHint` — the tool reads and changes nothing, neither in the app
 *   nor in the system behind it. A navigation tool is NOT read-only: it
 *   changes the page the human is on.
 * - `consequentialHint` — running the tool has a significant, real-world or
 *   irreversible effect, so a browser may make the human confirm first. Set
 *   on every tool that changes the customer's cart.
 * - `untrustedContentHint` — the tool's OUTPUT holds data the tool author
 *   does not vouch for (customer reviews, other user-written text, external
 *   web data), so agents should delimit it. Merchant-written catalogue copy
 *   is the author's own and stays false.
 *
 * Every hint is REQUIRED here, although the browser would default a missing
 * one to false: a silent hint and a deliberate `false` read the same to an
 * agent, but only the second is a decision. The fourth Chrome annotation,
 * `debugging` (Chrome 156+), is left out on purpose — no storefront tool is
 * developer tooling.
 */
export type WebMcpToolAnnotations = {
  readOnlyHint: boolean;
  consequentialHint: boolean;
  untrustedContentHint: boolean;
};

/** A single WebMCP tool descriptor, as accepted by `registerTool`. */
export type WebMcpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  annotations: WebMcpToolAnnotations;
};

/**
 * The three annotation classes every storefront tool falls into, so a mount
 * picks a class instead of hand-typing three booleans. Frozen because one
 * object is shared by several descriptors. The annotations test restates the
 * classes literally rather than importing these, so an edit here shows up there.
 */
export const WEBMCP_ANNOTATIONS = {
  /** Reads the catalogue or the cart; changes nothing. */
  read: Object.freeze({ readOnlyHint: true, consequentialHint: false, untrustedContentHint: false }),
  /** Same-origin navigation only: changes the page, no data operation. */
  navigation: Object.freeze({
    readOnlyHint: false,
    consequentialHint: false,
    untrustedContentHint: false,
  }),
  /** Changes the customer's cart — the browser may ask the human first. */
  cartChange: Object.freeze({
    readOnlyHint: false,
    consequentialHint: true,
    untrustedContentHint: false,
  }),
} as const satisfies Record<string, WebMcpToolAnnotations>;

/**
 * The subset of the ModelContext interface we rely on. `getTools` and the
 * event-listener pair are draft surface — always `typeof`-guard before use.
 */
export type ModelContextLike = {
  registerTool: (
    tool: WebMcpToolDescriptor,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
  getTools?: () => unknown;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export type ResolvedModelContext = {
  context: ModelContextLike;
  /** Which namespace supplied it — `navigator` means a pre-150 Chrome build. */
  source: "document" | "navigator";
};

/**
 * Feature-detect the WebMCP surface. Returns null during SSR and in every
 * browser without the origin trial / flag — callers no-op on null, which is
 * what keeps the whole feature invisible outside the experiment.
 */
export function resolveModelContext(): ResolvedModelContext | null {
  if (typeof window === "undefined") return null;
  const fromDocument = (document as unknown as { modelContext?: ModelContextLike })
    .modelContext;
  if (fromDocument && typeof fromDocument.registerTool === "function") {
    return { context: fromDocument, source: "document" };
  }
  const fromNavigator = (navigator as unknown as { modelContext?: ModelContextLike })
    .modelContext;
  if (fromNavigator && typeof fromNavigator.registerTool === "function") {
    return { context: fromNavigator, source: "navigator" };
  }
  return null;
}

/**
 * Register a batch of tools sequentially, awaiting each registration (the
 * draft returns a promise; ignoring it can drop registrations on early
 * navigations). One rejecting registration must not take the rest of the
 * batch down — the agent surface degrades per-tool, never wholesale — so
 * each call gets its own catch. Stops early once the signal aborts (the
 * owner unmounted; anything registered so far is torn down by that same
 * signal).
 */
export async function registerWebMcpTools(
  context: ModelContextLike,
  tools: WebMcpToolDescriptor[],
  signal: AbortSignal,
): Promise<void> {
  for (const tool of tools) {
    if (signal.aborted) return;
    try {
      await context.registerTool(tool, { signal });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[webmcp] registerTool(${tool.name}) failed:`, err);
      }
    }
  }
}
