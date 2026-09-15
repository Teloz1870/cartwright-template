/**
 * Studio section-wrapper + SectionHeader — bygges af alle Studio* landing-
 * komponenter for konsistent 6xl max-width + border + py-spacing.
 *
 * Port af cartwright-app/apps/web/components/landing/section.tsx.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StudioSection({
  children,
  className,
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  bleed?: boolean;
}) {
  return (
    <section
      className={cn(
        "border-b border-cw-stone-200 dark:border-cw-stone-800",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto",
          bleed ? "w-full" : "max-w-6xl px-6 py-20 sm:py-24",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function StudioSectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  titleAttrs,
  descriptionAttrs,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  /**
   * In-place-editing hooks (annotateEdit): spread-attrs fra editAttr() —
   * `data-cw-edit` på title/description. Undefined/{} ⇒ byte-identisk render.
   */
  titleAttrs?: Record<string, string>;
  descriptionAttrs?: Record<string, string>;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
          {eyebrow}
        </p>
      )}
      <h2
        className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50"
        {...titleAttrs}
      >
        {title}
      </h2>
      {description && (
        <p
          className="mt-4 text-base sm:text-lg leading-relaxed text-cw-stone-500 dark:text-cw-stone-400"
          {...descriptionAttrs}
        >
          {description}
        </p>
      )}
    </div>
  );
}
