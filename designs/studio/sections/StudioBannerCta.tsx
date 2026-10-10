/**
 * Studio banner-CTA — mid-page konverterings-bånd med en subtil terracotta-
 * tint, så det visuelt skiller sig ud fra den neutrale StudioCtaFooter. Tænkt
 * til at bryde en lang side med ét fokuseret call-to-action (1-2 CTAs).
 *
 * Bygger på StudioSection for konsistent max-width + border; selve båndet er
 * en rounded-2xl accent-flade indeni.
 */
import { z } from "zod";
import { StudioSection } from "./StudioSection";
import { StudioButtonLink } from "./StudioButton";

export const bannerCtaSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    ctaLabel: z.string().min(1),
    ctaHref: z.string().min(1),
    secondaryCtaLabel: z.string().optional(),
    secondaryCtaHref: z.string().optional(),
  })
  .strict();

export type StudioBannerCtaProps = z.infer<typeof bannerCtaSchema>;

export const bannerCtaDefaults: StudioBannerCtaProps = {
  title: "Ready to get started?",
  description:
    "Find your favourites today — free shipping over 50 and 30 days to change your mind.",
  ctaLabel: "Shop nu",
  ctaHref: "/produkter",
  secondaryCtaLabel: "Kontakt os",
  secondaryCtaHref: "/kontakt",
};

export function StudioBannerCta({
  title,
  description,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: StudioBannerCtaProps) {
  return (
    <StudioSection>
      <div className="rounded-2xl border border-cw-terracotta/20 bg-cw-terracotta/10 px-6 py-12 text-center sm:px-12 sm:py-16">
        <h2 className="mx-auto max-w-2xl text-2xl sm:text-3xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-4 mx-auto max-w-xl text-base leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
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
    </StudioSection>
  );
}
