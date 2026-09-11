import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AdminCard / AdminSection — Polaris-card: hvid flade (bg-sol-sand, re-skinnet
 * to #fff in admin), a 1px hairline border, 8px radius, subtle shadow. Replaces
 * the many `sol-card-elevated` sections. `padding="none"` for flush tables.
 */
type Props = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padding?: "none" | "sm" | "md";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

const BODY_PAD: Record<NonNullable<Props["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
};

export default function AdminCard({
  title,
  description,
  actions,
  padding = "md",
  className,
  bodyClassName,
  children,
}: Props) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cn(
        "rounded-lg border border-sol-glass-border-dark bg-sol-sand shadow-sol-soft",
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sol-glass-border-dark px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-sol-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-sol-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(BODY_PAD[padding], bodyClassName)}>{children}</div>
    </section>
  );
}
