/**
 * Studio "how it works" — numbered step-list (typisk 3 trin) med optional
 * monospace code-snippet pr step. Port af cartwright-app's HowItWorks.
 */
import { StudioSection, StudioSectionHeader } from "./StudioSection";

export type StudioStep = {
  n: string;
  title: string;
  body: string;
  /** Optional monospace-code under step (fx kommando). Skjult hvis undefined. */
  code?: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  steps: StudioStep[];
};

export function StudioHowItWorks({
  eyebrow,
  title,
  description,
  steps,
}: Props) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-stone-200 dark:bg-cw-stone-800 sm:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.n}
            className="bg-cw-paper dark:bg-cw-stone-900/40 p-6 flex flex-col"
          >
            <span className="font-mono text-xs text-cw-stone-500 dark:text-cw-stone-400">
              step {step.n}
            </span>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-cw-stone-500 dark:text-cw-stone-400 flex-1">
              {step.body}
            </p>
            {step.code ? (
              <code className="mt-4 inline-block w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded bg-cw-stone-900 dark:bg-cw-code-bg px-2.5 py-1 font-mono text-xs text-cw-stone-200">
                {step.code}
              </code>
            ) : null}
          </li>
        ))}
      </ol>
    </StudioSection>
  );
}
