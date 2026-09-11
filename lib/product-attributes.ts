/**
 * Localized product attributes.
 *
 * `Product.attributes` (generic merchandising JSON) is authored in the shop's
 * base locale. Locale variants live next to name/description in the existing
 * `translations` JSON: `translations.<locale>.attributes` is a partial object
 * merged OVER the base — so locale-neutral keys (roast, weightG) are written
 * once, and only human-language values (origin, process, notes) need a
 * translation. `getDynamicTranslation` stays string-field-only; this is its
 * object-shaped sibling.
 *
 * On the base locale (or with no override) the base object is returned
 * untouched — byte-identical for every existing caller.
 */
import { brand } from "@/brand.config";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function localizedAttributes(
  entity: { attributes?: unknown; translations?: unknown },
  locale: string,
): unknown {
  const base = entity.attributes;
  if (locale === brand.defaultLocale) return base;

  const override = asRecord(
    asRecord(asRecord(entity.translations)?.[locale])?.attributes,
  );
  if (!override) return base;

  const baseRecord = asRecord(base);
  return baseRecord ? { ...baseRecord, ...override } : override;
}

/**
 * The value types a product specification may hold.
 *
 * Flat by design: `string | number | boolean` plus a list of those. Nested
 * objects are rejected at every write path, because every reader assumes a
 * flat key/value shape — the PDP spec table, the catalog feed's
 * `g:product_detail` block and the WebMCP PDP descriptor all iterate
 * `Object.entries` once and stop.
 */
export type AttributePrimitive = string | number | boolean;
export type AttributeValue = AttributePrimitive | AttributePrimitive[];

function isPrimitive(value: unknown): value is AttributePrimitive {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

/**
 * Narrow one authored value to {@link AttributeValue}, or `undefined` when it
 * is not representable (nested object, array of objects, NaN, null).
 *
 * `undefined` — not `null` — signals rejection, so a caller can tell "this
 * value is unusable" apart from "this value is legitimately empty".
 */
export function normalizeAttributeValue(value: unknown): AttributeValue | undefined {
  if (isPrimitive(value)) return value;
  if (Array.isArray(value)) {
    // An empty list is allowed. It renders as nothing on every reader, which is
    // unremarkable — but REFUSING it made a product whose stored blob already
    // contains one (CSV import and sitepack write arbitrary JSON straight to
    // Prisma) unsaveable from the admin without touching a single field, since
    // the hidden input resubmits the stored blob verbatim. That lock-out
    // pre-dates this PR (origin/main took strings only), and keeping it would
    // have been the one place this change made an existing shop worse.
    return value.every(isPrimitive) ? (value as AttributePrimitive[]) : undefined;
  }
  return undefined;
}

/**
 * Keys `JSON.parse` keeps as OWN properties and every reader would then iterate
 * via `Object.entries`. Rejected at every write path.
 */
export const RESERVED_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Narrow a whole authored specifications map, or say which key made it
 * impossible.
 *
 * The one place the rule lives. It used to be inlined in `lib/validation.ts`
 * (the admin form) and simply ABSENT from `lib/tools/products.ts` (the agent
 * surface), so `/api/v1/tools/products.create` took `Record<string, string>`
 * only — an AI agent could not write the engine's own coffee seed, and could
 * write a reserved key the admin form refuses.
 */
export function normalizeAttributeMap(
  input: Record<string, unknown>,
):
  | { ok: true; value: Record<string, AttributeValue> }
  | { ok: false; key: string; reason: "reserved" | "unrepresentable" } {
  const value: Record<string, AttributeValue> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (RESERVED_ATTRIBUTE_KEYS.has(key)) return { ok: false, key, reason: "reserved" };
    const narrowed = normalizeAttributeValue(raw);
    if (narrowed === undefined) return { ok: false, key, reason: "unrepresentable" };
    value[key] = narrowed;
  }
  return { ok: true, value };
}

/**
 * The rows the PDP spec table should draw: every renderable attribute the
 * active design does not already render itself, labelled for a shopper.
 *
 * Pure, and exported, because the page that calls it cannot be unit-rendered —
 * this is the seam that makes "the table skips what crema draws" a testable
 * claim rather than a code-reading exercise.
 *
 * Key LABELLING is deliberately left to the CSS `capitalize` the table has
 * always used. A humanising function was tried and reverted: splitting camel
 * humps and lowercasing the tail turns `SKU` into "Sku", `UV400` into "Uv400"
 * and `pH` into "P h" — author-typed capitals that CSS capitalize rendered
 * correctly. Fixing `weightG` is not worth breaking every acronym; a real
 * answer is per-shop labels, not a heuristic.
 */
export function specTableRows(
  attrs: Record<string, unknown> | null,
  ownedByDesign: readonly string[] = [],
): Array<{ key: string; value: string }> {
  if (!attrs) return [];
  const owned = new Set(ownedByDesign);
  const rows: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of Object.entries(attrs)) {
    if (owned.has(key)) continue;
    const value = displayAttributeValue(raw);
    if (value === null) continue;
    rows.push({ key, value });
  }
  return rows;
}

/**
 * Render one attribute value for a HUMAN surface (the PDP spec table).
 *
 * Lists join with ", " — a reader wants "bergamot, jasmine, lemon", not JSON.
 * Returns `null` for anything that should not be shown at all, so callers can
 * filter with one predicate instead of repeating the type checks.
 */
export function displayAttributeValue(value: unknown): string | null {
  const v = normalizeAttributeValue(value);
  if (v === undefined) return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => String(x).trim()).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Flatten an attributes blob for a MACHINE surface (catalog feed, WebMCP).
 *
 * Deliberately narrower than {@link displayAttributeValue}: only primitive
 * values survive, lists and nested objects are skipped. That rule is a tested
 * contract of the catalog feed ("skips nested object/array attribute VALUES —
 * feed never emits junk", tests/unit/catalog-feed-builder.test.ts), and the
 * WebMCP PDP descriptor reuses THIS function precisely so the on-page agent
 * and the ACP/Google feed can never describe the same product differently.
 * The PDP spec table is deliberately NOT bound to this rule — it renders lists
 * too (specTableRows), so the page shows more than either machine surface.
 *
 * Empty → `undefined`, so a serializer can omit the block entirely.
 */
export function flattenPrimitiveAttributes(
  json: unknown,
): Record<string, string> | undefined {
  const record = asRecord(json);
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === "string") {
      if (v.trim()) out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The attribute key recording grams per pack.
 *
 * It lives HERE, not in the design pack that invented it, because the
 * dependency has to run pack → core and never the other way: a pruned `light`
 * scaffold has no `designs/crema/`, so a core route importing from it would
 * fail to build (tests/unit/design-deep-imports.test.ts enforces exactly
 * this, and caught the first attempt).
 *
 * One name in one place still matters. `/api/products/search` lifts this key
 * into a named `packSizeGrams` field; a hardcoded "weightG" over there would
 * go stale silently the day the vocabulary is tidied — the route would still
 * EMIT `packSizeGrams`, so a field-name contract test stays green while every
 * live value becomes null.
 */
export const PACK_SIZE_ATTRIBUTE = "weightG" as const;
