import "server-only";

import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

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
 * Server-only (jsdom must never enter the client/preview bundle). The jsdom
 * window + DOMPurify instance are created once and reused.
 */

// One jsdom window + DOMPurify instance for the process. jsdom is heavy; never
// build one per call.
const { window } = new JSDOM("");
const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

// Defence-in-depth beyond tag/attr allowlists: DOMPurify permits `data:` URIs
// on media tags (DATA_URI_TAGS) regardless of ALLOWED_URI_REGEXP, so strip any
// `data:` value out of URL-bearing attributes explicitly. Registered once.
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

/**
 * Sanitize untrusted HTML to a safe subset of presentational markup.
 *
 * - Forbids `<style>`, `<svg>`, `<math>`, `<iframe>`, `<object>`, `<embed>`
 *   (and `<script>` — DOMPurify drops it by default, content included).
 * - Drops the `style=` attribute and all `data-*` attributes.
 * - Strips inline event handlers, `javascript:` and `data:` URIs.
 * - Keeps `class=` (Tailwind) and safe `http(s)`/relative `src`/`href`.
 */
export function sanitizeUserHtml(html: string): string {
  if (!html) return "";
  const clean = purify.sanitize(html, {
    FORBID_TAGS: ["style", "svg", "math", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    USE_PROFILES: { html: true },
  });
  return typeof clean === "string" ? clean.trim() : String(clean).trim();
}
