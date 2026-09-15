/**
 * Studio logo-cloud — "som set i" / partner-logo-stribe.
 *
 * Magic Builder catalog-atom (følger StudioTestimonials guld-standarden):
 *  - Client-safe: ren, SYNKRON, INGEN "use client", INGEN server-only deps,
 *    INGEN ReactNode-props (kun serialiserbare data — gemmes som JSON i
 *    Page.layoutJson). <img> bruges (ikke next/image).
 *  - Skema CO-LOCATED: atomet eksporterer selv sit Zod-schema + defaults, så
 *    section-registry læser fra ÉT sted.
 *  - Tokens: cw-stone-*, cw-terracotta, cw-paper (themes/studio.css) + dark:.
 *  - a11y: hvert <img> har alt + loading="lazy"; alt påkrævet når src er sat.
 *  - Understated: muteret titel + grayscale/opacity logoer, font-mono fallback.
 *  - Dansk default-copy.
 */
import { z } from "zod";
import { StudioSection } from "./StudioSection";

export const logoCloudSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    logos: z
      .array(
        z
          .object({
            name: z.string().min(1),
            src: z.string().optional(),
            href: z.string().optional(),
            alt: z.string().optional(),
          })
          .refine((o) => !o.src || !!o.alt || !!o.name, {
            message: "alt (or name) is required when src is set",
            path: ["alt"],
          }),
      )
      .min(1)
      .max(12),
  })
  .strict();

export type StudioLogoCloudProps = z.infer<typeof logoCloudSchema>;

export const logoCloudDefaults: StudioLogoCloudProps = {
  title: "Trusted by brands across the region",
  logos: [
    { name: "Nordlys" },
    { name: "Fjordby" },
    { name: "Klitgaard" },
    { name: "Harbourline & Co." },
    { name: "Havhuset" },
    { name: "Birk Studio" },
  ],
};

export function StudioLogoCloud({ eyebrow, title, logos }: StudioLogoCloudProps) {
  return (
    <StudioSection>
      <div className="text-center">
        {eyebrow ? (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <p className="mt-2 text-sm font-medium uppercase tracking-wide text-cw-stone-500 dark:text-cw-stone-400">
            {title}
          </p>
        ) : null}
      </div>
      <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 sm:gap-x-14">
        {logos.map((logo, i) => {
          const mark = logo.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- client-safe Studio catalog atom (Magic Builder); optional admin/remote logo URL of unknown dimensions, next/image intentionally not used here
            <img
              src={logo.src}
              alt={logo.alt || logo.name}
              loading="lazy"
              className="h-8 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
            />
          ) : (
            <span className="font-mono text-sm text-cw-stone-400 transition-colors hover:text-cw-stone-600 dark:text-cw-stone-500 dark:hover:text-cw-stone-300">
              {logo.name}
            </span>
          );
          return (
            <li key={i} className="flex items-center justify-center">
              {logo.href ? (
                <a
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper dark:focus-visible:ring-offset-cw-ink"
                >
                  {mark}
                </a>
              ) : (
                mark
              )}
            </li>
          );
        })}
      </ul>
    </StudioSection>
  );
}
