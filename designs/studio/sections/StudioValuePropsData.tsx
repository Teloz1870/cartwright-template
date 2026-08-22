/**
 * Studio value-props (DATA-ONLY variant for the Magic Builder).
 *
 * The original StudioValueProps takes `icon?: ReactNode` — not serializable to
 * Page.layoutJson. This variant takes a string ICON TOKEN (enum) mapped to an
 * inline SVG via a deterministic lookup, so props stay pure data. Same visual
 * card grid. Schema co-located (gold-standard pattern, see StudioTestimonials).
 */
import type { ReactElement } from "react";
import { z } from "zod";
import { StudioSection, StudioSectionHeader } from "./StudioSection";
import { cn } from "@/lib/utils";

/** Whitelisted icon tokens → inline SVG (24x24, currentColor, stroke). */
const ICON_TOKENS = [
  "spark",
  "shield",
  "truck",
  "leaf",
  "heart",
  "star",
  "bolt",
  "check",
  "globe",
  "clock",
] as const;
type IconToken = (typeof ICON_TOKENS)[number];

const ICON_PATHS: Record<IconToken, string> = {
  spark: "M12 3v4m0 10v4m9-9h-4M7 12H3m13.5-6.5L14 8m-4 8l-2.5 2.5m9 0L14 16m-4-8L7.5 5.5",
  shield: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z",
  truck: "M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 18a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z",
  leaf: "M5 19c0-8 6-13 14-13 0 8-6 13-14 13zm0 0c2-4 5-7 9-9",
  heart: "M12 20s-7-4.5-9.5-9A4.5 4.5 0 0112 5a4.5 4.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z",
  star: "M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 16.9 6.6 19.6l1.2-6L3.3 9.4l6.1-.8L12 3z",
  bolt: "M13 3L4 14h6l-1 7 9-11h-6l1-7z",
  check: "M5 13l4 4L19 7",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c3 3 3 15 0 18M3 12h18",
  clock: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
};

function Icon({ token }: { token: IconToken }): ReactElement {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d={ICON_PATHS[token]} />
    </svg>
  );
}

export const valuePropsSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    items: z
      .array(
        z.object({
          title: z.string().min(1),
          body: z.string().min(1),
          icon: z.enum(ICON_TOKENS).optional(),
        }),
      )
      .min(1)
      .max(6),
  })
  .strict();

export type StudioValuePropsDataProps = z.infer<typeof valuePropsSchema>;

export const valuePropsDefaults: StudioValuePropsDataProps = {
  title: "Derfor vælger kunderne os",
  items: [
    { title: "Hurtig levering", body: "Afsendt samme dag på hverdage.", icon: "truck" },
    { title: "Sikker betaling", body: "Krypteret checkout og køberbeskyttelse.", icon: "shield" },
    { title: "Topkvalitet", body: "Nøje udvalgte produkter, vi selv står inde for.", icon: "star" },
  ],
};

export function StudioValuePropsData({
  eyebrow,
  title,
  description,
  items,
  titleAttrs,
  descriptionAttrs,
}: StudioValuePropsDataProps & {
  /** In-place-editing hooks (annotateEdit) — IKKE en del af builder-Part-
   *  schemaet; rene render-props. Undefined ⇒ byte-identisk render. */
  titleAttrs?: Record<string, string>;
  descriptionAttrs?: Record<string, string>;
}) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        titleAttrs={titleAttrs}
        descriptionAttrs={descriptionAttrs}
      />
      <div
        className={cn(
          "mt-12 grid gap-5",
          items.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {items.map((p, i) => (
          <div
            key={i}
            className="rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-paper dark:bg-cw-stone-900/40 p-6"
          >
            {p.icon ? (
              <div className="inline-flex size-10 items-center justify-center rounded-md bg-cw-terracotta/10 text-cw-terracotta">
                <Icon token={p.icon} />
              </div>
            ) : null}
            <h3
              className={cn(
                "text-base font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50",
                p.icon && "mt-5",
              )}
            >
              {p.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </StudioSection>
  );
}
