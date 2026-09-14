/**
 * Studio scroll-story — a scroll-driven cinematic product story (a Cartwright
 * **Pro** Part). A dark cinema stage with full-viewport "beats" whose copy
 * fades + glides in as it enters the viewport and out as it leaves, driven by
 * native CSS scroll-driven animation (`animation-timeline: view()`). Apple-
 * product-page storytelling, with NO JavaScript.
 *
 * Progressive enhancement: a scoped <style> defines the scrub + a
 * `@supports not (animation-timeline: view())` fallback (content fully visible)
 * + a reduced-motion guard — so the copy is always readable. Server component,
 * CSS-only. Palette accent = cw-terracotta (adapts to the active palette).
 */
import { z } from "zod";

const frameSchema = z.object({
  kicker: z.string().optional(),
  headline: z.string().min(1),
  body: z.string().min(1),
});

export const scrollStorySchema = z
  .object({
    eyebrow: z.string().optional(),
    frames: z.array(frameSchema).min(2).max(6),
  })
  .strict();

export type StudioScrollStoryProps = z.infer<typeof scrollStorySchema>;

export const scrollStoryDefaults: StudioScrollStoryProps = {
  eyebrow: "The story",
  frames: [
    {
      kicker: "Designed",
      headline: "Every detail, on purpose.",
      body: "Nothing here is an accident. Each line, each curve, each gram was argued over until it earned its place.",
    },
    {
      kicker: "Built",
      headline: "Made to outlast the trend.",
      body: "Materials chosen to age well, not to photograph well. The kind of thing you keep, not replace.",
    },
    {
      kicker: "Delivered",
      headline: "Yours in days, not weeks.",
      body: "Made to order, shipped fast, and backed for the long run. Premium without the wait.",
    },
  ],
};

export function StudioScrollStory({ eyebrow, frames }: StudioScrollStoryProps) {
  return (
    <section className="cw-story relative isolate overflow-clip bg-cw-ink text-white">
      <style>{`
        .cw-story { --cw-story-accent: var(--color-cw-terracotta, #c2630a); }
        .cw-story__bg {
          position: absolute; inset: 0; z-index: -1;
          background:
            radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--cw-story-accent) 22%, transparent), transparent 70%),
            radial-gradient(50% 40% at 80% 100%, color-mix(in oklab, var(--cw-story-accent) 14%, transparent), transparent 70%);
        }
        .cw-story__panel { min-block-size: 100svh; display: grid; place-items: center; padding-inline: 1.5rem; }
        .cw-story__frame { max-inline-size: 46rem; text-align: center; will-change: opacity, transform; }
        @keyframes cw-story-reveal {
          0%   { opacity: 0; transform: translateY(46px); filter: blur(6px); }
          22%, 78% { opacity: 1; transform: none; filter: blur(0); }
          100% { opacity: 0; transform: translateY(-46px); filter: blur(6px); }
        }
        @supports (animation-timeline: view()) {
          .cw-story__frame { animation: cw-story-reveal linear both; animation-timeline: view(); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cw-story__frame { animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important; }
        }
      `}</style>
      <div className="cw-story__bg" aria-hidden="true" />

      {eyebrow && (
        <div className="cw-story__panel" style={{ minBlockSize: "40svh" }}>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-white/60">{eyebrow}</p>
        </div>
      )}

      {frames.map((f, i) => (
        <div key={i} className="cw-story__panel">
          <div className="cw-story__frame">
            <span className="font-mono text-sm tracking-[0.16em] text-cw-terracotta">
              {String(i + 1).padStart(2, "0")} / {String(frames.length).padStart(2, "0")}
              {f.kicker ? ` · ${f.kicker.toUpperCase()}` : ""}
            </span>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
              {f.headline}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
              {f.body}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}
