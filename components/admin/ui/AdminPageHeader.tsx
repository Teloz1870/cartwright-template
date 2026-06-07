import Link from "next/link";
import type { ReactNode } from "react";

/**
 * AdminPageHeader — Polaris page-title. Erstatter det allestedsnærværende
 * `<div flex justify-between><h1 text-3xl font-black>…`-mønster. Titel er nu
 * `text-2xl font-semibold` (Polaris-vægt frem for font-black 900).
 */
type Crumb = { label: string; href: string };

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumb?: Crumb[];
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
};

export default function AdminPageHeader({
  title,
  subtitle,
  breadcrumb,
  primaryAction,
  secondaryActions,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav
          aria-label="Brødkrumme"
          className="flex flex-wrap items-center gap-1 text-xs text-sol-muted"
        >
          {breadcrumb.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>/</span> : null}
              <Link href={c.href} className="transition hover:text-sol-accent">
                {c.label}
              </Link>
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-sol-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-sol-muted">{subtitle}</p> : null}
        </div>
        {primaryAction || secondaryActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}
