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
  eyebrow: "Ofte stillede spørgsmål",
  title: "Spørgsmål? Vi har svarene",
  description:
    "Det vigtigste, samlet ét sted. Finder du ikke svaret, er du altid velkommen til at skrive til os.",
  items: [
    {
      question: "Hvor hurtigt bliver min ordre sendt?",
      answer:
        "Vi pakker og afsender alle ordrer afgivet før kl. 14 samme hverdag. Du modtager typisk din pakke 1-3 hverdage efter.",
    },
    {
      question: "Kan jeg returnere, hvis jeg fortryder?",
      answer:
        "Ja. Du har 30 dages fuld returret på alle varer. Send blot produktet retur i ubrugt stand, så refunderer vi hele beløbet.",
    },
    {
      question: "Hvilke betalingsmetoder tager I imod?",
      answer:
        "Du kan betale sikkert med Dankort, Visa, Mastercard, MobilePay og Apple Pay. Alle betalinger håndteres krypteret.",
    },
    {
      question: "Sender I til hele Danmark?",
      answer:
        "Vi leverer i hele landet med GLS og PostNord — både til pakkeshop og direkte til din adresse.",
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
