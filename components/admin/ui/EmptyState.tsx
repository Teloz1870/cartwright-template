import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * EmptyState — Polaris tom-tilstand. Erstatter de mange
 * `<p ...>Ingen … endnu.</p>`-strenge med en centreret, valgfrit ikon+CTA-blok.
 */
export default function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon ? <Icon className="h-8 w-8 text-sol-muted" aria-hidden /> : null}
      <p className="text-sm font-medium text-sol-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm text-sol-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
