/**
 * StudioHomeClient — homepage-orchestrator for industryTemplate="studio".
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
 * Props design: orchestrator læser settings (DB BrandingSettings) FØRST,
 * brand.config defaults FALLBACK. Tom array i features/steps/stack skipper
 * den section (graceful degradation).
 */
import { brand } from "@/brand.config";
import { StudioHero } from "./studio/StudioHero";
import {
  StudioValueProps,
  type StudioValueProp,
} from "./studio/StudioValueProps";
import {
  StudioFeatureGrid,
  type StudioFeature,
} from "./studio/StudioFeatureGrid";
import {
  StudioHowItWorks,
  type StudioStep,
} from "./studio/StudioHowItWorks";
import { StudioStackGrid } from "./studio/StudioStackGrid";
import { StudioCtaFooter } from "./studio/StudioCtaFooter";

type Settings = {
  websiteHeadline?: string | null;
  tagline?: string | null;
  heroCta?: string | null;
} | null;

type Props = {
  /** DB BrandingSettings — overrider brand.config defaults hvor sat. */
  settings: Settings;
};

export default function StudioHomeClient({ settings }: Props) {
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
