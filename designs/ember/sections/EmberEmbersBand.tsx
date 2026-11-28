/**
 * Ember embers band — the edge-to-edge DARK section (taste rule 5: full-width
 * contrast bands give the page rhythm). An ink night-sky field of small
 * pulsing EmberSparks behind a 7/5 asymmetric split: narrative copy left,
 * a stacked feature list right.
 *
 * The pulse is pure CSS (opacity + scale, compositor-only) and gated behind
 * `prefers-reduced-motion: no-preference` — reduced motion sees a calm static
 * field. Light text uses the paper token with opacity modifiers, so the band
 * re-tones when the palette flips.
 *
 * Server component. Copy arrives via props (genome-mapped by the homepage)
 * with English defaults.
 */
import type { CSSProperties } from "react";
import { EmberSpark } from "./EmberSpark";

type EmberFrame = { title: string; body: string };

const DEFAULT_FRAMES: EmberFrame[] = [
  {
    title: "One spark, every page",
    body: "Six palette tokens carry the same warmth across home, shop and checkout — change them once and everything re-tones.",
  },
  {
    title: "Fast where it matters",
    body: "Server-rendered pages, lazy 3D, zero layout shift. The bloom never costs you the load time.",
  },
  {
    title: "Safe to hand over",
    body: "Owners edit copy, prices and pages in the admin — no code session needed to change a word.",
  },
];

/** Hand-placed field of small sparks — kept off the copy columns on desktop. */
const FIELD: Array<{ pos: CSSProperties; size: number; opacity: number; delay: string; duration: string }> = [
  { pos: { top: "10%", left: "4%" }, size: 30, opacity: 0.5, delay: "0s", duration: "5s" },
  { pos: { top: "22%", right: "8%" }, size: 22, opacity: 0.45, delay: "1.2s", duration: "6s" },
  { pos: { top: "6%", left: "46%" }, size: 16, opacity: 0.35, delay: "2s", duration: "4.6s" },
  { pos: { bottom: "14%", left: "10%" }, size: 18, opacity: 0.4, delay: "0.6s", duration: "5.6s" },
  { pos: { bottom: "8%", right: "20%" }, size: 26, opacity: 0.45, delay: "1.7s", duration: "6.4s" },
  { pos: { top: "48%", left: "30%" }, size: 12, opacity: 0.3, delay: "2.6s", duration: "5.2s" },
  { pos: { bottom: "30%", right: "4%" }, size: 14, opacity: 0.35, delay: "0.9s", duration: "4.8s" },
  { pos: { top: "64%", left: "2%" }, size: 12, opacity: 0.3, delay: "3.1s", duration: "5.8s" },
];

export function EmberEmbersBand({
  kicker,
  title,
  frames,
  kickerAttrs,
  titleAttrs,
}: {
  kicker?: string;
  title?: string;
  frames?: EmberFrame[];
  /** In-place-editing hooks (annotateEdit) — spread-attrs fra editAttr().
   *  Undefined/{} ⇒ byte-identisk render. */
  kickerAttrs?: Record<string, string>;
  titleAttrs?: Record<string, string>;
}) {
  const items = frames && frames.length > 0 ? frames : DEFAULT_FRAMES;
  return (
    <section className="relative isolate overflow-hidden bg-cw-ink py-24 sm:py-32">
      {/* Pulse keyframes — opacity + scale only, reduced-motion gated. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes ember-field-pulse {
            0%, 100% { opacity: var(--ember-field-o, 0.4); transform: scale(0.92); }
            50% { opacity: calc(var(--ember-field-o, 0.4) + 0.3); transform: scale(1.06); }
          }
          .ember-field-pulse { animation: ember-field-pulse var(--ember-field-dur, 5s) ease-in-out infinite; }
        }
      `}</style>

      {/* The ember field (decorative) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {FIELD.map((s, i) => (
          <div
            key={i}
            className="ember-field-pulse absolute"
            style={
              {
                ...s.pos,
                width: s.size,
                height: s.size,
                opacity: s.opacity,
                "--ember-field-o": s.opacity,
                "--ember-field-dur": s.duration,
                animationDelay: s.delay,
              } as CSSProperties
            }
          >
            <EmberSpark className="h-full w-full" />
          </div>
        ))}
        {/* A faint warm floor glow so the band feels lit from below */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background:
              "radial-gradient(60% 70% at 50% 110%, color-mix(in oklab, var(--color-cw-terracotta) 16%, transparent), transparent 75%)",
          }}
        />
      </div>

      {/* 7/5 asymmetric split */}
      <div className="mx-auto grid max-w-6xl gap-14 px-6 sm:px-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <p
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-cw-paper/60"
            {...kickerAttrs}
          >
            <EmberSpark className="size-4" />
            {kicker || "Under the hood"}
          </p>
          <h2
            className="mt-5 max-w-xl text-balance text-3xl font-semibold tracking-tight text-cw-paper sm:text-4xl md:text-5xl"
            {...titleAttrs}
          >
            {title || "A quiet engine keeps the fire."}
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-cw-paper/70">
            The warmth is the surface. Underneath sits the same engine that runs every page —
            database, checkout, admin and AI tools — so the soft look never goes soft on you.
          </p>
        </div>
        <div className="lg:col-span-5">
          <ul className="divide-y divide-cw-paper/10 border-y border-cw-paper/10">
            {items.map((frame, i) => (
              <li key={i} className="py-6">
                <h3 className="text-base font-semibold text-cw-paper">{frame.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cw-paper/65">{frame.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
