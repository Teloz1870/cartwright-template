/**
 * Studio stack-grid — flat list af tech/tools renderet i 5-col monospace
 * grid med hairline-borders. Bruges til "the stack"-section.
 *
 * Port af cartwright-app/apps/web/components/landing/stack-grid.tsx.
 */
import { StudioSection, StudioSectionHeader } from "./StudioSection";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  stack: string[];
};

export function StudioStackGrid({
  eyebrow,
  title,
  description,
  stack,
}: Props) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <ul className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px overflow-hidden rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-stone-200 dark:bg-cw-stone-800">
        {stack.map((name) => (
          <li
            key={name}
            className="bg-cw-paper dark:bg-cw-stone-900/40 px-4 py-5 text-center font-mono text-xs text-cw-stone-700 dark:text-cw-stone-300"
          >
            {name}
          </li>
        ))}
      </ul>
    </StudioSection>
  );
}
