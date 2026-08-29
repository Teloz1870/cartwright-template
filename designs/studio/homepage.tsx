/**
 * Studio design — homepage-orchestrator.
 *
 * 6-section stack inspireret af cartwright.app's egen marketing-side:
 *   1. Hero        — grid-bg + headline + CTA + microcopy
 *   2. ValueProps  — 3-card "why us" promise-row
 *   3. FeatureGrid — 6-12 capability-cells (auto-fra brand.website.features)
 *   4. HowItWorks  — 3-step numbered process
 *   5. StackGrid   — flat tech-list
 *   6. CtaFooter   — final conversion-block
 *
 * Server Component — INGEN framer-motion eller use client. CSS-animationer
 * fra themes/studio.css håndterer alle motion-effekter (grid-bg, marquee).
 * Det matcher cartwright.app's egen arkitektur.
 *
 * Props: tager standard `DesignHomepageProps` fra designs/types.ts.
 * Læser settings (DB BrandingSettings) FØRST, brand.config defaults
 * FALLBACK. Tom array i features/steps/stack skipper den section
 * (graceful degradation).
 *
 * v0.7.0 NB: filen var tidligere components/website/StudioHomeClient.tsx
 * og blev kaldt direkte fra app/[locale]/page.tsx via hardcoded if/else.
 * Nu er den ren homepage-komponent for "studio" design-pakken; render-
 * lookup går via designs/index.ts:getDesign().
 */
import { Fragment } from "react";
import { brand } from "@/brand.config";
import { resolveSectionOrder } from "@/designs/layout-types";
import { getActiveLayout } from "@/lib/layout";
import type { DesignHomepageProps } from "../types";
import { studioLayoutRegistry } from "./layout-registry";
import { StudioHero } from "./sections/StudioHero";
import {
  StudioValueProps,
  type StudioValueProp,
} from "./sections/StudioValueProps";
import {
  StudioFeatureGrid,
  type StudioFeature,
} from "./sections/StudioFeatureGrid";
import {
  StudioHowItWorks,
  type StudioStep,
} from "./sections/StudioHowItWorks";
import { StudioStackGrid } from "./sections/StudioStackGrid";
import { StudioCtaFooter } from "./sections/StudioCtaFooter";

export default async function StudioHomepage({ settings, genome }: DesignHomepageProps) {
  const website = brand.website;

  // Voice/Genome copy (when brand.features.genomeResolve is on). Each genome
  // field's anchor IS the matching brand.website.* value, so when no override/
  // Voice exists (or genome is undefined) these `||` chains read exactly as
  // before → byte-identical. settings (admin override) still wins first.
  const headline = settings?.websiteHeadline || genome?.hero.headline || website.headline;
  const tagline = settings?.tagline || genome?.hero.tagline || website.tagline;
  const ctaLabel = settings?.heroCta || genome?.hero.cta || website.cta;
  const heroEyebrow = genome?.hero.eyebrow || brand.website.eyebrow;
  const vpTitle = genome?.valueProps.title || brand.website.valuePropsTitle;
  const vpDescription = genome?.valueProps.description || brand.website.valuePropsDescription;
  const ftTitle = genome?.features.title || brand.website.featuresTitle;
  const ftDescription = genome?.features.description || brand.website.featuresDescription;
  const cfTitle = genome?.ctaFooter.title || brand.website.ctaFooterTitle;
  const cfDescription = genome?.ctaFooter.description || brand.website.ctaFooterDescription;
  const cfCtaLabel = genome?.ctaFooter.cta || brand.website.ctaFooterCtaLabel;

  // brand.website har strongly-typed arrays — orchestrator forwarder dem
  // direkte til section-komponenterne. Når en Voice sætter .items-felterne
  // bruges de (re-toner kortene); ellers brand.website. Mutate via brand.config.ts.
  const valueProps: StudioValueProp[] = (
    genome?.valuePropsItems && genome.valuePropsItems.length > 0
      ? genome.valuePropsItems
      : website.valueProps
  ).map((vp) => ({
    title: vp.title,
    body: vp.body,
  }));

  const features: StudioFeature[] = (
    genome?.featuresItems && genome.featuresItems.length > 0
      ? genome.featuresItems
      : website.features
  ).map((f) => ({
    title: f.title,
    body: f.body,
  }));

  const steps: StudioStep[] = website.steps.map((s) => ({
    n: s.n,
    title: s.title,
    body: s.body,
    code: s.code,
  }));

  const stack: string[] = [...website.stack];

  if ((brand.features as { sectionLayout?: boolean }).sectionLayout) {
    const sections = {
      hero: (
        <StudioHero
          eyebrow={heroEyebrow}
          headline={headline}
          headlineAccent={website.headlineAccent}
          tagline={tagline}
          ctaLabel={ctaLabel}
          ctaHref={website.ctaHref}
          secondaryCtaLabel={website.secondaryCtaLabel}
          secondaryCtaHref={website.secondaryCtaHref}
          microcopy={website.microcopy}
        />
      ),
      // Anchor ids = the chrome's story nav (designs/studio/chrome.tsx).
      valueProps:
        valueProps.length > 0 ? (
          <div id="why">
            <StudioValueProps
              eyebrow={website.valuePropsEyebrow}
              title={vpTitle}
              description={vpDescription}
              props={valueProps}
            />
          </div>
        ) : null,
      featureGrid:
        features.length > 0 ? (
          <div id="features">
            <StudioFeatureGrid
              eyebrow={website.featuresEyebrow}
              title={ftTitle}
              description={ftDescription}
              features={features}
            />
          </div>
        ) : null,
      howItWorks:
        steps.length > 0 ? (
          <div id="how">
            <StudioHowItWorks
              eyebrow={website.stepsEyebrow}
              title={website.stepsTitle}
              description={website.stepsDescription}
              steps={steps}
            />
          </div>
        ) : null,
      stackGrid:
        stack.length > 0 ? (
          <StudioStackGrid
            eyebrow={website.stackEyebrow}
            title={website.stackTitle}
            description={website.stackDescription}
            stack={stack}
          />
        ) : null,
      ctaFooter: (
        <StudioCtaFooter
          title={cfTitle}
          description={cfDescription}
          ctaLabel={cfCtaLabel}
          ctaHref={website.ctaFooterCtaHref}
          secondaryCtaLabel={website.ctaFooterSecondaryLabel}
          secondaryCtaHref={website.ctaFooterSecondaryHref}
        />
      ),
    };
    const sectionOrder = resolveSectionOrder(
      studioLayoutRegistry,
      await getActiveLayout(),
    );
    return (
      <div className="bg-cw-paper dark:bg-cw-ink text-cw-stone-900 dark:text-cw-stone-50">
        {sectionOrder.map((key) => (
          <Fragment key={key}>
            {sections[key as keyof typeof sections]}
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-cw-paper dark:bg-cw-ink text-cw-stone-900 dark:text-cw-stone-50">
      <StudioHero
        eyebrow={heroEyebrow}
        headline={headline}
        headlineAccent={website.headlineAccent}
        tagline={tagline}
        ctaLabel={ctaLabel}
        ctaHref={website.ctaHref}
        secondaryCtaLabel={website.secondaryCtaLabel}
        secondaryCtaHref={website.secondaryCtaHref}
        microcopy={website.microcopy}
      />

      {/* Anchor ids = the chrome's story nav (designs/studio/chrome.tsx). */}
      {valueProps.length > 0 && (
        <div id="why">
          <StudioValueProps
            eyebrow={website.valuePropsEyebrow}
            title={vpTitle}
            description={vpDescription}
            props={valueProps}
          />
        </div>
      )}

      {features.length > 0 && (
        <div id="features">
          <StudioFeatureGrid
            eyebrow={website.featuresEyebrow}
            title={ftTitle}
            description={ftDescription}
            features={features}
          />
        </div>
      )}

      {steps.length > 0 && (
        <div id="how">
          <StudioHowItWorks
            eyebrow={website.stepsEyebrow}
            title={website.stepsTitle}
            description={website.stepsDescription}
            steps={steps}
          />
        </div>
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
        title={cfTitle}
        description={cfDescription}
        ctaLabel={cfCtaLabel}
        ctaHref={website.ctaFooterCtaHref}
        secondaryCtaLabel={website.ctaFooterSecondaryLabel}
        secondaryCtaHref={website.ctaFooterSecondaryHref}
      />
    </div>
  );
}
