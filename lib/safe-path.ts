/**
 * Same-origin path guard — the one place the engine decides whether a
 * caller-supplied string may be navigated to.
 *
 * WHY IT LIVES IN THE CORE OF `lib/`: this guard is client-safe by construction
 * (no imports, no `server-only`) and `components/LoginForm.tsx` needs it. The
 * implementation used to live in `lib/webmcp/paths.ts`, which the CLI's
 * `--profile light` deletes wholesale — `LIGHT_EXCLUDED_PATHS` in
 * cartwright-app's `apps/cli/src/profile-light.ts` lists `lib/webmcp` among the
 * FULL-ONLY modules, and `index.ts` routes `profile === "light"` through
 * `applyLightProfile`. Light keeps `LoginForm.tsx`, so importing the guard from
 * there is a `TS2307` on the DEFAULT profile — measured, by pruning `lib/webmcp`
 * from this tree and running `tsc --noEmit`. `lib/webmcp/paths.ts` now
 * re-exports this module, so WebMCP's navigate-tool and the login redirect share
 * ONE guard instead of two that can drift apart.
 *
 * Scope note, because the two profile mechanisms disagree: the engine's own
 * module manifest (`modules/registry.ts`, `scaffold/manifest.json`) assigns
 * `lib/webmcp` to the `mcp` module and INCLUDES `mcp` in `managed-site` (alias
 * `light`), i.e. under the manifest-driven `--profile site` materializer nothing
 * would be pruned here. Both statements are true of different code paths;
 * `--profile light` is the path-list one. Do not "correct" this comment from
 * only one of the two.
 */

/** The three characters the WHATWG URL parser STRIPS before parsing. */
const URL_STRIPPED_CONTROLS = /[\t\n\r]/;

/**
 * Parse base. Reserved TLD (RFC 2606) so it can never resolve — but note it IS
 * nameable: `//cartwright.invalid` parses to `origin === base`, which is why the
 * prefix layer below is load-bearing rather than decorative.
 */
const SENTINEL_BASE = "https://cartwright.invalid";

/**
 * Is `path` a relative path that can only ever resolve to our own origin?
 *
 * Accepts `/produkter`, `/da/account/orders/1/review`, `/oauth/authorize?a=b`,
 * `/x#frag`. Rejects absolute URLs, protocol-relative `//evil.com`, backslash
 * variants (`/\evil.com`, which the URL parser normalises to `//evil.com`),
 * non-strings and the empty string.
 *
 * THREE LAYERS, and it is worth knowing what each one is for:
 *
 *  1. `startsWith("/")` + rejecting `//` and `/\` — the syntactic layer. It
 *     names the best-known vector, but on its own it is porous.
 *  2. Rejecting raw TAB/LF/CR — load-bearing, and NOT redundant. The URL parser
 *     strips those three characters before parsing, so `/\t/evil.com` starts
 *     with exactly one slash yet resolves to `https://evil.com`, and browsers
 *     normalise identically when you assign `location.href`. Worse, the same
 *     trick can name the sentinel base below: `/\t/cartwright.invalid` parsed
 *     against it yields `origin === base`, so layer 3 ACCEPTS it while a real
 *     browser leaves the merchant's origin for a reserved TLD. Rejecting the
 *     characters removes the whole class instead of chasing its members.
 *  3. `.origin === base` — the semantic backstop: the only layer that answers
 *     the actual question ("does this resolve to us?") instead of a proxy for
 *     it, and therefore the only one that stays meaningful if the parser's
 *     normalisation rules ever change.
 *
 * WHICH LAYER IS LOAD-BEARING — corrected after review disproved an earlier
 * draft of this comment, so do not restore the old wording:
 *
 *  - Layer 1 is NOT redundant. Dropping only `startsWith("//")` accepts
 *    `//cartwright.invalid`, `//user@cartwright.invalid`, `//CARTWRIGHT.INVALID`
 *    and `//cartwright.invalid/x` — the sentinel base is nameable, so layer 3
 *    waves them through while a real browser leaves the merchant origin.
 *    Dropping `!startsWith("/")` accepts bare `evil.com`.
 *  - Layer 2 is NOT redundant: the control-character forms of that same escape
 *    (`/\t/cartwright.invalid`) walk past layer 1's prefix test.
 *  - Layer 3 is the semantic backstop, and — stated precisely, because two
 *    earlier drafts of this comment got the direction wrong — it is the one
 *    layer that is NOT independently necessary today: with layers 1 and 2 in
 *    place, no input we could construct reaches it as the sole rejector, and
 *    mutating it to `return true` leaves the suite green. It is kept because it
 *    is the only layer that answers the real question ("does this resolve to
 *    us?") rather than enumerating known spellings, so it is what still holds
 *    if the parser's normalisation rules ever change.
 *
 * Layers 1 and 2 ARE each independently necessary: their mutants are killed by
 * tests/unit/safe-path.test.ts. Layer 3's mutant is a known equivalent — do not
 * "fix" it with a contrived test, and do not delete the layer either.
 */
export function isSameOriginPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  // Protocol-relative ("//evil.com") eller backslash-tricks ("/\\evil") → eksternt.
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  // Se layer 2 ovenfor: disse tre tegn fjernes af parseren, så de kan smugle en
  // protocol-relative URL — inkl. sentinel-origin'en — forbi de to andre lag.
  if (URL_STRIPPED_CONTROLS.test(path)) return false;
  try {
    return new URL(path, SENTINEL_BASE).origin === SENTINEL_BASE;
  } catch {
    return false;
  }
}

/**
 * Resolve a `?callbackUrl=` query value into a destination we are willing to
 * send a browser to after sign-in, or `undefined` when there is none we trust.
 *
 * `undefined` is deliberate rather than a baked-in default: each caller already
 * has its own post-login destination, so a missing or rejected value leaves
 * that call site behaving EXACTLY as it did before this helper existed. A
 * rejected value therefore degrades to "you land on your account page", never
 * to an off-site redirect.
 *
 * Not this function's job (documented so nobody reads it as a promise):
 * whether the path EXISTS, whether the signed-in user may see it, or whether it
 * points back at the login page. Authorisation stays with the target route; the
 * only question here is "same origin?".
 */
export function safeCallbackPath(raw: unknown): string | undefined {
  if (!isSameOriginPath(raw)) return undefined;
  // Re-serialise through the parser instead of returning the decoded query
  // value verbatim. Next decodes the query BEFORE we see it, so `%00` arrives
  // as a raw NUL and any non-Latin-1 path arrives as raw code points — and
  // handing either to `redirect()` puts it in a `Location` response header,
  // where Node throws ERR_INVALID_CHAR and the page 500s. Measured: raw NUL,
  // `/\u00e9\u4e2d` and an emoji path all throw on `setHeader`; `/caf\u00e9`
  // does not; and the serialised form is header-safe in every one of those
  // cases. This is a correctness fix before it is a hardening one — a
  // legitimate non-ASCII slug hit the same 500.
  const u = new URL(raw, SENTINEL_BASE);
  return `${u.pathname}${u.search}${u.hash}`;
}
