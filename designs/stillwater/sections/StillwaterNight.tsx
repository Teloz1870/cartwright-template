/**
 * StillwaterNight — "While you rest": an ink night panel where CSS-twinkle
 * stars hang over a mono incident timeline. The quietest proof the design
 * makes: four timestamped rows of the platform handling a night incident
 * end-to-end while the team sleeps.
 *
 * Motion: opacity-only star twinkle inside a scoped <style>, guarded by
 * `prefers-reduced-motion: no-preference` (static, still-visible stars are the
 * baseline). Server component; palette-adaptive via cw-* tokens (the night is
 * cw-ink, the stars and type are cw-paper).
 */
import type { CSSProperties } from "react";
import { Fraunces } from "next/font/google";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

/** Hand-placed star field: position, size, twinkle delay + duration. */
const STARS: Array<{ pos: CSSProperties; size: number; delay: string; duration: string }> = [
  { pos: { top: "12%", left: "8%" }, size: 3, delay: "0s", duration: "4.2s" },
  { pos: { top: "22%", left: "18%" }, size: 2, delay: "1.1s", duration: "5.6s" },
  { pos: { top: "9%", left: "31%" }, size: 2, delay: "2.3s", duration: "4.8s" },
  { pos: { top: "28%", left: "42%" }, size: 3, delay: "0.6s", duration: "6.1s" },
  { pos: { top: "14%", left: "55%" }, size: 2, delay: "1.8s", duration: "4.4s" },
  { pos: { top: "31%", left: "64%" }, size: 2, delay: "3.1s", duration: "5.2s" },
  { pos: { top: "10%", left: "72%" }, size: 3, delay: "0.9s", duration: "4.9s" },
  { pos: { top: "24%", left: "84%" }, size: 2, delay: "2.6s", duration: "5.8s" },
  { pos: { top: "8%", left: "92%" }, size: 2, delay: "1.4s", duration: "4.6s" },
  { pos: { top: "38%", left: "12%" }, size: 2, delay: "2s", duration: "6.4s" },
  { pos: { top: "42%", left: "33%" }, size: 2, delay: "0.3s", duration: "5s" },
  { pos: { top: "36%", left: "50%" }, size: 2, delay: "3.5s", duration: "4.3s" },
  { pos: { top: "44%", left: "76%" }, size: 2, delay: "1.6s", duration: "5.4s" },
  { pos: { top: "40%", left: "93%" }, size: 3, delay: "2.9s", duration: "6s" },
];

type TimelineRow = { time: string; event: string; outcome: string };

const DEFAULT_ROWS: TimelineRow[] = [
  { time: "02:47:12", event: "Latency anomaly detected on the payment queue", outcome: "Contained" },
  { time: "02:47:53", event: "Traffic rerouted to the standby region", outcome: "Automatic" },
  { time: "02:51:08", event: "Root cause isolated — a degraded cache node retired", outcome: "Resolved" },
  { time: "07:30:00", event: "One-line summary waiting in the morning digest", outcome: "Nobody woken" },
];

export function StillwaterNight(props: {
  kicker?: string;
  title?: string;
  intro?: string;
  rows?: TimelineRow[];
}) {
  const kicker = props.kicker ?? "While you rest";
  const title = props.title ?? "The platform keeps watch.";
  const intro =
    props.intro ??
    "A night in production, as it actually happened — handled, documented and closed before the first coffee.";
  const rows = props.rows && props.rows.length > 0 ? props.rows : DEFAULT_ROWS;

  return (
    <section className="relative isolate overflow-hidden bg-cw-ink">
      {/* Scoped, reduced-motion-guarded twinkle (opacity only — compositor-safe).
          Without the media query the stars simply rest at their base opacity. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes sw-night-twinkle {
            0%, 100% { opacity: 0.25; }
            50% { opacity: 0.95; }
          }
          .sw-night-star { animation: sw-night-twinkle var(--sw-star-dur, 5s) ease-in-out infinite; }
        }
      `}</style>

      {/* Star field */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="sw-night-star absolute rounded-full bg-cw-paper opacity-60"
            style={
              {
                ...star.pos,
                width: star.size,
                height: star.size,
                animationDelay: star.delay,
                "--sw-star-dur": star.duration,
              } as CSSProperties
            }
          />
        ))}
        {/* A faint horizon glow grounding the panel */}
        <div
          className="absolute inset-x-0 bottom-0 h-40"
          style={{
            background:
              "linear-gradient(to top, color-mix(in oklab, var(--color-cw-terracotta) 14%, transparent), transparent)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-cw-paper/60">
            {kicker}
          </p>
          <h2
            className={`${display.className} mt-5 text-4xl font-medium tracking-tight text-cw-paper sm:text-5xl`}
          >
            {title}
          </h2>
          <p className="mt-5 max-w-prose text-base leading-relaxed text-cw-paper/65 sm:text-lg">
            {intro}
          </p>
        </div>

        {/* Mono incident timeline */}
        <ol className="mt-16 max-w-3xl font-mono text-sm">
          {rows.map((row, i) => (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 border-t border-cw-paper/15 py-5 sm:grid-cols-[7.5rem_1fr_auto] sm:items-baseline"
            >
              <span className="tabular-nums text-cw-paper/55">{row.time}</span>
              <span className="text-cw-paper/90">{row.event}</span>
              <span className="col-start-2 text-xs uppercase tracking-[0.18em] text-cw-paper/45 sm:col-start-3 sm:text-right">
                {row.outcome}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-10 max-w-3xl border-t border-cw-paper/15 pt-5 font-mono text-xs leading-relaxed text-cw-paper/40">
          Full transcript in the morning digest &middot; zero pages sent &middot; on-call slept through
        </p>
      </div>
    </section>
  );
}
