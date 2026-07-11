/**
 * Studio split-hero — to-kolonne hero (tekst + billede). Tekstkolonnen leder
 * med eyebrow + h2 + brødtekst og en valgfri CTA; billedkolonnen er valgfri.
 * `reverse` bytter kolonnerækkefølgen på lg. Uden billede renderes én
 * centreret kolonne. Co-located schema + defaults, client-safe (ren synkron).
 */
import { z } from "zod";
import { StudioSection } from "./StudioSection";
import { StudioButtonLink } from "./StudioButton";
import { cn } from "@/lib/utils";

export const splitHeroSchema = z
  .object({
    eyebrow: z.string().optional(),
    headline: z.string().min(1),
    body: z.string().min(1),
    ctaLabel: z.string().optional(),
    ctaHref: z.string().optional(),
    imageSrc: z.string().optional(),
    imageAlt: z.string().optional(),
    reverse: z.boolean().optional(),
  })
  .strict()
  .refine((o) => !o.imageSrc || !!o.imageAlt, {
    message: "imageAlt påkrævet når imageSrc er sat",
    path: ["imageAlt"],
  });

export type StudioSplitHeroProps = z.infer<typeof splitHeroSchema>;

export const splitHeroDefaults: StudioSplitHeroProps = {
  eyebrow: "Nyt studie",
  headline: "Håndlavet design, bygget til at holde",
  body: "Vi forener nordisk enkelhed med robust håndværk. Hver løsning skræddersys til dit rum — fra første skitse til færdig montering.",
  ctaLabel: "Book en samtale",
  ctaHref: "/kontakt",
  imageSrc: "/studio/split-hero.jpg",
  imageAlt: "Lyst værksted med trædetaljer og håndlavede møbler",
  reverse: false,
};

export function StudioSplitHero({
  eyebrow,
  headline,
  body,
  ctaLabel,
  ctaHref,
  imageSrc,
  imageAlt,
  reverse,
}: StudioSplitHeroProps) {
  const hasImage = !!imageSrc;
  const hasCta = !!ctaLabel && !!ctaHref;

  return (
    <StudioSection>
      <div
        className={cn(
          "grid items-center gap-10",
          hasImage && "lg:grid-cols-2",
        )}
      >
        <div
          className={cn(
            "max-w-xl",
            !hasImage && "mx-auto text-center",
            hasImage && reverse && "lg:order-2",
          )}
        >
          {eyebrow ? (
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
            {headline}
          </h2>
          <p className="mt-5 text-base sm:text-lg leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
            {body}
          </p>
          {hasCta ? (
            <div className={cn("mt-8", !hasImage && "flex justify-center")}>
              <StudioButtonLink href={ctaHref!} variant="secondary" size="lg">
                {ctaLabel}
              </StudioButtonLink>
            </div>
          ) : null}
        </div>

        {hasImage ? (
          <figure
            className={cn(
              "overflow-hidden rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-paper dark:bg-cw-stone-900/40",
              reverse && "lg:order-1",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- client-safe Studio catalog atom (Magic Builder); static/admin split-hero src sized via className, next/image intentionally not used here */}
            <img
              src={imageSrc}
              alt={imageAlt ?? ""}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </figure>
        ) : null}
      </div>
    </StudioSection>
  );
}
