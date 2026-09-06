import "server-only";

import createDOMPurify from "dompurify";

/**
 * Strict allowlist HTML sanitizer — the real INGEST-boundary security gate for
 * any HTML that will reach `vibeHtml` / `dangerouslySetInnerHTML`.
 *
 * The cheap regex `sanitizeVibeHtml` (lib/v0/transform/sanitize.ts) stays as a
 * render-time last-defense, but it is NOT a parser: it leaves `style=`,
 * `<style>`, `<svg>`, `<math>` and `data:` URIs (in `src`/`srcset`) intact —
 * all viable stored-XSS / clickjacking vectors. This module closes that gap by
 * parsing the markup (DOMPurify + jsdom) and dropping everything outside a hard
 * allowlist before any non-admin-authored or third-party HTML is persisted.
 *
 * Server-only (jsdom must never enter the client/preview bundle).
 *
 * **jsdom is LOADED lazily, not merely constructed lazily** — which is why this
 * API is async and why there is deliberately no `import … from "jsdom"` in this
 * file. jsdom's CJS entry does `require("html-encoding-sniffer")` at ITS module
 * scope, and that package (CJS) depends on `@exodus/bytes`, which is
 * `type: "module"` — so merely *importing* jsdom crosses a CJS→ESM require
 * boundary that some bundler/runtime combinations reject outright
 * (`ERR_REQUIRE_ESM`). Deferring only `new JSDOM()` would not have helped: the
 * boundary is crossed at import, not at construction.
 *
 * That matters far from here. This module hangs under `lib/tools/registry.ts`
 * — a barrel that statically imports ~20 tool modules, reaching this one via
 * `lib/tools/sitepack.ts` → `lib/sitepack/import-parse.ts` — and 14 files
 * import that registry, including `app/admin/audit/page.tsx`, which wants
 * nothing from it but `getTool()`. A module-load failure kills the whole page,
 * not the one function that needed jsdom, so cause and effect end up a whole
 * subsystem apart.
 *
 * The window + DOMPurify instance are still built once and reused: the promise
 * is memoised so concurrent callers share a single load, and cleared on failure
 * so a transient error stays retryable instead of poisoning the process.
 */

type Purify = ReturnType<typeof createDOMPurify>;

let purifyPromise: Promise<Purify> | null = null;

async function buildPurify(): Promise<Purify> {
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("");
  const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

  // Defence-in-depth beyond tag/attr allowlists: DOMPurify permits `data:` URIs
  // on media tags (DATA_URI_TAGS) regardless of ALLOWED_URI_REGEXP, so strip any
  // `data:` value out of URL-bearing attributes explicitly. Registered once,
  // together with the instance it belongs to.
  purify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as unknown as {
      getAttribute?: (n: string) => string | null;
      removeAttribute?: (n: string) => void;
    };
    if (typeof el.getAttribute !== "function") return;
    for (const attr of ["src", "href", "xlink:href", "poster", "background"]) {
      const val = el.getAttribute(attr);
      if (val && /^\s*data:/i.test(val)) el.removeAttribute?.(attr);
    }
    const srcset = el.getAttribute("srcset");
    if (srcset && /data:/i.test(srcset)) el.removeAttribute?.("srcset");
  });

  return purify;
}

function getPurify(): Promise<Purify> {
  if (purifyPromise) return purifyPromise;
  purifyPromise = buildPurify().catch((err) => {
    // Never memoise a failure: a security gate should stay retryable rather
    // than latch closed for the lifetime of the process.
    purifyPromise = null;
    throw err;
  });
  return purifyPromise;
}

/**
 * Sanitize untrusted HTML to a safe subset of presentational markup.
 *
 * - Forbids `<style>`, `<svg>`, `<math>`, `<iframe>`, `<object>`, `<embed>`
 *   (and `<script>` — DOMPurify drops it by default, content included).
 * - Drops the `style=` attribute and all `data-*` attributes.
 * - Strips inline event handlers, `javascript:` and `data:` URIs.
 * - Keeps `class=` (Tailwind) and safe `http(s)`/relative `src`/`href`.
 *
 * Async because jsdom is loaded on first use — see the module docstring.
 */
export async function sanitizeUserHtml(html: string): Promise<string> {
  if (!html) return "";
  const purify = await getPurify();
  const clean = purify.sanitize(html, {
    FORBID_TAGS: ["style", "svg", "math", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    USE_PROFILES: { html: true },
  });
  return typeof clean === "string" ? clean.trim() : String(clean).trim();
}
