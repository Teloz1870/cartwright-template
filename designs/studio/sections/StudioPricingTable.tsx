/**
 * StudioPricingTable — prissektion med responsivt grid af priskort.
 * Et fremhævet kort får cw-terracotta-ring + "Mest populær"-pill.
 * Co-located zod-schema + defaults (registry importerer dem direkte).
 * PURE/SYNC client-safe atom: ingen "use client", ingen server-deps.
 */
import { z } from "zod";
import { StudioSection, StudioSectionHeader } from "./StudioSection";
import { StudioButtonLink } from "./StudioButton";
import { cn } from "@/lib/utils";

export const pricingTableSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    plans: z
      .array(
        z.object({
          name: z.string().min(1),
          price: z.string().min(1),
          period: z.string().optional(),
          features: z.array(z.string().min(1)).min(1).max(8),
          ctaLabel: z.string().min(1),
          ctaHref: z.string().min(1),
          highlighted: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(4),
  })
  .strict();

export type StudioPricingTableProps = z.infer<typeof pricingTableSchema>;

export const pricingTableDefaults: StudioPricingTableProps = {
  eyebrow: "Priser",
  title: "Vælg den plan der passer dig",
  description:
    "Gennemsigtige priser uden bindinger. Skift eller opsig når som helst.",
  plans: [
    {
      name: "Start",
      price: "0 kr",
      period: "/md",
      features: [
        "1 bruger",
        "Op til 25 produkter",
        "Grundlæggende statistik",
        "E-mailsupport",
      ],
      ctaLabel: "Kom i gang",
      ctaHref: "/da/kontakt",
    },
    {
      name: "Vækst",
      price: "199 kr",
      period: "/md",
      features: [
        "5 brugere",
        "Ubegrænset antal produkter",
        "Avanceret statistik",
        "Prioriteret support",
        "Egen domæne",
      ],
      ctaLabel: "Prøv gratis",
      ctaHref: "/da/kontakt",
      highlighted: true,
    },
    {
      name: "Pro",
      price: "499 kr",
      period: "/md",
      features: [
        "Ubegrænsede brugere",
        "API-adgang",
        "Dedikeret rådgiver",
        "SLA-aftale",
      ],
      ctaLabel: "Kontakt salg",
      ctaHref: "/da/kontakt",
    },
  ],
};

export function StudioPricingTable({
  eyebrow,
  title,
  description,
  plans,
}: StudioPricingTableProps) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <div className="mt-12 grid gap-5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, i) => (
          <div
            key={i}
            className={cn(
              "relative flex flex-col rounded-xl border bg-cw-paper p-6 dark:bg-cw-stone-900/40",
              plan.highlighted
                ? "border-cw-terracotta ring-2 ring-cw-terracotta"
                : "border-cw-stone-200 dark:border-cw-stone-800",
            )}
          >
            {plan.highlighted ? (
              <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-cw-terracotta px-3 py-1 text-xs font-semibold text-cw-ink">
                Mest populær
              </span>
            ) : null}
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-cw-stone-900 dark:text-cw-stone-50">
                {plan.name}
              </h3>
            </div>
            <p className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
                {plan.price}
              </span>
              {plan.period ? (
                <span className="text-sm text-cw-stone-500 dark:text-cw-stone-400">
                  {plan.period}
                </span>
              ) : null}
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((feature, fi) => (
                <li
                  key={fi}
                  className="flex items-start gap-2 text-sm leading-relaxed text-cw-stone-700 dark:text-cw-stone-300"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="mt-0.5 h-4 w-4 shrink-0 text-cw-terracotta"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.424 0l-3.5-3.55a1 1 0 0 1 1.424-1.404l2.788 2.826 6.788-6.886a1 1 0 0 1 1.414-.006Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <StudioButtonLink
                href={plan.ctaHref}
                variant="secondary"
                className="w-full"
              >
                {plan.ctaLabel}
              </StudioButtonLink>
            </div>
          </div>
        ))}
      </div>
    </StudioSection>
  );
}
