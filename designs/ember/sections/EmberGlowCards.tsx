/**
 * Ember glow cards — the value-props band. Rounded cream cards float on a
 * warm sand band, each lifted by a soft warm glow shadow (a terracotta
 * color-mix, so the glow re-tones with the palette) and led by the EmberSpark
 * "bloom" mark. The header row is deliberately asymmetric (taste rule 4):
 * copy left, a large bloom ornament right.
 *
 * Server component. Copy arrives via props (genome-mapped by the homepage)
 * with English defaults.
 */
import { EmberSpark } from "./EmberSpark";

type GlowCard = { title: string; body: string };

const DEFAULT_CARDS: GlowCard[] = [
  {
    title: "Describe, don't configure",
    body: "Say what you're making in plain words. Ember turns intent into working pages while the idea is still warm.",
  },
  {
    title: "Handmade by default",
    body: "Every surface ships with warmth built in — soft type, generous spacing, light that feels like evening sun.",
  },
  {
    title: "Yours all the way down",
    body: "Real code, real database, real ownership. Take it anywhere — the glow goes with you.",
  },
];

export function EmberGlowCards({
  title,
  intro,
  cards,
  titleAttrs,
  introAttrs,
}: {
  title?: string;
  intro?: string;
  cards?: GlowCard[];
  /** In-place-editing hooks (annotateEdit) — spread-attrs fra editAttr().
   *  Undefined/{} ⇒ byte-identisk render. */
  titleAttrs?: Record<string, string>;
  introAttrs?: Record<string, string>;
}) {
  const items = cards && cards.length > 0 ? cards : DEFAULT_CARDS;
  return (
    <section className="bg-cw-stone-100 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        {/* Asymmetric header: copy left, bloom ornament right */}
        <div className="flex items-end justify-between gap-8">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-cw-terracotta-strong">
              <EmberSpark className="size-4" />
              The glow
            </p>
            <h2
              className="mt-4 text-3xl font-semibold tracking-tight text-cw-ink sm:text-4xl"
              {...titleAttrs}
            >
              {title || "Why builders stay warm."}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-cw-stone-500" {...introAttrs}>
              {intro ||
                "Three small promises, kept on every page — so the site you launch still feels like the one you imagined."}
            </p>
          </div>
          <EmberSpark
            variant="bloom"
            className="hidden w-36 shrink-0 opacity-80 md:block lg:w-44"
          />
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((card, i) => (
            <article
              key={i}
              className="rounded-3xl bg-cw-paper p-8"
              style={{
                // Warm glow — terracotta mixed to transparency so it re-tones.
                boxShadow:
                  "0 8px 40px color-mix(in oklab, var(--color-cw-terracotta) 14%, transparent)",
              }}
            >
              <EmberSpark variant="bloom" className="size-11" />
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-cw-ink">
                {card.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-cw-stone-500">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
