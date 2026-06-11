/**
 * FableSafeguards — the safeguards story, told calmly.
 *
 * An editorial two-column section (not a warning box): the chrysalis motif —
 * power held safely — sits in a soft sand circle beside the prose, with three
 * quiet cards on the right covering the Opus 4.8 fallback, the red-teaming
 * record, and the restricted Mythos 5 sibling.
 *
 * Server component. Palette-adaptive: every color goes through the cw-* token
 * utilities (accent = cw-terracotta, cream = cw-paper, sand ≈ cw-stone-100,
 * muted ≈ cw-stone-500, ink = cw-ink) so the section renders in the Fable
 * palette via applyPaletteAsTheme — no hardcoded hexes here.
 */
import { FableButterfly } from "./FableButterfly";

// Fraunces display stack — resolved from the design's font variable, with the
// editorial-ink variable and plain serif as graceful fallbacks.
const displayFont = {
  fontFamily:
    'var(--font-fable-display, var(--font-fraunces, "Fraunces", Georgia, "Times New Roman", serif))',
} as const;

type SafeguardCard = {
  title: string;
  body: string;
};

type Props = {
  title?: string;
  intro?: string;
  cards?: SafeguardCard[];
};

const defaultCards: SafeguardCard[] = [
  {
    title: "Classifier guardrails",
    body: "Queries that touch cybersecurity, biology and chemistry, or model distillation are answered by Claude Opus 4.8 instead — a quiet hand-off that triggers in fewer than 5% of sessions.",
  },
  {
    title: "Battle-tested",
    body: "More than 1,000 hours of external red-teaming, and not one universal jailbreak found. The guardrails were pushed hard long before you ever met them.",
  },
  {
    title: "Mythos 5, held closer",
    body: "The same underlying model with some safeguards lifted exists as Claude Mythos 5 — restricted to cyberdefenders and infrastructure partners via Project Glasswing, with the US government, and selected biology researchers.",
  },
];

export function FableSafeguards({
  title = "Power, held gently",
  intro = "Fable 5 is a Mythos-class model made safe for general use. When a conversation turns toward cybersecurity, biology or chemistry, or distillation, it hands the question to Claude Opus 4.8 — and otherwise stays out of your way.",
  cards = defaultCards,
}: Props) {
  return (
    <section className="bg-cw-paper">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          {/* Left — chrysalis motif + prose */}
          <div className="max-w-xl">
            <div
              aria-hidden="true"
              className="inline-flex size-40 items-center justify-center rounded-full bg-cw-stone-100 ring-1 ring-cw-ink/5 sm:size-44"
            >
              <FableButterfly variant="chrysalis" className="size-24 sm:size-28" />
            </div>

            <p className="mt-10 font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
              Safeguards
            </p>
            <h2
              className="mt-3 text-3xl font-medium tracking-tight text-cw-ink sm:text-4xl"
              style={displayFont}
            >
              {title}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-cw-stone-500 sm:text-lg">
              {intro}
            </p>

            <p className="mt-8 border-t border-cw-ink/10 pt-5 font-mono text-xs leading-relaxed text-cw-stone-500">
              Fallback: Claude Opus 4.8 &middot; under 5% of sessions &middot;
              1,000+ hours of red-teaming
            </p>
          </div>

          {/* Right — three quiet cards */}
          <div className="flex flex-col gap-4">
            {cards.map((card) => (
              <article
                key={card.title}
                className="rounded-2xl border border-cw-ink/10 bg-cw-paper p-6 sm:p-7"
              >
                <div className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-cw-terracotta"
                  />
                  <h3 className="text-base font-semibold tracking-tight text-cw-ink">
                    {card.title}
                  </h3>
                </div>
                <p className="mt-2.5 pl-[1.125rem] text-sm leading-relaxed text-cw-stone-500">
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
