/**
 * StillwaterPanels — four alternating full-bleed feature panels, each set on a
 * different time of day of the signature StillwaterScape (dawn → day → dusk →
 * night). The copy block alternates left/right; dark variants (dusk, night)
 * switch to cream type, and every panel paints a soft scrim gradient behind
 * its copy so text stays readable over the generative landscape.
 *
 * Genome-aware like FABLE: `genome?.featuresItems` (title/body) maps onto the
 * panels in order; the time-of-day kickers stay as the design's narrative
 * spine. Server component, CSS-only.
 */
import { Fraunces } from "next/font/google";
import { StillwaterScape, scapeIsDark, type ScapeVariant } from "./StillwaterScape";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

type Panel = { kicker: string; title: string; body: string };

const VARIANTS: ScapeVariant[] = ["dawn", "day", "dusk", "night"];

const DEFAULT_PANELS: Panel[] = [
  {
    kicker: "01 — Signal",
    title: "Hear only what matters",
    body: "Every queue, deploy and customer journey reports into one stream — and the platform quiets the rest. What reaches your team is signal, ranked and already correlated, never a wall of duplicate alarms.",
  },
  {
    kicker: "02 — Flow",
    title: "Work that moves like water",
    body: "Approvals, handovers and rollbacks run as calm, observable flows. No heroics, no war rooms — just processes that find their own level and keep moving while your people do deeper work.",
  },
  {
    kicker: "03 — Horizon",
    title: "See further, decide slower",
    body: "Capacity, cost and risk are projected weeks ahead on the same quiet dashboard. When you can see the weather coming, decisions stop being urgent — and start being good.",
  },
  {
    kicker: "04 — Rest",
    title: "Evenings belong to you again",
    body: "When the platform holds the night shift, nobody sleeps with a laptop by the bed. Incidents are contained, documented and — almost always — resolved before anyone is woken.",
  },
];

export function StillwaterPanels(props: {
  panels?: { title: string; body: string; kicker?: string }[];
}) {
  const panels: Panel[] =
    props.panels && props.panels.length > 0
      ? props.panels.map((p, i) => ({
          kicker: p.kicker ?? DEFAULT_PANELS[i]?.kicker ?? `0${i + 1}`,
          title: p.title,
          body: p.body,
        }))
      : DEFAULT_PANELS;

  return (
    <div>
      {panels.map((panel, i) => {
        const variant = VARIANTS[i % VARIANTS.length];
        const dark = scapeIsDark(variant);
        const alignRight = i % 2 === 1;
        const scrim = dark
          ? "color-mix(in oklab, var(--color-cw-ink) 52%, transparent)"
          : "color-mix(in oklab, var(--color-cw-paper) 62%, transparent)";

        return (
          <section
            key={i}
            className={`relative isolate flex min-h-[82svh] items-center overflow-hidden ${
              dark ? "bg-cw-ink" : "bg-cw-paper"
            }`}
          >
            {/* The generative landscape backdrop — a different hour per panel */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
              <StillwaterScape variant={variant} />
            </div>

            {/* Soft scrim behind the copy side, fading toward the open side */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background: `linear-gradient(to ${alignRight ? "left" : "right"}, ${scrim} 0%, ${scrim} 34%, transparent 72%)`,
              }}
            />

            <div className="mx-auto w-full max-w-6xl px-6 py-24">
              <div className={`max-w-xl ${alignRight ? "ml-auto text-left" : ""}`}>
                <p
                  className={`font-mono text-xs font-medium uppercase tracking-[0.28em] ${
                    dark ? "text-cw-paper/70" : "text-cw-terracotta-strong"
                  }`}
                >
                  {panel.kicker}
                </p>
                <h2
                  className={`${display.className} mt-5 text-balance text-4xl font-medium leading-[1.06] tracking-tight sm:text-5xl ${
                    dark ? "text-cw-paper" : "text-cw-ink"
                  }`}
                >
                  {panel.title}
                </h2>
                <p
                  className={`mt-6 max-w-prose text-base leading-relaxed sm:text-lg ${
                    dark ? "text-cw-paper/75" : "text-cw-stone-600"
                  }`}
                >
                  {panel.body}
                </p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
