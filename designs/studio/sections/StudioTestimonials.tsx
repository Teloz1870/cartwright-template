/**
 * Studio testimonials — citat-kort-grid (quote + forfatter + rolle).
 *
 * GULD-STANDARD for Magic Builder catalog-atomer:
 *  - Client-safe: ren, SYNKRON, INGEN server-only deps, INGEN ReactNode-props
 *    (kun serialiserbare data-props — gemmes som JSON i Page.layoutJson).
 *  - Skema CO-LOCATED: atomet eksporterer selv sit Zod-schema + defaults, så
 *    section-registry + registry-eksporten (Phase 4) læser fra ÉT sted.
 *  - Tokens: cw-stone-*, cw-terracotta, cw-paper (themes/studio.css) + dark:.
 *  - a11y: semantisk markup (figure/blockquote/figcaption), focus-visible arves.
 *  - Dansk default-copy.
 */
import { z } from "zod";
import { StudioSection, StudioSectionHeader } from "./StudioSection";

export const testimonialsSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    items: z
      .array(
        z.object({
          quote: z.string().min(1),
          author: z.string().min(1),
          role: z.string().optional(),
        }),
      )
      .min(1)
      .max(9),
  })
  .strict();

export type StudioTestimonialsProps = z.infer<typeof testimonialsSchema>;

export const testimonialsDefaults: StudioTestimonialsProps = {
  title: "Hvad kunderne siger",
  items: [
    { quote: "Bedste oplevelse jeg har haft online.", author: "Mette K.", role: "Verificeret køber" },
    { quote: "Hurtig levering og fantastisk kvalitet.", author: "Jonas P.", role: "Verificeret køber" },
    { quote: "Jeg anbefaler dem til alle mine venner.", author: "Sofie L.", role: "Verificeret køber" },
  ],
};

export function StudioTestimonials({
  eyebrow,
  title,
  description,
  items,
}: StudioTestimonialsProps) {
  return (
    <StudioSection>
      <StudioSectionHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t, i) => (
          <figure
            key={i}
            className="flex flex-col rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-paper dark:bg-cw-stone-900/40 p-6"
          >
            <blockquote className="flex-1 text-sm leading-relaxed text-cw-stone-700 dark:text-cw-stone-300">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-4 border-t border-cw-stone-200 dark:border-cw-stone-800 pt-4">
              <span className="block text-sm font-semibold text-cw-stone-900 dark:text-cw-stone-50">
                {t.author}
              </span>
              {t.role ? (
                <span className="block text-xs text-cw-stone-500 dark:text-cw-stone-400">
                  {t.role}
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </StudioSection>
  );
}
