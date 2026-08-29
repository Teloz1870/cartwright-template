/**
 * StudioMediaHero — baggrundsbillede-hero med mørkt overlay for WCAG-kontrast.
 * Fuld-bredde figur med absolut <img>, et bg-cw-ink/50 overlay og centreret
 * hvid headline/tagline + valgfri CTA. Schema co-located; registret importerer
 * mediaHeroSchema + mediaHeroDefaults + StudioMediaHero direkte.
 */
import { z } from "zod";
import { StudioButtonLink } from "./StudioButton";
import { cn } from "@/lib/utils";

export const mediaHeroSchema = z
  .object({
    eyebrow: z.string().optional(),
    headline: z.string().min(1),
    tagline: z.string().optional(),
    imageSrc: z.string().min(1),
    imageAlt: z.string().min(1),
    ctaLabel: z.string().optional(),
    ctaHref: z.string().optional(),
  })
  .strict()
  .refine((o) => !o.ctaLabel || !!o.ctaHref, {
    message: "ctaHref påkrævet når ctaLabel er sat",
    path: ["ctaHref"],
  });

export type StudioMediaHeroProps = z.infer<typeof mediaHeroSchema>;

export const mediaHeroDefaults: StudioMediaHeroProps = {
  eyebrow: "Nyt værksted",
  headline: "Håndlavet keramik, brændt i Aarhus",
  tagline:
    "Hver skål og kop drejes i hånden og glaseres med vores egne mineralblandinger. Ingen to stykker er ens.",
  imageSrc: "/images/studio/media-hero.jpg",
  imageAlt: "Keramiker former en lerskål på en drejeskive i et lyst værksted",
  ctaLabel: "Se kollektionen",
  ctaHref: "/produkter",
};

export function StudioMediaHero({
  eyebrow,
  headline,
  tagline,
  imageSrc,
  imageAlt,
  ctaLabel,
  ctaHref,
}: StudioMediaHeroProps) {
  return (
    <section className="relative min-h-[420px] overflow-hidden border-b border-cw-stone-200 dark:border-cw-stone-800">
      {/* eslint-disable-next-line @next/next/no-img-element -- client-safe Studio catalog atom (Magic Builder); full-bleed static/admin src, next/image intentionally not used here */}
      <img
        src={imageSrc}
        alt={imageAlt}
        loading="lazy"
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-cw-ink/50" aria-hidden="true" />
      <div
        className={cn(
          "relative mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center px-6 py-20 text-center sm:py-24",
        )}
      >
        {eyebrow ? (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {headline}
        </h2>
        {tagline ? (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-cw-stone-200 sm:text-lg">
            {tagline}
          </p>
        ) : null}
        {ctaLabel && ctaHref ? (
          <div className="mt-8">
            <StudioButtonLink href={ctaHref} variant="secondary" size="lg">
              {ctaLabel}
            </StudioButtonLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}
