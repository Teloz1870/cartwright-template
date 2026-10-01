/**
 * StillwaterMetrics — three oversized proof points under hairline rules.
 *
 * Quiet authority through numbers: huge Fraunces figures, mono labels, a
 * hairline rule above each stat and acres of whitespace around everything.
 * Server component, CSS-only, palette-adaptive via cw-* tokens.
 */
import { Fraunces } from "next/font/google";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

type Stat = { value: string; label: string };

const DEFAULT_STATS: Stat[] = [
  { value: "99.99%", label: "Platform availability, four years running" },
  { value: "−74%", label: "Alert noise removed in the first quarter" },
  { value: "312", label: "Enterprises that switched to stillness" },
];

export function StillwaterMetrics(props: {
  kicker?: string;
  title?: string;
  stats?: Stat[];
}) {
  const kicker = props.kicker ?? "Proof";
  const title = props.title ?? "Calm you can measure.";
  const stats = props.stats && props.stats.length > 0 ? props.stats : DEFAULT_STATS;

  return (
    <section className="bg-cw-paper">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-cw-terracotta-strong">
            {kicker}
          </p>
          <h2
            className={`${display.className} mt-5 text-3xl font-medium tracking-tight text-cw-ink sm:text-4xl`}
          >
            {title}
          </h2>
        </div>

        <dl className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-10">
          {stats.map((stat, i) => (
            <div key={i} className="border-t border-cw-ink/15 pt-7">
              <dd
                className={`${display.className} order-first text-6xl font-normal tracking-tight text-cw-ink sm:text-7xl`}
              >
                {stat.value}
              </dd>
              <dt className="mt-4 font-mono text-xs uppercase leading-relaxed tracking-[0.14em] text-cw-stone-500">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
