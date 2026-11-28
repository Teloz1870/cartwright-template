/**
 * Studio 3-card value-props grid. Hver card har icon + title + body.
 * Default-set kommer fra brand.config.website.valueProps men kan
 * overrides via prop.
 *
 * Port af cartwright-app/apps/web/components/landing/value-props.tsx.
 */
import type { ReactNode } from "react";
import { StudioSection, StudioSectionHeader } from "./StudioSection";
import { cn } from "@/lib/utils";

export type StudioValueProp = {
  title: string;
  body: string;
  /** SVG icon-element. Skjult hvis undefined. */
  icon?: ReactNode;
};

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  props: StudioValueProp[];
};

export function StudioValueProps({
  eyebrow,
  title,
  description,
  props,
}: Props) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <div
        className={cn(
          "mt-12 grid gap-5",
          props.length === 3
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : props.length === 4
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : "sm:grid-cols-2",
        )}
      >
        {props.map((p) => (
          <Card key={p.title}>
            {p.icon ? (
              <div className="size-10 rounded-md bg-cw-terracotta/10 text-cw-terracotta inline-flex items-center justify-center">
                <span className="size-5">{p.icon}</span>
              </div>
            ) : null}
            <CardTitle className={p.icon ? "mt-5" : ""}>{p.title}</CardTitle>
            <CardBody>{p.body}</CardBody>
          </Card>
        ))}
      </div>
    </StudioSection>
  );
}

// Internal card-system — inlined her fra cartwright-app's components/ui/card.tsx.
function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-paper dark:bg-cw-stone-900/40 p-6 transition-colors",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-base font-semibold text-cw-stone-900 dark:text-cw-stone-50 tracking-tight",
        className,
      )}
    >
      {children}
    </h3>
  );
}

function CardBody({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-sm leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
      {children}
    </p>
  );
}
