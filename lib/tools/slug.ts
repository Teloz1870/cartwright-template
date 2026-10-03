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
  const slug = input
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
  return slug || `${fallbackPrefix}-${Date.now()}`;
}
