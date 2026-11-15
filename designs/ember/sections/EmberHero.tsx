/**
 * Ember hero — the full-bleed warm-bloom opening. A Plus Jakarta Sans display
 * headline (one gradient-clipped accent word) floats over a pure-CSS gradient
 * MESH: layered radial gradients plus three slowly drifting gradient blobs.
 * The mesh re-tones with any palette because every mesh color is a
 * `color-mix(in oklab, var(--color-cw-terracotta) N%, …)` chain.
 *
 * Server Component. Layering (the section is `relative isolate`):
 *   -z-20  ALWAYS-painted CSS mesh + drifting blobs + two rising-ember sparks
 *          (LCP-safe; this is also the no-WebGL / reduced-data view)
 *   -z-10  optional ThreeHero "orb" Live-Canvas scene — rendered ONLY when the
 *          shop has the threeD flag on (threeD?.enabled); it self-gates WebGL2 /
 *          reduced motion / saveData and renders nothing when unsupported
 *    z-0   the copy block (h1 + tagline + CTAs)
 *
 * Motion is CSS-only: a staggered entrance rise + transform-only blob drift,
 * both gated behind `prefers-reduced-motion: no-preference`.
 */
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThreeHero } from "@/components/ThreeHero";
import { EmberSpark } from "./EmberSpark";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

/**
 * ONE warm amber constant (#ffb45c), mixed at low alpha into two mesh layers.
 * Documented exception to the all-token rule: the candle-warm undertone is the
 * signature of the bloom, and pure token mixes lose it under cool palettes.
 * At 10–22% alpha it tints without overpowering whatever palette is active.
 */
const AMBER = "#ffb45c";

/** Split the headline so the last word renders as the gradient accent. */
function splitHeadline(headline: string): { lead: string; accent: string } {
  const words = headline.trim().split(/\s+/);
  if (words.length < 2) return { lead: "", accent: headline.trim() };
  const accent = words.pop() as string;
  return { lead: words.join(" "), accent };
}

export function EmberHero(props: {
  eyebrow: string;
  headline: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  threeDEnabled?: boolean;
  intensity?: number;
  /** In-place-editing hooks (annotateEdit) — spread-attrs fra editAttr().
   *  Undefined/{} ⇒ byte-identisk render. */
  headlineAttrs?: Record<string, string>;
  taglineAttrs?: Record<string, string>;
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
    headlineAttrs,
    taglineAttrs,
  } = props;
  const { lead, accent } = splitHeadline(headline);

  return (
    <section className="relative isolate flex min-h-[92vh] overflow-hidden bg-cw-paper">
      {/* Scoped, reduced-motion-guarded entrance + drift. Pure CSS — no JS.
          Blob drift is transform-only (compositor thread, no layout/paint). */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes ember-hero-rise {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes ember-blob-a {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(4vw, -3vh) scale(1.08); }
          }
          @keyframes ember-blob-b {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-3vw, 4vh) scale(0.94); }
          }
          @keyframes ember-blob-c {
            0%, 100% { transform: translate(0, 0) scale(1.04); }
            50% { transform: translate(2.5vw, 2.5vh) scale(0.96); }
          }
          .ember-hero-rise { animation: ember-hero-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
          .ember-blob-a { animation: ember-blob-a 22s ease-in-out infinite; }
          .ember-blob-b { animation: ember-blob-b 26s ease-in-out infinite; }
          .ember-blob-c { animation: ember-blob-c 19s ease-in-out infinite; }
        }
      `}</style>

      {/* Mesh layer (-z-20): ALWAYS painted. Base wash + three drifting blobs
          + two rising-ember ornaments framing the copy column. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
        {/* Base mesh — every color is a token mix so the wash re-tones. */}
        <div
          className="absolute inset-0"
          style={{
            background: [
              `radial-gradient(50% 42% at 50% 30%, color-mix(in oklab, var(--color-cw-terracotta) 14%, transparent), transparent 72%)`,
              `radial-gradient(36% 30% at 14% 10%, color-mix(in oklab, ${AMBER} 20%, transparent), transparent 70%)`,
              `radial-gradient(44% 38% at 88% 76%, color-mix(in oklab, var(--color-cw-terracotta) 10%, transparent), transparent 72%)`,
              `radial-gradient(120% 95% at 50% 14%, var(--color-cw-paper) 38%, color-mix(in oklab, var(--color-cw-terracotta) 6%, var(--color-cw-paper)) 100%)`,
            ].join(", "),
          }}
        />
        {/* Drifting blobs — soft radial fills, transform-only drift. */}
        <div
          className="ember-blob-a absolute left-[6%] top-[8%] aspect-square w-[46vw] max-w-[640px] rounded-full"
          style={{
            background: `radial-gradient(closest-side, color-mix(in oklab, var(--color-cw-terracotta) 17%, transparent), transparent 72%)`,
          }}
        />
        <div
          className="ember-blob-b absolute right-[2%] top-[30%] aspect-square w-[52vw] max-w-[720px] rounded-full"
          style={{
            background: `radial-gradient(closest-side, color-mix(in oklab, ${AMBER} 15%, transparent), transparent 70%)`,
          }}
        />
        <div
          className="ember-blob-c absolute bottom-[-12%] left-[24%] aspect-square w-[44vw] max-w-[600px] rounded-full"
          style={{
            background: `radial-gradient(closest-side, color-mix(in oklab, var(--color-cw-terracotta-strong, var(--color-cw-terracotta)) 11%, transparent), transparent 72%)`,
          }}
        />
        {/* Rising embers framing the copy — kept clear of the text column. */}
        <EmberSpark
          variant="trail"
          className="absolute left-[5%] top-[14%] w-28 opacity-50 sm:w-36"
        />
        <EmberSpark
          variant="trail"
          className="absolute bottom-[12%] right-[6%] w-24 -scale-x-100 opacity-40 sm:w-32"
        />
      </div>

      {/* Live Canvas (-z-10): the warm orb — ONLY when the shop runs 3D. The
          mesh above stays painted underneath, so no-WebGL loses nothing. */}
      {threeDEnabled ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <ThreeHero scene="orb" intensity={intensity ?? 0.55} className="h-full w-full opacity-70" />
        </div>
      ) : null}

      {/* Copy block */}
      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-6 py-24 text-center sm:py-28">
        <p className="ember-hero-rise flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-cw-terracotta-strong">
          <EmberSpark className="size-4" />
          {eyebrow}
        </p>

        <h1
          className={`${display.className} ember-hero-rise mt-6 max-w-4xl text-balance text-5xl font-extrabold leading-[1.04] tracking-tight text-cw-ink sm:text-6xl md:text-7xl`}
          style={{ animationDelay: "90ms" }}
          {...headlineAttrs}
        >
          {lead}
          {lead ? " " : ""}
          {/* Gradient-clipped accent word — display-size only (the raw accent
              is never used for small text; eyebrows/links use accentDeep). */}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(92deg, var(--color-cw-terracotta), color-mix(in oklab, ${AMBER} 55%, var(--color-cw-terracotta)), var(--color-cw-terracotta-strong, var(--color-cw-terracotta)))`,
            }}
          >
            {accent}
          </span>
        </h1>

        <p
          className="ember-hero-rise mt-7 max-w-prose text-base leading-relaxed text-cw-stone-500 sm:text-lg"
          style={{ animationDelay: "180ms" }}
          {...taglineAttrs}
        >
          {tagline}
        </p>

        <div
          className="ember-hero-rise mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "270ms" }}
        >
          {/* Primary CTA: ink pill, cream text, warm glow shadow */}
          <Link
            href={ctaHref}
            className="inline-flex h-12 items-center justify-center rounded-full bg-cw-ink px-7 text-sm font-semibold text-cw-paper transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper"
            style={{
              boxShadow:
                "0 10px 32px color-mix(in oklab, var(--color-cw-terracotta) 30%, transparent)",
            }}
          >
            {ctaLabel}
          </Link>
          {secondaryLabel && secondaryHref ? (
            <Link
              href={secondaryHref}
              className="inline-flex h-12 items-center justify-center rounded-full border border-cw-ink/15 bg-cw-paper/60 px-7 text-sm font-medium text-cw-ink backdrop-blur-sm transition-colors hover:border-cw-ink/30 hover:bg-cw-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
