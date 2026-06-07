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
 *
 * PART 4: the hero sits in a `.motion-aurora-bg` shell (themes/motion.css) — an
 * animated aurora gradient that adopts the brand palette (cw-* tokens). It's
 * inert when data-motion="off" (the default), so canaries stay byte-identical.
 * When the `threeD` flag is on, <ThreeHero> mounts behind the hero as an opt-in
 * (self-gating WebGL); the gradient is the guaranteed fallback.
 */
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";
import { ThreeHero } from "@/components/ThreeHero";
import { StudioHero } from "@/designs/studio/sections/StudioHero";
import { StudioValuePropsData } from "@/designs/studio/sections/StudioValuePropsData";
import { StudioFeatureGrid } from "@/designs/studio/sections/StudioFeatureGrid";
import { StudioHowItWorks } from "@/designs/studio/sections/StudioHowItWorks";
import { StudioStackGrid } from "@/designs/studio/sections/StudioStackGrid";
import { StudioCtaFooter } from "@/designs/studio/sections/StudioCtaFooter";

export default function AuroraSiteHomepage({ settings, threeD }: DesignHomepageProps) {
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
      {/* Hero shell: animated aurora gradient (themes/motion.css, inert when
          data-motion="off") + optional self-gating 3D canvas behind the hero.
          `relative isolate` is set in markup (not via the motion class) so the
          3D layering works even when motionEffects is off. */}
      <div className="motion-aurora-bg relative isolate">
        {threeD?.enabled && (
          <ThreeHero
            scene={threeD.scene}
            intensity={threeD.intensity}
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70"
          />
        )}
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
      </div>

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
