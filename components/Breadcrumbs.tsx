import Link from "next/link";

export type Crumb = {
  /** Visible label for this step. */
  label: string;
  /** Locale-prefixed relative href (e.g. `/${locale}/produkter`). Omit on the
   *  current/leaf step — it renders as plain text, not a link. */
  href?: string;
};

/**
 * Visible breadcrumb trail — the on-page companion to the `BreadcrumbList`
 * JSON-LD each storefront page already emits. Palette-adaptive (sol-* tokens
 * re-tone per active design), a11y-correct (`nav[aria-label] > ol > li`, the
 * leaf carries `aria-current="page"` and is NOT a link), separators are
 * decorative (`aria-hidden`).
 *
 * Callers pass already-locale-prefixed hrefs and gate the whole render behind
 * `brand.features.breadcrumbs` — this component never self-gates and never
 * derives URLs, so it stays a pure, testable presentational atom.
 */
export default function Breadcrumbs({
  items,
  className = "",
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${className}`.trim()}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sol-muted">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-x-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-sm transition-colors hover:text-sol-accent hover:underline focus-visible:text-sol-accent focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-accent"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "font-medium text-sol-ink" : undefined}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <span aria-hidden="true" className="select-none opacity-50">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
