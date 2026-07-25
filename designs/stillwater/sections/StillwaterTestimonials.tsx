/**
 * StillwaterTestimonials — three quiet quotes with generative SVG
 * initials-avatars (zero photos, like everything in Stillwater). Each avatar
 * is a palette-tinted disc with the speaker's initials set in the serif —
 * deterministic, hand-tinted per slot, no external assets.
 *
 * Server component, CSS-only, palette-adaptive via cw-* tokens.
 */
import { Fraunces } from "next/font/google";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

// Palette-adaptive paint (FableButterfly fallback-chain convention).
const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";

type Testimonial = { quote: string; name: string; role: string };

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "The dashboards went quiet in week two. It took us a while to trust it — now quiet is just what good news looks like.",
    name: "Ingrid Solheim",
    role: "CTO, Fjordlight Energy",
  },
  {
    quote:
      "We didn't notice the cut-over happen. Forty services moved on a Tuesday and nobody's phone made a sound. That was the point.",
    name: "Marcus Hale",
    role: "VP Operations, Beacon Freight",
  },
  {
    quote:
      "Our Monday meetings got twenty minutes shorter. There was simply nothing left to firefight — we talk about the horizon now.",
    name: "Amara Osei",
    role: "Head of Platform, Stillgrove Health",
  },
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Three rotating tints so neighbouring avatars read distinct, all on-palette. */
const AVATAR_TINTS = [
  `color-mix(in oklab, ${ACCENT} 26%, ${CREAM})`,
  `color-mix(in oklab, ${ACCENT_DEEP} 34%, ${CREAM})`,
  `color-mix(in oklab, ${ACCENT} 16%, ${CREAM})`,
] as const;

function InitialsAvatar({ name, tintIndex }: { name: string; tintIndex: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className="size-12 shrink-0"
    >
      <circle cx="24" cy="24" r="23" fill={AVATAR_TINTS[tintIndex % AVATAR_TINTS.length]} />
      <circle
        cx="24"
        cy="24"
        r="23"
        fill="none"
        stroke={INK}
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <text
        x="24"
        y="24"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily='Georgia, "Times New Roman", serif'
        fontSize="17"
        fill={ACCENT_DEEP}
      >
        {initialsOf(name)}
      </text>
    </svg>
  );
}

export function StillwaterTestimonials(props: {
  kicker?: string;
  title?: string;
  testimonials?: Testimonial[];
}) {
  const kicker = props.kicker ?? "In their words";
  const title = props.title ?? "Teams that found the still water.";
  const testimonials =
    props.testimonials && props.testimonials.length > 0
      ? props.testimonials
      : DEFAULT_TESTIMONIALS;

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

        <div className="mt-16 grid gap-12 lg:grid-cols-3 lg:gap-10">
          {testimonials.map((t, i) => (
            <figure key={i} className="flex flex-col border-t border-cw-ink/15 pt-7">
              <blockquote
                className={`${display.className} flex-1 text-pretty text-xl font-normal leading-relaxed text-cw-ink`}
              >
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-8 flex items-center gap-4">
                <InitialsAvatar name={t.name} tintIndex={i} />
                <div>
                  <div className="text-sm font-medium text-cw-ink">{t.name}</div>
                  <div className="mt-0.5 font-mono text-xs uppercase tracking-[0.12em] text-cw-stone-500">
                    {t.role}
                  </div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
