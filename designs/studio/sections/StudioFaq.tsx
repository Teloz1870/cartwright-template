/**
 * Studio FAQ — native <details>/<summary> accordion (ingen client-JS, natively
 * accessible). Hvert spørgsmål er en bordered række i en rounded-xl container
 * (divide-y); + ikonet roterer til × via group-open:rotate-45. Co-located
 * Zod-schema + defaults så Magic Builder-registry kan importere dem direkte.
 */
import { z } from "zod";
import { StudioSection, StudioSectionHeader } from "./StudioSection";

export const faqSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    items: z
      .array(
        z.object({
          question: z.string().min(1),
          answer: z.string().min(1),
        }),
      )
      .min(1)
      .max(12),
  })
  .strict();

export type StudioFaqProps = z.infer<typeof faqSchema>;

export const faqDefaults: StudioFaqProps = {
  eyebrow: "Frequently asked questions",
  title: "Questions? We have answers",
  description:
    "The essentials, gathered in one place. If your answer is not here, write to us any time.",
  items: [
    {
      question: "Hvor hurtigt bliver min ordre sendt?",
      answer:
        "We pack and ship every order placed before 2 pm the same working day. Your parcel usually arrives 1-3 working days later.",
    },
    {
      question: "Can I return an item if I change my mind?",
      answer:
        "Yes. You have 30 days to return anything. Send the item back unused and we refund the full amount.",
    },
    {
      question: "Which payment methods do you accept?",
      answer:
        "You can pay securely with Visa, Mastercard, Apple Pay and Google Pay. Every payment is handled encrypted.",
    },
    {
      question: "Do you ship nationwide?",
      answer:
        "We deliver nationwide — to a pick-up point or straight to your address.",
    },
  ],
};

export function StudioFaq({ eyebrow, title, description, items }: StudioFaqProps) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <div className="mt-12 divide-y divide-cw-stone-200 dark:divide-cw-stone-800 overflow-hidden rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-paper dark:bg-cw-stone-900/40">
        {items.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-medium text-cw-stone-900 dark:text-cw-stone-50">
              <span>{item.question}</span>
              <span
                aria-hidden="true"
                className="shrink-0 text-lg leading-none text-cw-stone-500 transition-transform duration-200 group-open:rotate-45 dark:text-cw-stone-400"
              >
                +
              </span>
            </summary>
            <p className="px-6 pb-5 text-sm leading-relaxed text-cw-stone-500 dark:text-cw-stone-400">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </StudioSection>
  );
}
