/**
 * "Apex" — the flagship super-pro homepage. A palette-adaptive webshop design
 * that composes EVERYTHING Cartwright can do on one page: a 3D Live-Canvas hero,
 * a 3D product showroom, value props, the "build your own" configurator, the live
 * featured-product grid, a scroll-cinema brand story, and a closing CTA. Because
 * Apex is palette-adaptive (cw-* + applyPaletteAsTheme), every section — incl. the
 * Pro elements — adopts the shop's own palette. The proof of the super-pro vision.
 *
 * Server component. Reuses the shared Studio atoms + the Pro Parts (which are
 * client islands behind their own boundaries) + the real ProductGrid.
 */
import type { DesignHomepageProps } from "../types";
import { brand } from "@/brand.config";
import { editAttr } from "@/components/annotate/editAttr";
import { ProductGrid } from "@/components/ProductGrid";
import { StudioSection, StudioSectionHeader } from "../studio/sections/StudioSection";
import { StudioHeroAurora } from "../studio/sections/StudioHeroAurora";
import { StudioShowroom3D } from "../studio/sections/StudioShowroom3D";
import { StudioValueProps } from "../studio/sections/StudioValueProps";
import { StudioConfigurator } from "../studio/sections/StudioConfigurator";
import { StudioScrollStory } from "../studio/sections/StudioScrollStory";
import { StudioCtaFooter } from "../studio/sections/StudioCtaFooter";

export default function ApexHomepage({
  settings,
  featured,
  genome,
  editEnabled = false,
}: DesignHomepageProps) {
  const website = brand.website;

  // In-place editing (annotateEdit): hero headline/tagline → settings (første
  // led i kæden); genome-slots kun editbare når genomeResolve er on (genome-
  // prop present) — Footer'ens regel.
  const genomeEdit = Boolean(editEnabled && genome);
  const headline = settings?.websiteHeadline || genome?.hero.headline || "Designed to be the last one you buy.";
  const tagline =
    settings?.tagline ||
    genome?.hero.tagline ||
    "One product, made without compromise — see it in 3D, build it your way, and own it for years.";

  return (
    <>
      <StudioHeroAurora
        eyebrow={genome?.hero.eyebrow || "The flagship"}
        headline={headline}
        headlineAccent=""
        tagline={tagline}
        ctaLabel={genome?.hero.cta || "Shop the collection"}
        ctaHref="/produkter"
        secondaryCtaLabel="See the story"
        secondaryCtaHref="#story"
        microcopy="Free shipping · 10-year warranty · Made to order"
        scene="aurora"
        intensity={0.82}
        headlineAttrs={editAttr({ kind: "setting", field: "websiteHeadline" }, editEnabled)}
        taglineAttrs={editAttr({ kind: "setting", field: "tagline" }, editEnabled)}
      />

      <StudioShowroom3D
        eyebrow="In the showroom"
        productName="The Signature"
        tagline="Turn it, light it, and see every angle before you buy."
        scene="orb"
        intensity={0.8}
        specs={[
          { label: "Material", value: "Anodised alloy" },
          { label: "Weight", value: "320 g" },
          { label: "Finish", value: "6 colours" },
          { label: "Warranty", value: "10 years" },
        ]}
        ctaLabel="Configure yours"
        ctaHref="#configure"
      />

      <StudioValueProps
        eyebrow="Why us"
        title="Built like it matters."
        description="No shortcuts, no filler — just a product engineered to outlast the trend and a team that stands behind it."
        props={[
          { title: "Made to order", body: "Built only when you buy, finished to your spec, shipped fast." },
          { title: "Engineered to last", body: "Materials chosen to age well, backed by a ten-year warranty." },
          { title: "Yours, your way", body: "Pick the finish, size and extras — and see the price as you go." },
        ]}
      />

      <div id="configure">
        <StudioConfigurator
          eyebrow="Build your own"
          title="Make it yours."
          description="Choose a finish, a size, and the extras you want — the price updates as you go."
          productName="The Signature"
          basePrice={149}
          currency="$"
          groups={[
            {
              label: "Finish",
              kind: "colour",
              choices: [
                { label: "Midnight", value: "#1f2937", priceDelta: 0 },
                { label: "Slate", value: "#4b5563", priceDelta: 0 },
                { label: "Sand", value: "#c8b79b", priceDelta: 0 },
                { label: "Ivory", value: "#e9e4d8", priceDelta: 0 },
              ],
            },
            {
              label: "Size",
              kind: "option",
              choices: [
                { label: "Compact", value: "S", priceDelta: 0 },
                { label: "Standard", value: "M", priceDelta: 20 },
                { label: "Grand", value: "L", priceDelta: 40 },
              ],
            },
            {
              label: "Extras",
              kind: "option",
              choices: [
                { label: "None", value: "none", priceDelta: 0 },
                { label: "Engraving", value: "engrave", priceDelta: 25 },
                { label: "Gift box", value: "gift", priceDelta: 15 },
              ],
            },
          ]}
          ctaLabel="Add to cart"
          ctaHref="/produkter"
          note="Free shipping · 30-day returns · Made to order"
        />
      </div>

      {featured && featured.length > 0 && (
        <StudioSection>
          <StudioSectionHeader
            eyebrow="The collection"
            title="Pick your favourite."
            description="A small, considered range — each piece earns its place."
          />
          <div className="mt-12">
            <ProductGrid products={featured} prioritizeAboveFold={4} />
          </div>
        </StudioSection>
      )}

      <div id="story">
        <StudioScrollStory
          eyebrow="The story"
          frames={[
            {
              kicker: "Designed",
              headline: "Every detail, on purpose.",
              body: "Nothing here is an accident. Each line, each curve, each gram was argued over until it earned its place.",
            },
            {
              kicker: "Built",
              headline: "Made to outlast the trend.",
              body: "Materials chosen to age well, not to photograph well — the kind of thing you keep, not replace.",
            },
            {
              kicker: "Delivered",
              headline: "Yours in days, not weeks.",
              body: "Made to order, shipped fast, and backed for the long run. Premium without the wait.",
            },
          ]}
        />
      </div>

      <StudioCtaFooter
        title={genome?.ctaFooter.title || website.ctaFooterTitle || "Find your Apex."}
        description={
          genome?.ctaFooter.description ||
          "Start in the showroom, build it your way, and have it on your doorstep this week."
        }
        ctaLabel={genome?.ctaFooter.cta || "Shop the collection"}
        ctaHref="/produkter"
        secondaryCtaLabel="Talk to us"
        secondaryCtaHref="/contact"
        titleAttrs={editAttr({ kind: "genome", key: "home.ctaFooter.title" }, genomeEdit)}
        descriptionAttrs={editAttr(
          { kind: "genome", key: "home.ctaFooter.description" },
          genomeEdit,
        )}
      />
    </>
  );
}
