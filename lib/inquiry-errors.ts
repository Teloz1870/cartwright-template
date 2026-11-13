/**
 * Machine-readable failure codes for the public inquiry endpoint.
 *
 * The route must not answer with human prose. `/api/inquiries` carries no
 * locale segment, so the route cannot know the visitor's language — but the
 * PAGE does, and the form already translates its own errors. A hardcoded
 * message here silently wins over that translation, because
 * `result.error || t("errorGeneric")` can never fall through a truthy string.
 * That is how an English shop rendered "Ugyldig email-adresse" to a visitor
 * who mistyped their address.
 *
 * So the route returns a `code`, the form translates it, and `error` stays
 * English for non-browser API consumers (agents, scripts, logs) that read the
 * response rather than render it.
 */
import { z } from "zod";

export const INQUIRY_ERROR_CODES = [
  "invalid_name",
  "invalid_email",
  "invalid_input",
  "send_failed",
  "data_too_large",
  "data_too_many_keys",
  "source_too_long",
  "data_reserved_key",
  "data_too_deep",
] as const;

export type InquiryErrorCode = (typeof INQUIRY_ERROR_CODES)[number];

const ENGLISH: Record<InquiryErrorCode, string> = {
  invalid_name: "Name is too short",
  invalid_email: "Invalid email address",
  invalid_input: "Invalid input",
  send_failed: "Could not send your message",
  data_too_large: "Submitted details are too large",
  data_too_many_keys: "Submitted details have too many fields",
  source_too_long: "Form label is too long",
  data_reserved_key: "Submitted details use a reserved field name",
  data_too_deep: "Submitted details are nested too deeply",
};

// ── Wire limits for the optional `source` / `data` fields ──────────────────
// Both live here, next to the codes they produce, because BOTH inquiry route
// variants must enforce them identically: `route.ts` (writes a Lead row) and
// `route.static.ts` (site profile — no DB, mails the owner instead). This file
// is already the only module both variants import, so sharing the limits here
// keeps them in sync by construction rather than by comment.

/** `source` is a short label ("hegnsberegner"), never prose. */
export const MAX_SOURCE_LEN = 64;
/** Enough for a configurator's answers; far short of "free database". */
export const MAX_DATA_KEYS = 50;
export const MAX_DATA_BYTES = 4096;
/**
 * Nesting limit. A form's answers are flat or nearly so; 32 is far past any
 * real configurator and far short of a stack.
 *
 * It exists because `JSON.parse` accepts structures `JSON.stringify` cannot
 * walk, and the byte cap has to serialise in order to measure. Measured on this
 * engine: `{"a":<3000 nested arrays>}` (6 KB) parsed fine, then threw
 * `RangeError: Maximum call stack size exceeded` INSIDE the size check — which
 * is not a `ZodError`, so the public route answered `500 send_failed` and
 * logged a stack trace, anonymously, where six documents promise a `400`.
 * `origin/main` returned `200` for the same body, so it was a regression
 * introduced by adding the field.
 *
 * The cap guards everything downstream of a SUCCESSFUL parse: the sanitizer,
 * the stored row and `/admin/leads` never meet more than 32 levels. It does not
 * guard the other refinements of the same parse — Zod runs every refinement
 * even after an earlier one has failed, so the byte check and the reserved-key
 * check below still receive the deep value, and can still overflow on it.
 * Their `try/catch` blocks are therefore live code, not a second line: both
 * fire on a pathologically deep body, and they are the only thing keeping that
 * body a `400`. Remove either one and the deep-body REGRESSION test in
 * tests/unit/inquiries-source-data.test.ts goes red with a `500`.
 */
export const MAX_DATA_DEPTH = 32;

/**
 * The ONE key that must never survive into the stored blob.
 *
 * This list used to also hold `constructor` and `prototype`, which was a bug of
 * exactly the kind this whole feature exists to remove: both are ordinary field
 * names on real forms — a construction firm's "constructor", an agency wizard's
 * "Do you need a prototype?" — and dropping them returned `200 {ok:true}` with
 * the answer missing. Silent data loss behind a success response is the defect,
 * not the cure. Carrying a STRING under either name is inert: `Object.assign`
 * and spread copy it harmlessly, and so does a deep merge.
 *
 * An OBJECT under either name is not inert, and an earlier version of this
 * comment claimed otherwise. Measured: with `__proto__` stripped,
 * `{"constructor":{"prototype":{"isAdmin":true}}}` still reaches
 * `Object.prototype` through the classic recursive merge, because
 * `target["constructor"]["prototype"]` resolves along the chain. No form sends
 * that shape, so `reservedKeyObject` below REJECTS it at the wire with its own
 * code rather than stripping it silently — a 400 the caller can read, not a
 * 200 with a hole in it.
 *
 * `__proto__` is different, because assigning it can change an object's
 * prototype. Zod's `z.record` already strips it from the TOP level of parsed
 * JSON before we see it (verified) — but only the top level, which is why
 * `sanitizeLeadData` below walks the whole tree rather than one row of keys.
 */
export const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__"]);

/**
 * Drop unsafe keys AT EVERY DEPTH; `undefined` when nothing usable is left.
 *
 * Depth matters. The schema types `data` as `z.record(z.string(),
 * z.unknown())`, so Zod rebuilds only the TOP level — a nested
 * `{"settings":{"__proto__":{…}}}` reaches this function with `__proto__` still
 * an own property of `settings`, and a top-level-only filter stores it verbatim
 * (measured: it round-trips back out of the row as an own property). This
 * endpoint is public and unauthenticated, so the blob it stores must not be a
 * loaded gun for whatever reads it next.
 *
 * The walk is `JSON.parse(JSON.stringify(…), reviver)` — V8 walks, we only say
 * which key to drop. An earlier revision defended that choice as stack-safety
 * versus a hand-written recursion; that argument does not generalise and is
 * withdrawn. Measured: in a bare Node thread the native walk survives a depth
 * where a naive rebuild throws, but inside a vitest worker (a larger stack)
 * BOTH survive 2044 and BOTH throw at 3000 — so no test could hold the claim
 * up, and a claim no test can hold up is not a defence. `MAX_DATA_DEPTH` is
 * what actually makes this safe: nothing deeper than 32 ever reaches here.
 */
export function sanitizeLeadData(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const safe = JSON.parse(JSON.stringify(input), (key, value) =>
    UNSAFE_KEYS.has(key) ? undefined : value,
  ) as Record<string, unknown>;
  return Object.keys(safe).length > 0 ? safe : undefined;
}

/**
 * The wire schema for `source` / `data` — ONE definition, imported by both
 * inquiry route variants.
 *
 * Sharing the constants was not enough. Both routes used to re-declare these
 * fields, `.refine()` predicates and all, so the two copies of the ENFORCEMENT
 * could drift while the numbers stayed identical — proved by mutation: raising
 * only the static route's byte predicate to `MAX_DATA_BYTES * 10` left the
 * entire 4195-test suite green. A limit that lives in one file but is applied
 * in two is a shared number, not a shared rule.
 */
export const inquirySourceSchema = z
  .string()
  .trim()
  .max(MAX_SOURCE_LEN, "source_too_long")
  .nullish()
  // `""` is what an untouched hidden input serialises to, and `null` is what a
  // client writing `source: state.source || null` sends. Rejecting either cost
  // the visitor the WHOLE enquiry with a `400 invalid_input` that named no
  // field — the loud version of the silent loss this feature exists to remove.
  // An absent label is simply absent.
  .transform((v) => (v && v.length > 0 ? v : undefined));

/**
 * True when `value` nests deeper than the cap. Never recurses past the cap
 * itself, so this check can never be the thing that overflows the stack.
 */
function exceedsDepth(value: unknown, depth = 0): boolean {
  if (depth > MAX_DATA_DEPTH) return true;
  if (Array.isArray(value)) return value.some((v) => exceedsDepth(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) =>
      exceedsDepth(v, depth + 1),
    );
  }
  return false;
}

/** Serialised size, or `null` when the value cannot be serialised at all. */
function serialisedBytes(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    // Live, not a formality: a value too deep to serialise still reaches this
    // refinement after `exceedsDepth` has failed it, because Zod keeps running
    // later refinements after an earlier failure. Without this catch the
    // RangeError escapes as a non-Zod error and the public route answers 500.
    return null;
  }
}

/**
 * True when any depth carries an OBJECT under `constructor` or `prototype` —
 * the prototype-pollution shape that survives stripping `__proto__`. A string
 * under either name is untouched.
 *
 * The walk is `JSON.stringify`'s replacer, and it is NOT stack-safe on its
 * own: how deep it gets depends on the thread's stack, not on the byte cap.
 * Measured: 2044 nested arrays — 4095 bytes, inside the cap — throw
 * `RangeError` here under `node --stack-size=600`, while the bare
 * `JSON.stringify` in `serialisedBytes` survives the same value. What makes
 * this check safe is `MAX_DATA_DEPTH` together with the `try/catch` below.
 */
function reservedKeyObject(value: unknown): boolean {
  let found = false;
  try {
    JSON.stringify(value, (key, v) => {
      if (
        (key === "constructor" || key === "prototype") &&
        v !== null &&
        typeof v === "object"
      ) {
        found = true;
      }
      return v;
    });
  } catch {
    // Live for the same reason as serialisedBytes' catch, and reached sooner: a
    // replacer walk overflows at a shallower depth than the bare stringify.
    // Returning false lets nothing through — a value too deep for this walk
    // has already failed `exceedsDepth`.
    return false;
  }
  return found;
}

export const inquiryDataSchema = z
  .record(z.string(), z.unknown())
  .refine((o) => !exceedsDepth(o), "data_too_deep")
  .refine((o) => Object.keys(o).length <= MAX_DATA_KEYS, "data_too_many_keys")
  .refine((o) => {
    const bytes = serialisedBytes(o);
    return bytes !== null && bytes <= MAX_DATA_BYTES;
  }, "data_too_large")
  .refine((o) => !reservedKeyObject(o), "data_reserved_key")
  .nullish()
  .transform((o) => o ?? undefined);

/**
 * Narrow an arbitrary Zod issue message to a known code. Zod emits its own
 * built-in text for failures the schema does not annotate (a missing field, a
 * wrong type), so anything unrecognised degrades to `invalid_input` rather
 * than leaking Zod's own wording into the response.
 */
export function inquiryErrorCode(value: unknown): InquiryErrorCode {
  return INQUIRY_ERROR_CODES.includes(value as InquiryErrorCode)
    ? (value as InquiryErrorCode)
    : "invalid_input";
}

export function inquiryErrorEnglish(code: InquiryErrorCode): string {
  return ENGLISH[code];
}
