/**
 * Aurora (website) — homepage orchestrator.
 *
 * The Cartwright flagship DEFAULT for website-mode. Composed from the shared
 * section atoms (the same set the Magic Builder uses) over the REAL
 * `brand.website` data contract — so it's a drop-in for studio/corporate-baseline
 * with real content, not placeholder copy. Its look differs via the Aurora
 * palette, which adopts each brand's colours at runtime (applyPaletteAsTheme →
 * paletteToFullThemeCss maps the 6-colour palette onto the cw-* atom tokens).
 *
 * Server Component — no "use client", no framer-motion. Motion comes from the
 * CSS keyframes in themes/studio.css (globally imported) + RevealOnScroll inside
 * the atoms, all reduced-motion-safe.
 */
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";
import { StudioHero } from "@/designs/studio/sections/StudioHero";
import { StudioValuePropsData } from "@/designs/studio/sections/StudioValuePropsData";
import { StudioFeatureGrid } from "@/designs/studio/sections/StudioFeatureGrid";
import { StudioHowItWorks } from "@/designs/studio/sections/StudioHowItWorks";
import { StudioStackGrid } from "@/designs/studio/sections/StudioStackGrid";
import { StudioCtaFooter } from "@/designs/studio/sections/StudioCtaFooter";

export default function AuroraSiteHomepage({ settings }: DesignHomepageProps) {
  const website = brand.website;

  const headline = settings?.websiteHeadline || website.headline;
  const tagline = settings?.tagline || website.tagline;
  const ctaLabel = settings?.heroCta || website.cta;

  const valueProps = website.valueProps.map((vp) => ({ title: vp.title, body: vp.body }));
  const features = website.features.map((f) => ({ title: f.title, body: f.body }));
  const steps = website.steps.map((s) => ({ n: s.n, title: s.title, body: s.body, code: s.code }));
  const stack = [...website.stack];

  return (
    <div className="bg-cw-paper text-cw-stone-900 dark:bg-cw-ink dark:text-cw-stone-50">
      <StudioHero
        eyebrow={website.eyebrow}
        headline={headline}
        headlineAccent={website.headlineAccent}
        tagline={tagline}
        ctaLabel={ctaLabel}
        ctaHref={website.ctaHref}
        secondaryCtaLabel={website.secondaryCtaLabel}
        secondaryCtaHref={website.secondaryCtaHref}
        microcopy={website.microcopy}
      />

      {valueProps.length > 0 && (
        <StudioValuePropsData
          eyebrow={website.valuePropsEyebrow}
          title={website.valuePropsTitle}
          description={website.valuePropsDescription}
          items={valueProps}
        />
      )}

      {features.length > 0 && (
        <StudioFeatureGrid
          eyebrow={website.featuresEyebrow}
          title={website.featuresTitle}
          description={website.featuresDescription}
          features={features}
        />
      )}

      {steps.length > 0 && (
        <StudioHowItWorks
          eyebrow={website.stepsEyebrow}
          title={website.stepsTitle}
          description={website.stepsDescription}
          steps={steps}
        />
      )}

      {stack.length > 0 && (
        <StudioStackGrid
          eyebrow={website.stackEyebrow}
          title={website.stackTitle}
          description={website.stackDescription}
          stack={stack}
        />
      )}

      <StudioCtaFooter
        title={website.ctaFooterTitle}
        description={website.ctaFooterDescription}
        ctaLabel={website.ctaFooterCtaLabel}
        ctaHref={website.ctaFooterCtaHref}
        secondaryCtaLabel={website.ctaFooterSecondaryLabel}
        secondaryCtaHref={website.ctaFooterSecondaryHref}
      />
    </div>
  );
}
