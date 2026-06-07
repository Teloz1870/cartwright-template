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

export default async function StudioHomepage({ settings }: DesignHomepageProps) {
  const website = brand.website;

  const headline = settings?.websiteHeadline || website.headline;
  const tagline = settings?.tagline || website.tagline;
  const ctaLabel = settings?.heroCta || website.cta;

  // brand.website har strongly-typed arrays — orchestrator forwarder dem
  // direkte til section-komponenterne. Mutate via brand.config.ts → re-deploy.
  const valueProps: StudioValueProp[] = website.valueProps.map((vp) => ({
    title: vp.title,
    body: vp.body,
  }));

  const features: StudioFeature[] = website.features.map((f) => ({
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
      ),
      valueProps:
        valueProps.length > 0 ? (
          <StudioValueProps
            eyebrow={website.valuePropsEyebrow}
            title={website.valuePropsTitle}
            description={website.valuePropsDescription}
            props={valueProps}
          />
        ) : null,
      featureGrid:
        features.length > 0 ? (
          <StudioFeatureGrid
            eyebrow={website.featuresEyebrow}
            title={website.featuresTitle}
            description={website.featuresDescription}
            features={features}
          />
        ) : null,
      howItWorks:
        steps.length > 0 ? (
          <StudioHowItWorks
            eyebrow={website.stepsEyebrow}
            title={website.stepsTitle}
            description={website.stepsDescription}
            steps={steps}
          />
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
          title={website.ctaFooterTitle}
          description={website.ctaFooterDescription}
          ctaLabel={website.ctaFooterCtaLabel}
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
        <StudioValueProps
          eyebrow={website.valuePropsEyebrow}
          title={website.valuePropsTitle}
          description={website.valuePropsDescription}
          props={valueProps}
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
