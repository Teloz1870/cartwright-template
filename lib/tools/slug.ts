import "server-only";

/**
 * Nordic/German-aware slugify, shared by the content-create tools (posts,
 * services).
 *
 * `.normalize("NFD")` alone DROPS "ø" (it has no canonical decomposition), so
 * the Scandinavian + German letters are transliterated explicitly first — this
 * keeps the slug a Danish/German owner sees stable and readable. Kept in one
 * place so the create-paths can't drift apart (a per-tool copy silently did,
 * once: posts handled ä/ö/ü/ß, the older docs copy only æ/ø/å).
 *
 * `fallbackPrefix` names the synthetic slug for the degenerate case where the
 * title has no slug-safe characters at all (e.g. a CJK-only title).
 */
export function slugify(input: string, fallbackPrefix = "item"): string {
  return slugifyOrEmpty(input) || `${fallbackPrefix}-${Date.now()}`;
}

/**
 * The rule a stored slug meets on every validating write path — the admin forms
 * (`lib/validation.ts`), the products/pages/categories/services/posts tools and
 * the product CSV import: lowercase a–z, digits and hyphens, nothing else.
 */
export const SLUG_RULE = /^[a-z0-9-]+$/;

/** `slugify` without the synthetic fallback: "" when nothing slug-safe survives,
 *  so a caller that must stay deterministic (a restore plan) can refuse instead. */
export function slugifyOrEmpty(input: string): string {
  return input
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
