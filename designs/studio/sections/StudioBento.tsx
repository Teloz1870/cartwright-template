/**
 * Studio bento — premium asymmetric tile grid. The first tile is "featured"
 * (large, accent-tinted gradient, light text); the rest are paper tiles with a
 * hairline border + accent kicker. A modern marketing layout that reads as
 * premium on any palette-adaptive skin — the accent is cw-terracotta, which
 * paletteToFullThemeCss maps to the active design/Voice palette, so a green
 * Voice → green bento, a navy skin → navy bento.
 *
 * Client-safe (sync, presentational, prop-driven) → satisfies the
 * section-registry contract. A Page-Mixer "Part".
 */
import { z } from "zod";
import { StudioSection, StudioSectionHeader } from "./StudioSection";

export const bentoSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    tiles: z
      .array(
        z.object({
          kicker: z.string().optional(),
          title: z.string().min(1),
          body: z.string().min(1),
        }),
      )
      .min(3)
      .max(7),
  })
  .strict();

export type StudioBentoProps = z.infer<typeof bentoSchema>;

export const bentoDefaults: StudioBentoProps = {
  eyebrow: "Why us",
  title: "Everything in one tidy grid",
  description:
    "A flexible bento layout — lead with the headline tile, then let the supporting points fall into place.",
  tiles: [
    {
      kicker: "The big idea",
      title: "Built to feel premium from day one",
      body: "A featured tile anchors the grid. Use it for the one thing you most want people to remember.",
    },
    { kicker: "Fast", title: "Quick to set up", body: "Drop it onto any page and it adopts your palette." },
    { kicker: "Flexible", title: "Three to seven tiles", body: "Add only the points you actually need." },
    { kicker: "On-brand", title: "Adapts to your colours", body: "The accent follows your active palette." },
    { kicker: "Responsive", title: "Looks right everywhere", body: "Reflows cleanly from mobile to desktop." },
  ],
};

export function StudioBento({ eyebrow, title, description, tiles }: StudioBentoProps) {
  const [featured, ...rest] = tiles;
  return (
    <StudioSection>
      {title && (
        <StudioSectionHeader eyebrow={eyebrow} title={title} description={description} />
      )}
      <div className="mt-12 grid auto-rows-[minmax(11rem,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Featured tile — accent gradient, spans 2 cols + 2 rows on desktop. */}
        <article className="relative flex flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-cw-terracotta to-cw-terracotta-strong p-7 text-white sm:col-span-2 lg:row-span-2">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
          {featured.kicker && (
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-white/80">
              {featured.kicker}
            </p>
          )}
          <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {featured.title}
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85">{featured.body}</p>
        </article>
        {rest.map((t) => (
          <article
            key={t.title}
            className="flex flex-col rounded-2xl border border-cw-stone-200 bg-cw-paper p-6 transition-colors hover:border-cw-terracotta/40 dark:border-cw-stone-800 dark:bg-cw-stone-900/40"
          >
            {t.kicker && (
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
                {t.kicker}
              </p>
            )}
            <h3 className="mt-2 text-base font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
              {t.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
              {t.body}
            </p>
          </article>
        ))}
      </div>
    </StudioSection>
  );
}
