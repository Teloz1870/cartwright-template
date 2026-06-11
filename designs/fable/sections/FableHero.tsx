/**
 * Fable hero — the full-viewport ivory opening of the metamorphosis story page.
 * A Fraunces serif display headline floats over the "butterflies" Live-Canvas
 * flock; a static layer of FableButterfly SVGs over a cream→sand radial wash is
 * ALWAYS painted underneath, so the hero is LCP-safe and degrades gracefully
 * when WebGL is unavailable (LiveCanvas self-gates on capability / reduced
 * motion / saveData and renders nothing — the static flock remains).
 *
 * Server Component. Layering (the section is `relative isolate`):
 *   -z-20  always-painted fallback: radial wash + static butterflies (aria-hidden)
 *   -z-10  ThreeHero canvas, scene "butterflies" (aria-hidden, only when enabled)
 *    z-0   the copy block (h1 + tagline + CTAs)
 *
 * Palette-adaptive: every color goes through the cw-* tokens, so the hero
 * re-tints itself under any brand palette via applyPaletteAsTheme.
 */
import type { CSSProperties } from "react";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { ThreeHero } from "@/components/ThreeHero";
import { FableButterfly } from "./FableButterfly";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * The static fallback flock — positions/sizes/rotations are hand-placed so the
 * composition frames the headline without ever sitting behind the copy column
 * on desktop. `rotate` is mirrored into `--fable-rot` so the CSS drift keyframe
 * can preserve each butterfly's resting angle.
 */
const FLOCK: Array<{
  pos: CSSProperties;
  size: number;
  rotate: number;
  opacity: number;
  delay: string;
  duration: string;
}> = [
  { pos: { top: "14%", left: "9%" }, size: 84, rotate: -16, opacity: 0.55, delay: "0s", duration: "9s" },
  { pos: { top: "20%", right: "8%" }, size: 104, rotate: 12, opacity: 0.65, delay: "1.4s", duration: "11s" },
  { pos: { bottom: "26%", left: "17%" }, size: 56, rotate: 22, opacity: 0.4, delay: "2.2s", duration: "10s" },
  { pos: { top: "58%", right: "16%" }, size: 44, rotate: -26, opacity: 0.35, delay: "0.7s", duration: "8.5s" },
  { pos: { bottom: "12%", right: "32%" }, size: 68, rotate: 6, opacity: 0.5, delay: "1.1s", duration: "12s" },
];

/** Split the headline so the last word renders as the italic accent. */
function splitHeadline(headline: string): { lead: string; accent: string } {
  const words = headline.trim().split(/\s+/);
  if (words.length < 2) return { lead: "", accent: headline.trim() };
  const accent = words.pop() as string;
  return { lead: words.join(" "), accent };
}

export function FableHero(props: {
  eyebrow: string;
  headline: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  threeDEnabled?: boolean;
  intensity?: number;
}) {
  const {
    eyebrow,
    headline,
    tagline,
    ctaLabel,
    ctaHref,
    secondaryLabel,
    secondaryHref,
    threeDEnabled,
    intensity,
  } = props;
  const { lead, accent } = splitHeadline(headline);

  return (
    <section className="relative isolate flex min-h-[92vh] overflow-hidden bg-cw-paper">
      {/* Scoped, reduced-motion-guarded entrance + drift. Pure CSS — no JS. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes fable-hero-rise {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fable-hero-drift {
            0%, 100% { transform: translateY(0) rotate(var(--fable-rot, 0deg)); }
            50% { transform: translateY(-12px) rotate(calc(var(--fable-rot, 0deg) + 4deg)); }
          }
          .fable-hero-rise { animation: fable-hero-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
          .fable-hero-drift { animation: fable-hero-drift var(--fable-dur, 10s) ease-in-out infinite; }
        }
      `}</style>

      {/* Fallback layer (-z-20): cream→sand wash + a faint morpho bloom + the
          static flock. Always painted — the no-WebGL / reduced-motion view. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: [
              "radial-gradient(55% 42% at 50% 32%, color-mix(in oklab, var(--color-cw-terracotta) 8%, transparent), transparent 72%)",
              "radial-gradient(120% 90% at 50% 18%, var(--color-cw-paper) 36%, var(--color-cw-stone-100) 100%)",
            ].join(", "),
          }}
        />
        {FLOCK.map((b, i) => (
          <div
            key={i}
            className="fable-hero-drift absolute"
            style={
              {
                ...b.pos,
                width: b.size,
                height: b.size,
                opacity: b.opacity,
                transform: `rotate(${b.rotate}deg)`,
                "--fable-rot": `${b.rotate}deg`,
                "--fable-dur": b.duration,
                animationDelay: b.delay,
              } as CSSProperties
            }
          >
            <FableButterfly className="h-full w-full" />
          </div>
        ))}
      </div>

      {/* Live Canvas (-z-10): the instanced butterfly flock. ThreeHero is a
          dynamic ssr:false client island that self-gates WebGL2 / reduced
          motion / saveData — when it bails, the static layer above remains. */}
      {threeDEnabled !== false ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <ThreeHero scene="butterflies" intensity={intensity ?? 0.7} className="h-full w-full opacity-80" />
        </div>
      ) : null}

      {/* Copy block */}
      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-6 py-24 text-center sm:py-28">
        <p className="fable-hero-rise font-mono text-xs font-medium uppercase tracking-[0.28em] text-cw-terracotta">
          {eyebrow}
        </p>

        <h1
          className={`${display.className} fable-hero-rise mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-cw-ink sm:text-6xl md:text-7xl`}
          style={{ animationDelay: "90ms" }}
        >
          {lead}
          {lead ? " " : ""}
          <em className="font-normal italic text-cw-terracotta">{accent}</em>
        </h1>

        <p
          className="fable-hero-rise mt-7 max-w-prose text-base leading-relaxed text-cw-stone-500 sm:text-lg"
          style={{ animationDelay: "180ms" }}
        >
          {tagline}
        </p>

        <div
          className="fable-hero-rise mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "270ms" }}
        >
          <Link
            href={ctaHref}
            className="inline-flex h-12 items-center justify-center rounded-full bg-cw-terracotta px-7 text-sm font-medium text-cw-paper shadow-sm transition-colors hover:bg-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper"
          >
            {ctaLabel}
          </Link>
          {secondaryLabel && secondaryHref ? (
            <Link
              href={secondaryHref}
              className="inline-flex h-12 items-center justify-center rounded-full border border-cw-ink/15 px-7 text-sm font-medium text-cw-ink transition-colors hover:border-cw-ink/30 hover:bg-cw-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
