/**
 * Studio feature-split — to-spalters layout med tekst + punktliste (terracotta
 * fluebens) på den ene side og et billede på den anden. `reverse` bytter
 * rækkefølgen på lg. Co-located zod-schema + defaults; ren synkron komponent.
 */
import { z } from "zod";
import { StudioSection } from "./StudioSection";
import { cn } from "@/lib/utils";

export const featureSplitSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    body: z.string().min(1),
    bullets: z.array(z.string().min(1)).min(1).max(6),
    imageSrc: z.string().optional(),
    imageAlt: z.string().optional(),
    reverse: z.boolean().optional(),
  })
  .strict()
  .refine((o) => !o.imageSrc || !!o.imageAlt, {
    message: "imageAlt is required when imageSrc is set",
    path: ["imageAlt"],
  });
export type StudioFeatureSplitProps = z.infer<typeof featureSplitSchema>;

export const featureSplitDefaults: StudioFeatureSplitProps = {
  eyebrow: "How we work",
  title: "A studio built on craft and care",
  body: "We look after the whole journey — from first sketch to final delivery. You get one point of contact, a considered process, and a result that lasts for years.",
  bullets: [
    "Personal guidance from start to finish",
    "Thoroughly tested, high-quality materials",
    "Fast pris uden skjulte gebyrer",
    "Delivered on time — every time",
  ],
  imageSrc: "/studio/feature-split.jpg",
  imageAlt: "Close-up from the studio workshop",
  reverse: false,
};

export function StudioFeatureSplit({
  eyebrow,
  title,
  body,
  bullets,
  imageSrc,
  imageAlt,
  reverse,
}: StudioFeatureSplitProps) {
  return (
    <StudioSection>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className={cn(reverse && "lg:order-2")}>
          {eyebrow && (
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
            {title}
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
            {body}
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm leading-relaxed text-cw-stone-700 dark:text-cw-stone-300"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-cw-terracotta/15 text-cw-terracotta-strong"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-3"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {imageSrc ? (
          <figure className={cn(reverse && "lg:order-1")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- client-safe Studio catalog atom (Magic Builder); static/admin src sized via className, next/image intentionally not used here */}
            <img
              src={imageSrc}
              alt={imageAlt ?? ""}
              loading="lazy"
              className="w-full rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 object-cover bg-cw-paper dark:bg-cw-stone-900/40"
            />
          </figure>
        ) : null}
      </div>
    </StudioSection>
  );
}
