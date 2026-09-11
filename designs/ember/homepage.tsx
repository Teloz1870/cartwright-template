/**
 * "Ember" — the warm-glow premium homepage. Soft tech, warm bloom: a pure-CSS
 * gradient-mesh hero under a Plus Jakarta Sans display headline, a live
 * featured-product grid (webshop mode), glow-shadowed value cards on a sand
 * band, an edge-to-edge ink band with a field of pulsing sparks, then the
 * shared Studio atoms (stat band → pricing → CTA) to ground it in facts.
 *
 * Palette-adaptive (cw-* + applyPaletteAsTheme): the mesh, every EmberSpark
 * and every section re-tone to the shop's own palette — the only constant is
 * one low-alpha amber undertone in the hero mesh (documented in EmberHero).
 *
 * Copy chain per slot: settings?.x || genome?.x || <English default> —
 * the admin and any Voice preset own the words; the defaults below are the
 * out-of-box English story.
 *
 * Server component. Bespoke sections live in ./sections (design-local);
 * StatBand / PricingTable / CtaFooter are reused Studio atoms.
 */
import type { DesignHomepageProps } from "../types";
import { ProductGrid } from "@/components/ProductGrid";
import { editAttr } from "@/components/annotate/editAttr";
import { EmberHero } from "./sections/EmberHero";
import { EmberGlowCards } from "./sections/EmberGlowCards";
import { EmberEmbersBand } from "./sections/EmberEmbersBand";
import { StudioSection, StudioSectionHeader } from "../studio/sections/StudioSection";
import { StudioStatBand } from "../studio/sections/StudioStatBand";
import { StudioPricingTable } from "../studio/sections/StudioPricingTable";
import { StudioCtaFooter } from "../studio/sections/StudioCtaFooter";

export default function EmberHomepage({
  settings,
  locale,
  featured,
  threeD,
  genome,
  editEnabled = false,
}: DesignHomepageProps) {
  const contact = `/${locale}/contact`;

  // In-place editing (annotateEdit): hero headline/tagline → settings (første
  // led i kæden); genome-slots kun editbare når genomeResolve er on (genome-
  // prop present) — Footer'ens regel.
  const genomeEdit = Boolean(editEnabled && genome);

  const headline =
    settings?.websiteHeadline || genome?.hero.headline || "From spark to ship.";
  const tagline =
    settings?.tagline ||
    genome?.hero.tagline ||
    "The warm way to build. Describe what you want, watch it bloom into a working site, and launch something that feels handmade — no cold scaffolding in sight.";

  const glowCards =
    genome?.valuePropsItems && genome.valuePropsItems.length > 0
      ? genome.valuePropsItems
      : undefined;

  const emberFrames =
    genome?.featuresItems && genome.featuresItems.length > 0
      ? genome.featuresItems
      : undefined;

  return (
    <div className="ember-locked-light">
      {/* Ember is a locked-LIGHT design, but the reused Studio atoms carry
          dual-mode `dark:` utilities. Re-pin those six utilities to their light
          twins inside this subtree so the page stays warm cream (.class .class
          beats .class).
          NB (dark-mode unification): `dark:` utilities now follow the `.dark`
          CLASS, not the OS — under OS-dark these rules are a redundant no-op.
          Kept as the design-local "locked light" belt-and-suspenders for the
          class-dark case (persisted theme=dark + OS-dark), same as fable. */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          .ember-locked-light .dark\\:bg-cw-stone-800 { background-color: var(--color-cw-stone-200); }
          .ember-locked-light .dark\\:bg-cw-stone-900\\/40 { background-color: var(--color-cw-paper); }
          .ember-locked-light .dark\\:border-cw-stone-800 { border-color: var(--color-cw-stone-200); }
          .ember-locked-light .dark\\:text-cw-stone-300 { color: var(--color-cw-stone-600); }
          .ember-locked-light .dark\\:text-cw-stone-400 { color: var(--color-cw-stone-500); }
          .ember-locked-light .dark\\:text-cw-stone-50 { color: var(--color-cw-stone-900); }
        }
      `}</style>

      <EmberHero
        eyebrow={genome?.hero.eyebrow || "Introducing Ember"}
        headline={headline}
        tagline={tagline}
        ctaLabel={genome?.hero.cta || "Start building"}
        ctaHref={contact}
        secondaryLabel="See what's inside"
        secondaryHref="#inside"
        threeDEnabled={threeD?.enabled === true}
        intensity={0.55}
        headlineAttrs={editAttr({ kind: "setting", field: "websiteHeadline" }, editEnabled)}
        taglineAttrs={editAttr({ kind: "setting", field: "tagline" }, editEnabled)}
      />

      {/* Webshop mode: the live featured-product grid — real data, owner-editable. */}
      {featured && featured.length > 0 && (
        <StudioSection>
          <StudioSectionHeader
            eyebrow="From the shop"
            title="Warm picks, ready today."
            description="A small, considered selection — each piece chosen to glow on arrival."
          />
          <div className="mt-12">
            <ProductGrid products={featured} prioritizeAboveFold={4} />
          </div>
        </StudioSection>
      )}

      <div id="glow">
        <EmberGlowCards
          title={genome?.valueProps.title || undefined}
          intro={genome?.valueProps.description || undefined}
          cards={glowCards}
          titleAttrs={editAttr({ kind: "genome", key: "home.valueProps.title" }, genomeEdit)}
          introAttrs={editAttr(
            { kind: "genome", key: "home.valueProps.description" },
            genomeEdit,
          )}
        />
      </div>

      <div id="inside">
        <EmberEmbersBand
          kicker={genome?.features.title || undefined}
          title={genome?.features.description || undefined}
          frames={emberFrames}
          kickerAttrs={editAttr({ kind: "genome", key: "home.features.title" }, genomeEdit)}
          titleAttrs={editAttr(
            { kind: "genome", key: "home.features.description" },
            genomeEdit,
          )}
        />
      </div>

      <div className="motion-fade-up">
        <StudioStatBand
          eyebrow="By the numbers"
          title="Warmth, measured."
          stats={[
            { value: "6 tokens", label: "One palette re-tones it all" },
            { value: "<1 s", label: "First paint on a cold start" },
            { value: "0 photos", label: "Every visual is hand-drawn SVG or CSS" },
            { value: "100%", label: "Yours — code, data and design" },
          ]}
        />
      </div>

      <div className="motion-fade-up">
        <StudioPricingTable
          eyebrow="Plans"
          title="Pick your warmth."
          description="Transparent plans, no lock-in. Change or cancel any time — the site stays yours either way."
          plans={[
            {
              name: "Kindling",
              price: "Free",
              period: "forever",
              features: [
                "The full warm-glow design",
                "Every page, every device",
                "Edit everything in the admin",
                "Community support",
              ],
              ctaLabel: "Start free",
              ctaHref: contact,
            },
            {
              name: "Hearth",
              price: "$19",
              period: "/mo",
              features: [
                "Everything in Kindling",
                "Custom domain & analytics",
                "Priority email support",
                "Quarterly design refresh",
              ],
              highlighted: true,
              ctaLabel: "Light it up",
              ctaHref: contact,
            },
            {
              name: "Bonfire",
              price: "Let's talk",
              period: "bespoke",
              features: [
                "Hands-on design partnership",
                "Bespoke sections & motifs",
                "Migration done for you",
                "Same-day support",
              ],
              ctaLabel: "Get in touch",
              ctaHref: contact,
            },
          ]}
        />
      </div>

      <StudioCtaFooter
        title={genome?.ctaFooter.title || "Light yours."}
        description={
          genome?.ctaFooter.description ||
          "Start from a spark tonight — ship something warm tomorrow."
        }
        ctaLabel={genome?.ctaFooter.cta || "Get started"}
        ctaHref={contact}
        secondaryCtaLabel="Talk to us"
        secondaryCtaHref={contact}
        titleAttrs={editAttr({ kind: "genome", key: "home.ctaFooter.title" }, genomeEdit)}
        descriptionAttrs={editAttr(
          { kind: "genome", key: "home.ctaFooter.description" },
          genomeEdit,
        )}
      />
    </div>
  );
}
