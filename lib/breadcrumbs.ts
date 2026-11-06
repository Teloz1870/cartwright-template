/**
 * The localized "Home" label for the first breadcrumb step — used by BOTH the
 * BreadcrumbList JSON-LD and the visible <Breadcrumbs> trail so the two never
 * drift. Centralized here because the storefront pages historically hardcoded
 * it inconsistently (category/produkter emitted "Home" on every locale; the
 * product PDP emitted the Danish "Forside" even on /en).
 *
 * The shipped template runs `da` + `en` (brand.config.ts `locales`), so a
 * two-locale map is exact. Forks that add locales extend the map; any unmapped
 * locale falls back to the English "Home" — a safe, readable default.
 */
const HOME_LABELS: Record<string, string> = {
  da: "Forside",
  en: "Home",
};

export function homeBreadcrumbLabel(locale: string): string {
  return HOME_LABELS[locale] ?? "Home";
}
