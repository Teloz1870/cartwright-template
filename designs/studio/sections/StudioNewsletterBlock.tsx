/**
 * Studio newsletter-block — PRÆSENTATIONEL nyhedsbrev-tilmelding til Magic
 * Builder-kataloget. Ren layout-sektion: centreret header + styled email-input
 * + ikke-submittende CTA-knap. INGEN onSubmit/action/onClick — den rigtige
 * nyhedsbrevsfunktion bor i footeren. Synkron + client-safe (ingen "use client").
 */
import { z } from "zod";
import { StudioSection, StudioSectionHeader } from "./StudioSection";
import { cn } from "@/lib/utils";

export const newsletterBlockSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    ctaLabel: z.string().min(1),
  })
  .strict();
export type StudioNewsletterBlockProps = z.infer<typeof newsletterBlockSchema>;

export const newsletterBlockDefaults: StudioNewsletterBlockProps = {
  eyebrow: "Nyhedsbrev",
  title: "Stay in the loop",
  description:
    "New collections, good offers and small stories from the workshop, straight to your inbox. No spam — only what is worth knowing.",
  placeholder: "you@example.com",
  ctaLabel: "Tilmeld",
};

export function StudioNewsletterBlock({
  eyebrow,
  title,
  description,
  placeholder,
  ctaLabel,
}: StudioNewsletterBlockProps) {
  return (
    <StudioSection>
      <StudioSectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        align="center"
      />
      <div className="mx-auto mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <input
          type="email"
          placeholder={placeholder ?? "you@example.com"}
          aria-label="Email address for the newsletter"
          className="h-12 flex-1 rounded-md border border-cw-stone-300 dark:border-cw-stone-700 bg-cw-paper dark:bg-cw-stone-900/40 px-4 text-sm text-cw-stone-900 dark:text-cw-stone-50 placeholder:text-cw-stone-500 dark:placeholder:text-cw-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper dark:focus-visible:ring-offset-cw-ink"
        />
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md px-6 text-base font-medium",
            "bg-cw-stone-900 text-cw-stone-50 dark:bg-cw-stone-50 dark:text-cw-stone-900",
          )}
        >
          {ctaLabel}
        </span>
      </div>
    </StudioSection>
  );
}
