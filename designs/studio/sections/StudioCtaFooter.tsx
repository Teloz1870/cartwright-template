/**
 * Studio CTA-footer — final-page conversion-section med headline + 2 CTAs.
 *
 * Port af cartwright-app's CtaFooter (uden den embedded SiteFooter — vores
 * shop bruger sin egen <Footer> i layout.tsx).
 */
import { StudioButtonLink } from "./StudioButton";

type Props = {
  /** H2 final-CTA headline (kort, action-orienteret). */
  title: string;
  /** Lead-paragraf under title. Skjult hvis undefined. */
  description?: string;
  /** Primary CTA. */
  ctaLabel: string;
  ctaHref: string;
  /** Sekundær CTA. Skjult hvis undefined. */
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
};

export function StudioCtaFooter({
  title,
  description,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: Props) {
  return (
    <section className="border-b border-cw-stone-200 dark:border-cw-stone-800">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl sm:text-4xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-4 max-w-xl mx-auto text-base text-cw-stone-500 dark:text-cw-stone-400">
            {description}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <StudioButtonLink href={ctaHref} size="lg" variant="secondary">
            {ctaLabel}
          </StudioButtonLink>
          {secondaryCtaLabel && secondaryCtaHref ? (
            <StudioButtonLink
              href={secondaryCtaHref}
              size="lg"
              variant="outline"
            >
              {secondaryCtaLabel}
            </StudioButtonLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
