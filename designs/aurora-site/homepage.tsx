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

export default function AuroraSiteHomepage({ settings, threeD, genome }: DesignHomepageProps) {
  const website = brand.website;

  // Voice/Genome copy (when brand.features.genomeResolve is on). Each genome
  // value is `override ?? resolved ?? anchor(=website.*)`, so when it's just the
  // anchor (or genome is undefined) these `||` chains read exactly as before —
  // byte-identical until a Voice preset / admin override sets a value.
  const headline = settings?.websiteHeadline || genome?.hero.headline || website.headline;
  const tagline = settings?.tagline || genome?.hero.tagline || website.tagline;
  const ctaLabel = settings?.heroCta || genome?.hero.cta || website.cta;

  const valueProps =
    genome?.valuePropsItems && genome.valuePropsItems.length > 0
      ? genome.valuePropsItems
      : website.valueProps.map((vp) => ({ title: vp.title, body: vp.body }));
  const features =
    genome?.featuresItems && genome.featuresItems.length > 0
      ? genome.featuresItems
      : website.features.map((f) => ({ title: f.title, body: f.body }));
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
          eyebrow={genome?.hero.eyebrow || website.eyebrow}
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
          title={genome?.valueProps.title || website.valuePropsTitle}
          description={genome?.valueProps.description || website.valuePropsDescription}
          items={valueProps}
        />
      )}

      {features.length > 0 && (
        <StudioFeatureGrid
          eyebrow={website.featuresEyebrow}
          title={genome?.features.title || website.featuresTitle}
          description={genome?.features.description || website.featuresDescription}
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
        title={genome?.ctaFooter.title || website.ctaFooterTitle}
        description={genome?.ctaFooter.description || website.ctaFooterDescription}
        ctaLabel={genome?.ctaFooter.cta || website.ctaFooterCtaLabel}
        ctaHref={website.ctaFooterCtaHref}
        secondaryCtaLabel={website.ctaFooterSecondaryLabel}
        secondaryCtaHref={website.ctaFooterSecondaryHref}
      />
    </div>
  );
}
