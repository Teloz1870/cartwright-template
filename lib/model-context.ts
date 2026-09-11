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

/** A single WebMCP tool descriptor, as accepted by `registerTool`. */
export type WebMcpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  annotations?: { readOnlyHint?: boolean };
};

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
