/**
 * Studio stat-band — 1..4 nøgletal i et responsivt bånd (sm:2-col, lg:n-col).
 * Hvert tal: stort value over en lille muted label. Valgfri centreret titel
 * ovenover. Bygger på StudioSection for konsistent max-width + border.
 */
import { z } from "zod";
import { StudioSection } from "./StudioSection";

export const statBandSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    stats: z
      .array(
        z.object({
          value: z.string().min(1),
          label: z.string().min(1),
        }),
      )
      .min(1)
      .max(4),
  })
  .strict();

export type StudioStatBandProps = z.infer<typeof statBandSchema>;

export const statBandDefaults: StudioStatBandProps = {
  eyebrow: "I tal",
  title: "Tal der taler for sig selv",
  stats: [
    { value: "10.000+", label: "Glade kunder" },
    { value: "4,9/5", label: "Gennemsnitlig vurdering" },
    { value: "48 timer", label: "Typisk leveringstid" },
    { value: "100%", label: "Tilfredshedsgaranti" },
  ],
};

// Tailwind kan ikke håndtere dynamiske klassenavne — slå op statisk på antal.
const lgColsByCount: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

export function StudioStatBand({ eyebrow, title, stats }: StudioStatBandProps) {
  const lgCols = lgColsByCount[stats.length] ?? "lg:grid-cols-4";
  return (
    <StudioSection>
      {(eyebrow || title) && (
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
              {title}
            </h2>
          )}
        </div>
      )}
      <dl
        className={`mt-12 grid gap-px overflow-hidden rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-stone-200 dark:bg-cw-stone-800 sm:grid-cols-2 ${lgCols}`}
      >
        {stats.map((s, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1 bg-cw-paper dark:bg-cw-stone-900/40 px-6 py-10 text-center"
          >
            <dt className="text-3xl sm:text-4xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
              {s.value}
            </dt>
            <dd className="text-sm leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
              {s.label}
            </dd>
          </div>
        ))}
      </dl>
    </StudioSection>
  );
}
