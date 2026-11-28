/**
 * Jungle (website) — a friendly, organic, palette-adaptive homepage.
 *
 * Atom-composed like Aurora (so it's mixable + Voice-aware: it consumes the
 * `genome` copy and adopts the active palette via applyPaletteAsTheme), but
 * deliberately TRIMMED to the human-friendly sections — hero, value-props,
 * features, closing CTA — and drops Aurora's dev-flavoured "how it works (with
 * code)" + tech-stack-grid sections. So it fits non-dev verticals (kindergarten,
 * café, salon…) cleanly, and a green palette + the `waves` scene make it read
 * like a lush canopy. Server Component.
 */
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";
import { ThreeHero } from "@/components/ThreeHero";
import { StudioHero } from "@/designs/studio/sections/StudioHero";
import { StudioValuePropsData } from "@/designs/studio/sections/StudioValuePropsData";
import { StudioFeatureGrid } from "@/designs/studio/sections/StudioFeatureGrid";
import { StudioCtaFooter } from "@/designs/studio/sections/StudioCtaFooter";

export default function JungleHomepage({ settings, threeD, genome }: DesignHomepageProps) {
  const website = brand.website;

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

  return (
    <div className="bg-cw-paper text-cw-stone-900 dark:bg-cw-ink dark:text-cw-stone-50">
      {/* Hero shell: animated aurora gradient (adopts the palette) + optional
          self-gating 3D scene behind the hero (waves/leaves when configured). */}
      <div className="motion-aurora-bg relative isolate">
        {threeD?.enabled && (
          <ThreeHero
            scene={threeD.scene}
            intensity={threeD.intensity}
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-80"
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

      {/* Anchor ids = the chrome's story nav (designs/jungle/chrome.tsx). */}
      {valueProps.length > 0 && (
        <div id="values">
          <StudioValuePropsData
            eyebrow={website.valuePropsEyebrow}
            title={genome?.valueProps.title || website.valuePropsTitle}
            description={genome?.valueProps.description || website.valuePropsDescription}
            items={valueProps}
          />
        </div>
      )}

      {features.length > 0 && (
        <div id="features">
          <StudioFeatureGrid
            eyebrow={website.featuresEyebrow}
            title={genome?.features.title || website.featuresTitle}
            description={genome?.features.description || website.featuresDescription}
            features={features}
          />
        </div>
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
