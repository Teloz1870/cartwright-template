/**
 * Fable metamorphosis — the scroll-cinema launch timeline. Caterpillar →
 * chrysalis → butterfly as a metaphor for model generations, ending on
 * Fable 5. A LIGHT cinema: ivory stage, warm-charcoal type, one violet-blue
 * accent (all via palette-adaptive cw-* tokens — no hardcoded hexes).
 *
 * Mechanics are lifted verbatim from StudioScrollStory (scoped <style>,
 * native CSS scroll-driven animation, NO JavaScript): each text frame scrubs
 * in/out on its own `animation-timeline: view()`, while a sticky stage column
 * crossfades the three stage illustrations against a named view-timeline
 * (`timeline-scope` on the section root + `view-timeline` on the frames
 * column). Progressive enhancement throughout: in browsers without
 * scroll-driven animation the copy is fully visible and the stage rests on
 * the butterfly (the end of the story); `prefers-reduced-motion` gets the
 * same calm resting state. Server component, CSS-only.
 */
import { Fraunces } from "next/font/google";
import { FableButterfly } from "./FableButterfly";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fable-fraunces",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

type MetamorphosisFrame = { kicker: string; title: string; body: string };

const DEFAULT_FRAMES: MetamorphosisFrame[] = [
  {
    kicker: "Stage one — Larva",
    title: "First, the models learned to read the world",
    body: "Early generations were hungry the way larvae are hungry — consuming text, code, and images leaf by leaf, growing a little more capable with every shed skin.",
  },
  {
    kicker: "Stage two — Chrysalis",
    title: "Then, the long quiet of training",
    body: "Scale and refinement happen out of sight. Inside the chrysalis nothing appears to move, yet everything is being rearranged — longer context, deeper reasoning, sharper judgement.",
  },
  {
    kicker: "Stage three — Imago",
    title: "Fable 5 emerges",
    body: "Anthropic's most capable generally available model — a Mythos-class model made safe for general use, and state-of-the-art on nearly all tested AI benchmarks.",
  },
];

/** Generative line-art caterpillar — segmented body on a dotted ground. */
function LarvaIllustration() {
  const segments: Array<[number, number, number]> = [
    [62, 214, 15],
    [90, 207, 17],
    [120, 200, 19],
    [152, 196, 20],
    [184, 198, 20],
    [214, 204, 19],
  ];
  return (
    <svg viewBox="0 0 320 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* dotted ground line */}
      <line
        x1="36" y1="236" x2="284" y2="236"
        stroke="color-mix(in oklab, var(--color-cw-ink) 24%, transparent)"
        strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 9"
      />
      {/* legs — short strokes under the forward segments */}
      {[120, 152, 184, 214].map((x) => (
        <g key={x} stroke="color-mix(in oklab, var(--color-cw-ink) 60%, transparent)" strokeWidth="1.5" strokeLinecap="round">
          <line x1={x - 6} y1={x === 120 ? 217 : 214} x2={x - 9} y2={230} />
          <line x1={x + 6} y1={x === 120 ? 217 : 214} x2={x + 9} y2={230} />
        </g>
      ))}
      {/* body segments, tail → head */}
      {segments.map(([cx, cy, r]) => (
        <circle
          key={cx} cx={cx} cy={cy} r={r}
          fill="color-mix(in oklab, var(--color-cw-terracotta) 8%, var(--color-cw-paper))"
          stroke="color-mix(in oklab, var(--color-cw-ink) 78%, transparent)"
          strokeWidth="1.5"
        />
      ))}
      {/* head — slightly warmer tint */}
      <circle
        cx="243" cy="207" r="16"
        fill="color-mix(in oklab, var(--color-cw-terracotta) 16%, var(--color-cw-paper))"
        stroke="color-mix(in oklab, var(--color-cw-ink) 78%, transparent)"
        strokeWidth="1.5"
      />
      {/* antennae */}
      <path
        d="M248 193 C 252 184, 258 177, 264 171 M239 192 C 240 183, 242 175, 246 167"
        fill="none" stroke="color-mix(in oklab, var(--color-cw-ink) 70%, transparent)"
        strokeWidth="1.5" strokeLinecap="round"
      />
      <circle cx="264" cy="170" r="2.2" fill="var(--color-cw-terracotta)" />
      <circle cx="246" cy="166" r="2.2" fill="var(--color-cw-terracotta)" />
      {/* eye */}
      <circle cx="249" cy="204" r="2.6" fill="var(--color-cw-ink)" />
      {/* spiracle dots — the accent rhythm along the back */}
      {[
        [62, 196], [90, 187], [120, 178], [152, 173], [184, 175], [214, 182],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="2.5" fill="var(--color-cw-terracotta)" />
      ))}
    </svg>
  );
}

/** Generative line-art chrysalis — hanging from a branch, wing forming inside. */
function ChrysalisIllustration() {
  return (
    <svg viewBox="0 0 320 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* branch + offshoot */}
      <path
        d="M28 36 C 100 24, 210 24, 292 40"
        fill="none" stroke="color-mix(in oklab, var(--color-cw-ink) 72%, transparent)"
        strokeWidth="2" strokeLinecap="round"
      />
      <path
        d="M204 28 C 216 20, 228 17, 240 19"
        fill="none" stroke="color-mix(in oklab, var(--color-cw-ink) 50%, transparent)"
        strokeWidth="1.5" strokeLinecap="round"
      />
      {/* silk thread */}
      <line
        x1="160" y1="31" x2="160" y2="56"
        stroke="color-mix(in oklab, var(--color-cw-ink) 55%, transparent)" strokeWidth="1.5"
      />
      {/* inner glow — something luminous is taking shape */}
      <ellipse cx="160" cy="132" rx="27" ry="46" fill="color-mix(in oklab, var(--color-cw-terracotta) 16%, transparent)" />
      {/* shell */}
      <path
        d="M160 56 C 185 64, 197 92, 195 124 C 193 162 181 198 160 224 C 139 198 127 162 125 124 C 123 92 135 64 160 56 Z"
        fill="color-mix(in oklab, var(--color-cw-terracotta) 9%, var(--color-cw-paper))"
        stroke="color-mix(in oklab, var(--color-cw-ink) 75%, transparent)"
        strokeWidth="1.5" strokeLinejoin="round"
      />
      {/* folded wing, visible through the shell */}
      <path
        d="M157 92 C 144 100, 137 120, 142 142 C 152 134, 158 114, 157 92 Z"
        fill="color-mix(in oklab, var(--color-cw-terracotta) 30%, transparent)"
      />
      {/* facet bands */}
      <g fill="none" stroke="color-mix(in oklab, var(--color-cw-ink) 30%, transparent)" strokeWidth="1.2">
        <path d="M129 104 C 148 112, 172 112, 191 104" />
        <path d="M127 128 C 148 136, 172 136, 193 128" />
        <path d="M130 152 C 150 159, 170 159, 190 152" />
      </g>
      {/* abdominal ridges near the tip */}
      <g fill="none" stroke="color-mix(in oklab, var(--color-cw-ink) 38%, transparent)" strokeWidth="1.2">
        <path d="M142 182 C 154 187, 166 187, 178 182" />
        <path d="M147 197 C 156 201, 164 201, 173 197" />
        <path d="M152 210 C 157 213, 163 213, 168 210" />
      </g>
      {/* central seam */}
      <path
        d="M160 60 C 162 112, 162 170, 160 220"
        fill="none" stroke="color-mix(in oklab, var(--color-cw-ink) 18%, transparent)" strokeWidth="1"
      />
    </svg>
  );
}

export function FableMetamorphosis(props: {
  title?: string;
  kicker?: string;
  frames?: { kicker: string; title: string; body: string }[];
  /** In-place-editing hooks (annotateEdit) — spread-attrs fra editAttr().
   *  Undefined/{} ⇒ byte-identisk render. */
  kickerAttrs?: Record<string, string>;
  titleAttrs?: Record<string, string>;
}) {
  const { kickerAttrs, titleAttrs } = props;
  const kicker = props.kicker ?? "The metamorphosis";
  const title = props.title ?? "Every generation, a transformation";
  const frames = props.frames && props.frames.length > 0 ? props.frames : DEFAULT_FRAMES;

  return (
    <section className={`fb-meta relative isolate overflow-clip bg-cw-paper text-cw-ink ${display.variable}`}>
      <style>{`
        .fb-meta { timeline-scope: --fb-meta-track; }
        .fb-meta__title,
        .fb-meta__frame-title { font-family: var(--font-fable-fraunces), Georgia, "Times New Roman", serif; }

        /* ── Sticky stage ──────────────────────────────────────────────── */
        /* Mobile: the stage is a sticky strip pinned to the viewport top;
           frames slide beneath it. Desktop: a full-height sticky column. */
        .fb-meta__cinema { position: relative; }
        .fb-meta__stage-col {
          position: sticky; inset-block-start: 0; z-index: 2;
          block-size: 46svh;
          background: linear-gradient(to bottom, var(--color-cw-paper) 84%, transparent);
        }
        .fb-meta__stage { position: relative; block-size: 100%; display: grid; place-items: center; }
        .fb-meta__stage-bg {
          position: absolute; inset: 0; z-index: -1;
          background:
            radial-gradient(46% 38% at 50% 46%, color-mix(in oklab, var(--color-cw-terracotta) 11%, transparent), transparent 70%),
            radial-gradient(30% 26% at 64% 60%, color-mix(in oklab, var(--color-cw-terracotta-strong) 7%, transparent), transparent 70%);
        }
        .fb-meta__ring {
          position: absolute; inline-size: clamp(13rem, 44svh, 27rem); aspect-ratio: 1;
          border: 1px dashed color-mix(in oklab, var(--color-cw-ink) 16%, transparent);
          border-radius: 50%;
        }
        .fb-meta__layer {
          grid-area: 1 / 1; display: grid; justify-items: center; gap: 0.875rem;
          opacity: 0; /* default: only the imago shows (the end of the story) */
        }
        .fb-meta__layer--imago { opacity: 1; }
        .fb-meta__visual { inline-size: clamp(9.5rem, 32svh, 21rem); }
        .fb-meta__visual svg { display: block; inline-size: 100%; block-size: auto; }
        @media (min-width: 64rem) {
          .fb-meta__cinema { display: grid; grid-template-columns: 1.05fr 1fr; }
          .fb-meta__stage-col { position: static; block-size: auto; background: none; }
          .fb-meta__stage { position: sticky; inset-block-start: 0; block-size: 100svh; }
        }

        /* ── Text frames ───────────────────────────────────────────────── */
        .fb-meta__frames { view-timeline: --fb-meta-track block; }
        .fb-meta__panel {
          min-block-size: 100svh; display: grid; place-items: center;
          padding-inline: 1.5rem; padding-block-start: 46svh;
        }
        .fb-meta__frame { max-inline-size: 30rem; will-change: opacity, transform; }
        @media (min-width: 64rem) {
          .fb-meta__panel { padding-block-start: 0; }
        }

        /* ── Scroll-driven scrub (progressive enhancement) ─────────────── */
        @keyframes fb-meta-reveal {
          0%   { opacity: 0; transform: translateY(46px); filter: blur(6px); }
          22%, 78% { opacity: 1; transform: none; filter: blur(0); }
          100% { opacity: 0; transform: translateY(-46px); filter: blur(6px); }
        }
        @keyframes fb-meta-larva {
          0%, 24%   { opacity: 1; transform: none; filter: none; }
          34%, 100% { opacity: 0; transform: translateY(-26px) scale(0.92); filter: blur(5px); }
        }
        @keyframes fb-meta-chrysalis {
          0%, 26%   { opacity: 0; transform: translateY(30px) scale(0.94); filter: blur(5px); }
          36%, 56%  { opacity: 1; transform: none; filter: none; }
          66%, 100% { opacity: 0; transform: translateY(-26px) scale(0.96); filter: blur(5px); }
        }
        @keyframes fb-meta-imago {
          0%, 58%   { opacity: 0; transform: translateY(34px) scale(0.9); filter: blur(6px); }
          72%, 100% { opacity: 1; transform: none; filter: none; }
        }
        @supports (animation-timeline: view()) {
          .fb-meta__frame { animation: fb-meta-reveal linear both; animation-timeline: view(); }
        }
        @supports (timeline-scope: --fb-meta-track) and (animation-timeline: view()) {
          .fb-meta__layer { will-change: opacity, transform; animation-timeline: --fb-meta-track; }
          .fb-meta__layer--larva     { animation: fb-meta-larva linear both;     animation-timeline: --fb-meta-track; }
          .fb-meta__layer--chrysalis { animation: fb-meta-chrysalis linear both; animation-timeline: --fb-meta-track; }
          .fb-meta__layer--imago     { animation: fb-meta-imago linear both;     animation-timeline: --fb-meta-track; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fb-meta__frame, .fb-meta__layer { animation: none !important; transform: none !important; filter: none !important; }
          .fb-meta__frame { opacity: 1 !important; }
        }
      `}</style>

      {/* Section header */}
      <div className="mx-auto max-w-3xl px-6 pt-24 pb-10 text-center sm:pt-32">
        <p
          className="font-mono text-xs uppercase tracking-[0.24em] text-cw-terracotta"
          {...kickerAttrs}
        >
          {kicker}
        </p>
        <h2
          className="fb-meta__title mt-5 text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl"
          {...titleAttrs}
        >
          {title}
        </h2>
      </div>

      <div className="fb-meta__cinema">
        {/* Sticky stage — the three stage illustrations crossfade per beat */}
        <div className="fb-meta__stage-col">
          <div className="fb-meta__stage" aria-hidden="true">
            <div className="fb-meta__stage-bg" />
            <div className="fb-meta__ring" />

            <div className="fb-meta__layer fb-meta__layer--larva">
              <div className="fb-meta__visual"><LarvaIllustration /></div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-cw-stone-500">01 · Larva</p>
            </div>

            <div className="fb-meta__layer fb-meta__layer--chrysalis">
              <div className="fb-meta__visual"><ChrysalisIllustration /></div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-cw-stone-500">02 · Chrysalis</p>
            </div>

            <div className="fb-meta__layer fb-meta__layer--imago">
              <div className="fb-meta__visual"><FableButterfly /></div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-cw-stone-500">03 · Imago</p>
            </div>
          </div>
        </div>

        {/* Scrolling text frames */}
        <div className="fb-meta__frames">
          {frames.map((f, i) => (
            <div key={i} className="fb-meta__panel">
              <div className="fb-meta__frame">
                <span className="font-mono text-sm tracking-[0.16em] text-cw-terracotta">
                  {String(i + 1).padStart(2, "0")} / {String(frames.length).padStart(2, "0")}
                  {f.kicker ? ` · ${f.kicker.toUpperCase()}` : ""}
                </span>
                <h3 className="fb-meta__frame-title mt-5 text-3xl font-medium leading-[1.08] tracking-tight text-cw-ink sm:text-5xl">
                  {f.title}
                </h3>
                <p className="mt-6 text-lg leading-relaxed text-cw-stone-600 sm:text-xl">
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
