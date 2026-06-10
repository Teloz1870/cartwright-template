/**
 * "Stillwater" — the calm-enterprise homepage: from constant noise to quiet
 * confidence. A serene, fully generative landscape design (zero photos): the
 * signature StillwaterScape ridgelines open the page at dawn behind a huge
 * Fraunces headline + the calm `waves` Live-Canvas water, then the day passes
 * — oversized proof metrics, four feature panels that walk dawn → day → dusk
 * → night, a star-lit incident timeline, three quiet testimonials and the
 * closing CTA. Palette-adaptive (cw-* + applyPaletteAsTheme): every ridge,
 * mist band and avatar re-tones to the shop's own palette.
 *
 * Copy chain everywhere: settings ?? genome ?? default (English-first).
 * Server component. Bespoke sections live in ./sections; StudioCtaFooter is a
 * reused Studio atom, pinned light via the sw-locked-light wrapper (the FABLE
 * dark:-pin pattern).
 */
import type { DesignHomepageProps } from "../types";
import { brand } from "@/brand.config";
import { StillwaterHero } from "./sections/StillwaterHero";
import { StillwaterMetrics } from "./sections/StillwaterMetrics";
import { StillwaterPanels } from "./sections/StillwaterPanels";
import { StillwaterNight } from "./sections/StillwaterNight";
import { StillwaterTestimonials } from "./sections/StillwaterTestimonials";
import { StudioCtaFooter } from "../studio/sections/StudioCtaFooter";

export default function StillwaterHomepage({ settings, genome }: DesignHomepageProps) {
  const website = brand.website;

  const headline =
    settings?.websiteHeadline ||
    genome?.hero.headline ||
    "From constant noise to quiet confidence.";
  const tagline =
    settings?.tagline ||
    genome?.hero.tagline ||
    "The operations platform for enterprises that would rather not hear from it. Stillwater absorbs the alarms, the handovers and the night shifts — and leaves your team the calm to think.";

  const panelItems =
    genome?.featuresItems && genome.featuresItems.length > 0
      ? genome.featuresItems.map((item) => ({ title: item.title, body: item.body }))
      : undefined;

  return (
    <div className="sw-locked-light">
      {/* Stillwater is a locked-LIGHT design, but the reused Studio atoms
          (StudioCtaFooter + StudioButtonLink) carry dual-mode `dark:` utilities
          keyed to the OS preference. Re-pin those utilities to their light
          twins inside this subtree so dark-OS visitors get the same serene
          page (.class .class beats .class) — the FABLE pattern, extended to
          cover the button variants used here. */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          .sw-locked-light .dark\\:border-cw-stone-800 { border-color: var(--color-cw-stone-200); }
          .sw-locked-light .dark\\:text-cw-stone-50 { color: var(--color-cw-stone-900); }
          .sw-locked-light .dark\\:text-cw-stone-400 { color: var(--color-cw-stone-500); }
          .sw-locked-light .dark\\:bg-cw-stone-50 { background-color: var(--color-cw-stone-900); }
          .sw-locked-light .dark\\:text-cw-stone-900 { color: var(--color-cw-stone-50); }
          .sw-locked-light .dark\\:hover\\:bg-cw-stone-200:hover { background-color: var(--color-cw-stone-700); }
          .sw-locked-light .dark\\:border-cw-stone-700 { border-color: var(--color-cw-stone-300); }
          .sw-locked-light .dark\\:hover\\:bg-cw-stone-800:hover { background-color: var(--color-cw-stone-100); }
        }
      `}</style>

      <StillwaterHero
        eyebrow={genome?.hero.eyebrow || "Stillwater"}
        headline={headline}
        tagline={tagline}
        ctaLabel={genome?.hero.cta || "See the platform"}
        ctaHref="#panels"
        secondaryLabel="Talk to us"
        secondaryHref="/contact"
        intensity={0.5}
      />

      <div id="metrics">
        <StillwaterMetrics
          kicker="Proof"
          title={genome?.valueProps.title || "Calm you can measure."}
        />
      </div>

      <div id="panels">
        <StillwaterPanels panels={panelItems} />
      </div>

      <StillwaterNight />

      <StillwaterTestimonials />

      <StudioCtaFooter
        title={genome?.ctaFooter.title || website.ctaFooterTitle || "Find your still water."}
        description={
          genome?.ctaFooter.description ||
          "A thirty-minute walkthrough, no slides — just your noisiest workflow, made quiet."
        }
        ctaLabel={genome?.ctaFooter.cta || "Book a walkthrough"}
        ctaHref="/contact"
        secondaryCtaLabel="Talk to us"
        secondaryCtaHref="/contact"
      />
    </div>
  );
}
