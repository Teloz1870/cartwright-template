/**
 * Studio feature-grid — 3-col responsive cards med terracotta dot-prefix.
 * Tunet til at vise 6-30 features (cartwright.app har 23). Cards har
 * hairline-border ved hjælp af gap-px + bg-stone-200 → "etched grid"-look.
 *
 * Port af cartwright-app/apps/web/components/landing/feature-grid.tsx.
 */
import { StudioSection, StudioSectionHeader } from "./StudioSection";

export type StudioFeature = {
  title: string;
  body: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  features: StudioFeature[];
  /** In-place-editing hooks (annotateEdit) — spread-attrs fra editAttr().
   *  Undefined/{} ⇒ byte-identisk render. */
  titleAttrs?: Record<string, string>;
  descriptionAttrs?: Record<string, string>;
};

export function StudioFeatureGrid({
  eyebrow,
  title,
  description,
  features,
  titleAttrs,
  descriptionAttrs,
}: Props) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        titleAttrs={titleAttrs}
        descriptionAttrs={descriptionAttrs}
      />
      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-stone-200 dark:bg-cw-stone-800 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="bg-cw-paper dark:bg-cw-stone-900/40 p-6 transition-colors hover:bg-cw-stone-50 dark:hover:bg-cw-stone-900"
          >
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-cw-terracotta" />
              <h3 className="text-sm font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
                {f.title}
              </h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </StudioSection>
  );
}
