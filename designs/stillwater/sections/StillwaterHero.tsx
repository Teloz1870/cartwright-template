/**
 * Stillwater hero — the full-viewport opening: "from noise to stillness".
 *
 * Layering (the section is `relative isolate`):
 *   -z-20  StillwaterScape variant="dawn" — the ALWAYS-painted generative
 *          landscape fallback (LCP-safe; the no-WebGL / reduced-data view).
 *   -z-10  ThreeHero scene="waves" intensity 0.5 — calm palette-graded water
 *          in the lower third, mask-faded into the Scape's lake. LiveCanvas
 *          self-gates on WebGL2 / prefers-reduced-motion / saveData and
 *          renders nothing when unsupported — the Scape's water remains.
 *    z-0   the copy block: mono eyebrow, huge Fraunces display headline,
 *          tagline, dual CTA.
 *
 * Server component. Palette-adaptive: every color reads the cw-* tokens, so
 * the hero re-tones under any brand palette via applyPaletteAsTheme.
 */
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { ThreeHero } from "@/components/ThreeHero";
import { StillwaterScape } from "./StillwaterScape";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

/** Split the headline so the final word renders as the italic accent. */
function splitHeadline(headline: string): { lead: string; accent: string } {
  const words = headline.trim().split(/\s+/);
  if (words.length < 2) return { lead: "", accent: headline.trim() };
  const accent = words.pop() as string;
  return { lead: words.join(" "), accent };
}

export function StillwaterHero(props: {
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
    <section className="relative isolate flex min-h-[100svh] overflow-hidden bg-cw-paper">
      {/* Scoped, reduced-motion-guarded entrance. Compositor-only, pure CSS. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes sw-hero-rise {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .sw-hero-rise { animation: sw-hero-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
        }
      `}</style>

      {/* Always-painted generative landscape (-z-20) — dawn over still water */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
        <StillwaterScape variant="dawn" />
      </div>

      {/* Live Canvas (-z-10): calm "waves" water across the lower third,
          mask-faded so it blends into the Scape's lake. Self-gating. */}
      {threeDEnabled !== false ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[36%]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent, black 42%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 42%)",
          }}
        >
          <ThreeHero scene="waves" intensity={intensity ?? 0.5} className="h-full w-full opacity-70" />
        </div>
      ) : null}

      {/* Copy block */}
      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-6 pb-44 pt-28 text-center sm:pb-52">
        <p className="sw-hero-rise font-mono text-xs font-medium uppercase tracking-[0.32em] text-cw-terracotta-strong">
          {eyebrow}
        </p>

        <h1
          className={`${display.className} sw-hero-rise mt-7 max-w-4xl text-balance text-5xl font-medium leading-[1.04] tracking-tight text-cw-ink sm:text-7xl md:text-8xl`}
          style={{ animationDelay: "110ms" }}
        >
          {lead}
          {lead ? " " : ""}
          <em className="font-normal italic text-cw-terracotta-strong">{accent}</em>
        </h1>

        <p
          className="sw-hero-rise mt-8 max-w-prose text-base leading-relaxed text-cw-stone-600 sm:text-lg"
          style={{ animationDelay: "220ms" }}
        >
          {tagline}
        </p>

        <div
          className="sw-hero-rise mt-11 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "330ms" }}
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
              className="inline-flex h-12 items-center justify-center rounded-full border border-cw-ink/20 bg-cw-paper/55 px-7 text-sm font-medium text-cw-ink backdrop-blur-sm transition-colors hover:border-cw-ink/40 hover:bg-cw-paper/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
