/**
 * Studio quote — stort centreret pull-quote (citat + valgfri forfatter + rolle).
 *
 * Magic Builder catalog-atom (følger StudioTestimonials guld-standarden):
 *  - Client-safe: ren, SYNKRON, INGEN server-only deps, INGEN ReactNode-props
 *    (kun serialiserbare data-props — gemmes som JSON i Page.layoutJson).
 *  - Skema CO-LOCATED: atomet eksporterer selv sit Zod-schema + defaults, så
 *    section-registry + registry-eksporten læser fra ÉT sted.
 *  - Tokens: cw-stone-*, cw-terracotta, cw-paper (themes/studio.css) + dark:.
 *  - a11y: semantisk markup (figure/blockquote/figcaption).
 *  - Dansk default-copy.
 */
import { z } from "zod";
import { StudioSection } from "./StudioSection";

export const quoteSchema = z
  .object({
    quote: z.string().min(1),
    author: z.string().optional(),
    role: z.string().optional(),
  })
  .strict();

export type StudioQuoteProps = z.infer<typeof quoteSchema>;

export const quoteDefaults: StudioQuoteProps = {
  quote:
    "We moved to Cartwright and got a shop that feels personal and runs flawlessly. Best decision we made this year.",
  author: "Mette Krogh",
  role: "Indehaver, Nordlys Keramik",
};

export function StudioQuote({ quote, author, role }: StudioQuoteProps) {
  return (
    <StudioSection>
      <figure className="mx-auto max-w-3xl text-center">
        <blockquote className="text-2xl sm:text-3xl font-medium leading-snug text-cw-stone-900 dark:text-cw-stone-50">
          &ldquo;{quote}&rdquo;
        </blockquote>
        {(author || role) && (
          <figcaption className="mt-8">
            {author ? (
              <span className="block text-base font-semibold text-cw-stone-900 dark:text-cw-stone-50">
                {author}
              </span>
            ) : null}
            {role ? (
              <span className="block text-sm text-cw-stone-500 dark:text-cw-stone-400">
                {role}
              </span>
            ) : null}
          </figcaption>
        )}
      </figure>
    </StudioSection>
  );
}
