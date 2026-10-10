/**
 * Studio marquee — a CSS-only infinite horizontal scroller for short phrases
 * (trust signals, keywords, "logos as text"). Two identical tracks translate
 * left in lockstep for a seamless loop; edges fade via a mask gradient; the
 * accent dots are cw-terracotta so they adopt the active palette.
 *
 * Client-safe (sync, presentational, NO client JS) — the motion is pure CSS,
 * injected via a scoped <style> so it works on any skin without a global
 * keyframe. Respects prefers-reduced-motion (pauses) and pauses on hover.
 * A Page-Mixer "Part".
 */
import { z } from "zod";

export const marqueeSchema = z
  .object({
    eyebrow: z.string().optional(),
    items: z.array(z.string().min(1)).min(2).max(24),
    speed: z.enum(["slow", "normal", "fast"]).default("normal"),
  })
  .strict();

export type StudioMarqueeProps = z.infer<typeof marqueeSchema>;

export const marqueeDefaults: StudioMarqueeProps = {
  eyebrow: "Trusted by teams everywhere",
  items: [
    "Fast delivery",
    "Secure checkout",
    "Made with care",
    "Sustainable materials",
    "5-star support",
    "30-day returns",
  ],
  speed: "normal",
};

const DURATION_S: Record<StudioMarqueeProps["speed"], number> = {
  slow: 44,
  normal: 28,
  fast: 16,
};

function Track({
  items,
  durationS,
  hidden,
}: {
  items: string[];
  durationS: number;
  hidden?: boolean;
}) {
  return (
    <ul
      aria-hidden={hidden}
      style={{ animationDuration: `${durationS}s` }}
      className="cw-marquee-track flex shrink-0 items-center gap-10 pr-10 hover:[animation-play-state:paused]"
    >
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-10 whitespace-nowrap">
          <span className="text-lg font-medium tracking-tight text-cw-stone-700 dark:text-cw-stone-200">
            {item}
          </span>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-cw-terracotta" />
        </li>
      ))}
    </ul>
  );
}

export function StudioMarquee({ eyebrow, items, speed }: StudioMarqueeProps) {
  const durationS = DURATION_S[speed];
  return (
    <section className="border-b border-cw-stone-200 bg-cw-paper py-12 dark:border-cw-stone-800 dark:bg-cw-stone-900/40">
      {/* Scoped, SSR-safe keyframe — no global CSS, so the Part is self-contained. */}
      <style>{`
        @keyframes cw-marquee { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        .cw-marquee-track { animation-name: cw-marquee; animation-timing-function: linear; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) { .cw-marquee-track { animation: none; } }
      `}</style>
      {eyebrow && (
        <p className="mb-8 text-center font-mono text-xs uppercase tracking-[0.16em] text-cw-stone-400">
          {eyebrow}
        </p>
      )}
      <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
        <Track items={items} durationS={durationS} />
        <Track items={items} durationS={durationS} hidden />
      </div>
    </section>
  );
}
