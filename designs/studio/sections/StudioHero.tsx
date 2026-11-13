/**
 * Studio hero — grid-bg + center-aligned headline + tagline + CTA.
 *
 * Generaliseret port af cartwright-app's Hero — alle copy-strings er props
 * så fork-shops kan fylde dem via brand.config.website eller DB-override
 * (BrandingSettings.websiteHeadline/tagline/heroCta). INGEN hardcoded
 * "Cartwright"-tekst — render bliver helt brand-neutral out-of-box.
 */
import { StudioBadge } from "./StudioBadge";
import { StudioButtonLink } from "./StudioButton";

type Props = {
  /** Eyebrow-badge (fx "v0.1 beta", "Now in preview"). Skjult hvis tom. */
  eyebrow?: string;
  /** H1 hero-text. Splittes IKKE — render som-is så fork-shops styrer linjebrud. */
  headline: string;
  /**
   * Højlightet del af headline. Renderes inline efter `headline` med
   * terracotta-underline accent. Hvis undefined: ingen accent.
   */
  headlineAccent?: string;
  /** Lead-paragraf (1-2 sætninger) — beskriver hvad shoppen/firmaet gør. */
  tagline: string;
  /** Primary CTA-tekst (fx "Get started", "Book a call"). */
  ctaLabel: string;
  /** CTA-destination — intern (/contact) eller ekstern (mailto:). */
  ctaHref: string;
  /** Sekundær CTA. Skjult hvis undefined. */
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  /** Microcopy under CTA-row (fx tech-stack-line, MIT-license-line). Skjult hvis tom. */
  microcopy?: string;
  /**
   * In-place-editing hooks (annotateEdit): spread-attrs fra editAttr() —
   * `data-cw-edit` på h1/tagline. Undefined/{} ⇒ byte-identisk render.
   */
  headlineAttrs?: Record<string, string>;
  taglineAttrs?: Record<string, string>;
};

export function StudioHero({
  eyebrow,
  headline,
  headlineAccent,
  tagline,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  microcopy,
  headlineAttrs,
  taglineAttrs,
}: Props) {
  return (
    <section className="relative overflow-hidden border-b border-cw-stone-200 dark:border-cw-stone-800">
      <div aria-hidden className="absolute inset-0 cw-grid-bg" />
      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="flex flex-col items-center text-center">
          {eyebrow ? (
            <StudioBadge tone="terracotta" className="mb-6">
              <span className="size-1.5 rounded-full bg-cw-terracotta" />
              {eyebrow}
            </StudioBadge>
          ) : null}

          <h1
            className="max-w-3xl text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50 leading-[1.05]"
            {...headlineAttrs}
          >
            {headline}
            {headlineAccent ? (
              <>
                {" "}
                <span className="relative inline-block">
                  <span className="relative z-10">{headlineAccent}</span>
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-1 h-3 bg-cw-terracotta/20 dark:bg-cw-terracotta/30 -z-0"
                  />
                </span>
              </>
            ) : null}
          </h1>

          <p
            className="mt-6 max-w-2xl text-base sm:text-lg text-cw-stone-500 dark:text-cw-stone-400 leading-relaxed"
            {...taglineAttrs}
          >
            {tagline}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
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

          {microcopy ? (
            <p className="mt-6 text-xs text-cw-stone-500 dark:text-cw-stone-400 font-mono">
              {microcopy}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
