import { parseNdjson } from "@/lib/sitepack/serialize";
import { sanitizeUserHtml } from "@/lib/v0/transform/sanitize-strict";
import { parsePageLayout } from "@/lib/builder/section-schema";

/**
 * SitePack import — the CONTENT-SAFETY layer (ultraplan §5 step 6), the second
 * half of the untrusted-input boundary. `openCartpack` proved the pack wasn't
 * TAMPERED; this layer makes its CONTENT safe to persist — because integrity
 * says nothing about whether a (consistent, signed) pack carries hostile HTML.
 *
 * Mandatory + unconditional, even for a signed/own pack (a signature proves WHO,
 * not SAFE): every HTML-bearing field is run through `sanitizeUserHtml` (strict
 * DOMPurify — drops <script>/<style>/<svg>/<iframe>, inline event handlers,
 * javascript:/data: URIs) BEFORE it ever reaches the DB:
 *   - `vibeHtml` on every content row, AND nested `translations.<locale>.vibeHtml`
 *   - every `html` prop inside a `Page.layoutJson` section (the vibe-section sink),
 *     after re-validating the layout against the CURRENT pageLayoutSchema (a
 *     layout authored on an older/foreign section spec that no longer validates is
 *     DROPPED → the page falls back to its body, never renders an unknown shape).
 *
 * WHY vibeHtml specifically: page/service/homepage render vibeHtml RAW via
 * `dangerouslySetInnerHTML` with no render-time sanitizer (only a className→class
 * regex) — so INGEST is the only defense. By contrast `body`/`description`/
 * `excerpt`/`shortDescription` are rendered as ESCAPED React elements
 * (`renderContentBlocks`, lib/content.ts — explicitly XSS-safe), and media
 * `alt`/`caption`/`title` are attributes/text (React-escaped), never an HTML
 * sink — so they are deliberately NOT sanitized here (doing so would corrupt
 * legit markdown / alt text). vibeHtml + the vibe-section `html` are the only
 * raw-HTML sinks in the carried content.
 *
 * TWO layoutJson columns, two schemas — do NOT conflate them:
 *   - `Page.layoutJson`        → builder section-tree (`pageLayoutSchema`); the
 *     ONLY layoutJson with an HTML sink → sanitized here (`sanitizePageRow`).
 *   - `BrandingSettings.layoutJson` → global section-ORDER config
 *     (`layoutConfigSchema`: `{key,enabled}` only, no HTML) → a DIFFERENT shape.
 *     It must NOT pass through the page-layout sanitizer (validating it against
 *     pageLayoutSchema would reject it → silent loss of the homepage layout). It
 *     carries no HTML sink, so branding only gets the vibe pass. Structural
 *     re-validation of branding's layout against layoutConfigSchema (strip
 *     unknown keys) is the APPLY layer's job — it owns the branding write and the
 *     prisma-coupled schema; this layer stays pure.
 *
 * Hostile-shape hardening (untrusted JSON, integrity says nothing about shape):
 *   - non-object rows (a `null`/`5`/`[]` NDJSON line) are DROPPED, not fed
 *     downstream (the apply layer's count reconciliation surfaces the gap).
 *   - the field walk is depth-capped (a 50k-deep nested blob would otherwise
 *     stack-overflow) and skips `__proto__`/`constructor`/`prototype` keys so the
 *     object rebuild can't be turned into prototype pollution.
 *
 * Pure: no DB, no I/O (DOMPurify+jsdom only). The apply layer persists the result.
 */

type Row = Record<string, unknown>;

const VIBE_KEYS = new Set(["vibeHtml"]);
const LAYOUT_HTML_KEYS = new Set(["html"]);
// Keys that would corrupt the object rebuild (the `__proto__` setter) or are
// never legitimate content columns — dropped during the walk.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// Real content nests ≤ ~8 deep (translations.<locale>.<field>; layout
// sections[].props.html). Anything past this is hostile/corrupt → reject.
const MAX_DEPTH = 64;

const isPlainObject = (v: unknown): v is Row =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Recursively sanitize every string property whose KEY is in `keys`. Depth-capped
 *  and prototype-pollution-safe (see UNSAFE_KEYS / MAX_DEPTH above). */
function sanitizeHtmlFields(value: unknown, keys: ReadonlySet<string>, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error("SitePack: content nesting exceeds the safe depth limit.");
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeHtmlFields(v, keys, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Row = {};
    for (const [k, v] of Object.entries(value as Row)) {
      if (UNSAFE_KEYS.has(k)) continue; // never legit; bracket-assign would hit the __proto__ setter
      out[k] = keys.has(k) && typeof v === "string" ? sanitizeUserHtml(v) : sanitizeHtmlFields(v, keys, depth + 1);
    }
    return out;
  }
  return value;
}

/** Re-validate a `Page.layoutJson` string vs the CURRENT schema + sanitize its
 *  vibe-section html. Returns the cleaned JSON string, or null when absent/invalid
 *  (→ the render layer falls back to the page body). */
export function sanitizeLayoutJson(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  const layout = parsePageLayout(raw); // validates vs pageLayoutSchema; null if invalid/incompatible
  if (!layout) return null;
  const sanitized = sanitizeHtmlFields(layout, LAYOUT_HTML_KEYS);
  // Sanitizing a vibe section's html can empty it (e.g. all-<script> input),
  // which no longer satisfies `html.min(1)`. Re-parse so the STORED layout is
  // ALWAYS schema-valid — otherwise drop to the body fallback now rather than
  // letting re-validation fail at render time.
  const revalidated = parsePageLayout(JSON.stringify(sanitized));
  return revalidated ? JSON.stringify(revalidated) : null;
}

/** Sanitize the vibeHtml of one content row (top-level + nested
 *  `translations.<locale>.vibeHtml`). Non-HTML fields pass through untouched.
 *  Safe for EVERY content collection incl. branding (no layout assumptions). */
export function sanitizeContentRow(row: Row): Row {
  return sanitizeHtmlFields(row, VIBE_KEYS) as Row;
}

/** A page row also carries `Page.layoutJson` (the builder section-tree, the one
 *  layoutJson with an HTML sink) → sanitize + re-validate it on top of vibeHtml. */
export function sanitizePageRow(row: Row): Row {
  const out = sanitizeContentRow(row);
  if ("layoutJson" in out) out.layoutJson = sanitizeLayoutJson(out.layoutJson);
  return out;
}

export type SitePackContent = {
  pages: Row[];
  categories: Row[];
  services: Row[];
  posts: Row[];
  products: Row[];
  variants: Row[];
  productMedia: Row[];
  media: Row[];
  branding: Row | null;
  integration: Row | null;
};

/** Parse every content/media file from an opened pack and sanitize all HTML.
 *  A missing collection = empty (the exporter omits empty files). Non-object rows
 *  are dropped (corrupt/hostile shape — never valid content). */
export function parseSitePackContent(entries: Map<string, Buffer>): SitePackContent {
  const nd = (path: string): Row[] => {
    const b = entries.get(path);
    if (!b) return [];
    return (parseNdjson(b.toString("utf8")) as unknown[]).filter(isPlainObject);
  };
  const jsonObj = (path: string): Row | null => {
    const b = entries.get(path);
    if (!b) return null;
    try {
      const v: unknown = JSON.parse(b.toString("utf8"));
      return isPlainObject(v) ? v : null;
    } catch {
      return null;
    }
  };

  return {
    // Pages carry vibeHtml AND the builder layoutJson sink.
    pages: nd("content/pages.ndjson").map(sanitizePageRow),
    // The rest carry vibeHtml only (no layoutJson) → vibe pass.
    categories: nd("content/categories.ndjson").map(sanitizeContentRow),
    services: nd("content/services.ndjson").map(sanitizeContentRow),
    posts: nd("content/posts.ndjson").map(sanitizeContentRow),
    products: nd("content/products.ndjson").map(sanitizeContentRow),
    // No HTML sinks (joins / metadata / stub) → pass through.
    variants: nd("content/product-variants.ndjson"),
    productMedia: nd("content/product-media.ndjson"),
    media: nd("media/manifest.ndjson"),
    // Branding's layoutJson is the global section-ORDER config (different schema,
    // no HTML sink) — vibe pass only, NEVER the page-layout sanitizer.
    branding: (() => {
      const b = jsonObj("content/branding.json");
      return b ? sanitizeContentRow(b) : null;
    })(),
    integration: jsonObj("content/integrations.stub.json"),
  };
}
