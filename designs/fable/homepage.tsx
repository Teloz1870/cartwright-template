/**
 * "Fable" — the website-mode flagship homepage. An airy ivory story page where
 * an instanced flock of 3D butterflies flutters behind a serif display hero, a
 * scroll-cinema metamorphosis timeline carries the narrative, and a stat band,
 * a safeguards story and a pricing band ground it in facts. Palette-adaptive
 * (cw-* + applyPaletteAsTheme): the flock, the SVG motifs and every section
 * re-tone to the shop's own palette.
 *
 * The default copy tells the story of Claude Fable 5 (June 9, 2026) — the
 * launch this design celebrates. Swap it via admin settings, the genome, or
 * the matching "fable" Voice preset.
 *
 * Server component. Bespoke sections live in ./sections (design-local);
 * StatBand / PricingTable / CtaFooter are reused Studio atoms.
 */
import type { DesignHomepageProps } from "../types";
import { brand } from "@/brand.config";
import { editAttr } from "@/components/annotate/editAttr";
import { FableHero } from "./sections/FableHero";
import { FableMetamorphosis } from "./sections/FableMetamorphosis";
import { FableSafeguards } from "./sections/FableSafeguards";
import { StudioStatBand } from "../studio/sections/StudioStatBand";
import { StudioPricingTable } from "../studio/sections/StudioPricingTable";
import { StudioCtaFooter } from "../studio/sections/StudioCtaFooter";

export default function FableHomepage({
  settings,
  genome,
  editEnabled = false,
}: DesignHomepageProps) {
  const website = brand.website;

  // In-place editing (annotateEdit): hero headline/tagline → settings (første
  // led i kæden); genome-slots kun editbare når genomeResolve er on (genome-
  // prop present) — Footer'ens regel.
  const genomeEdit = Boolean(editEnabled && genome);

  const headline =
    settings?.websiteHeadline || genome?.hero.headline || "Meet Fable 5.";
  const tagline =
    settings?.tagline ||
    genome?.hero.tagline ||
    "The most capable model yet, made safe for everyone — state-of-the-art at software engineering, knowledge work, vision and science.";

  const metamorphosisFrames =
    genome?.featuresItems && genome.featuresItems.length > 0
      ? genome.featuresItems.map((item, i) => ({
          kicker: ["Stage one — Larva", "Stage two — Chrysalis", "Stage three — Imago"][i] ?? `Stage ${i + 1}`,
          title: item.title,
          body: item.body,
        }))
      : undefined;

  const safeguardCards =
    genome?.valuePropsItems && genome.valuePropsItems.length > 0
      ? genome.valuePropsItems
      : undefined;

  return (
    <div className="fable-locked-light">
      {/* Fable is a locked-LIGHT design, but the reused Studio atoms carry
          dual-mode `dark:` utilities. Re-pin those six utilities to their light
          twins inside this subtree so the page stays ivory (.class .class
          beats .class).
          NB (dark-mode unification): `dark:` utilities now follow the `.dark`
          CLASS, not the OS — under OS-dark these rules are a redundant no-op.
          Kept as the design-local "locked light" belt-and-suspenders for the
          class-dark case (persisted theme=dark + OS-dark). Revisit at Phase 3
          (per-design dark opt-in). */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          .fable-locked-light .dark\\:bg-cw-stone-800 { background-color: var(--color-cw-stone-200); }
          .fable-locked-light .dark\\:bg-cw-stone-900\\/40 { background-color: var(--color-cw-paper); }
          .fable-locked-light .dark\\:border-cw-stone-800 { border-color: var(--color-cw-stone-200); }
          .fable-locked-light .dark\\:text-cw-stone-300 { color: var(--color-cw-stone-600); }
          .fable-locked-light .dark\\:text-cw-stone-400 { color: var(--color-cw-stone-500); }
          .fable-locked-light .dark\\:text-cw-stone-50 { color: var(--color-cw-stone-900); }
        }
      `}</style>
      <FableHero
        eyebrow={genome?.hero.eyebrow || "Introducing"}
        headline={headline}
        tagline={tagline}
        ctaLabel={genome?.hero.cta || "Read the story"}
        ctaHref="#metamorphosis"
        secondaryLabel="See the numbers"
        secondaryHref="#numbers"
        intensity={0.62}
        headlineAttrs={editAttr({ kind: "setting", field: "websiteHeadline" }, editEnabled)}
        taglineAttrs={editAttr({ kind: "setting", field: "tagline" }, editEnabled)}
      />

      <div id="metamorphosis">
        <FableMetamorphosis
          kicker={genome?.features.title || "The metamorphosis"}
          title={genome?.features.description || "Every generation, a transformation."}
          frames={metamorphosisFrames}
          kickerAttrs={editAttr({ kind: "genome", key: "home.features.title" }, genomeEdit)}
          titleAttrs={editAttr(
            { kind: "genome", key: "home.features.description" },
            genomeEdit,
          )}
        />
      </div>

      <div id="numbers" className="motion-fade-up">
        <StudioStatBand
          eyebrow="By the numbers"
          title="The launch, in numbers."
          stats={[
            { value: "$10 / $50", label: "Per million tokens, in / out" },
            { value: "<5%", label: "Sessions where safeguards engage" },
            { value: "1,000+", label: "Hours of external red-teaming" },
            { value: "June 22", label: "Included on paid plans until" },
          ]}
        />
      </div>

      <FableSafeguards
        title={genome?.valueProps.title || undefined}
        intro={genome?.valueProps.description || undefined}
        cards={safeguardCards}
        titleAttrs={editAttr({ kind: "genome", key: "home.valueProps.title" }, genomeEdit)}
        introAttrs={editAttr(
          { kind: "genome", key: "home.valueProps.description" },
          genomeEdit,
        )}
      />

      <div className="motion-fade-up">
        <StudioPricingTable
          eyebrow="Access"
          title="Choose how you meet Fable."
          description="Available today on the API and every paid plan — and for a small group of partners, with the safeguards lifted."
          plans={[
            {
              name: "Claude API",
              price: "$10 / $50",
              period: "per M tokens",
              features: [
                "Fully available from day one",
                "State-of-the-art benchmarks",
                "Vision, code and science",
                "Standard rate limits",
              ],
              ctaLabel: "Start building",
              ctaHref: "/contact",
            },
            {
              name: "Pro · Max · Team",
              price: "Included",
              period: "through June 22",
              features: [
                "No extra cost on paid plans",
                "The full Fable 5 experience",
                "Safeguarded for general use",
                "Falls back to Opus 4.8 on restricted topics",
              ],
              ctaLabel: "Try it today",
              ctaHref: "/contact",
            },
            {
              name: "Mythos 5",
              price: "Restricted",
              period: "by application",
              features: [
                "Same model, safeguards lifted",
                "Cyberdefenders & infrastructure",
                "Project Glasswing partners",
                "Selected biology researchers",
              ],
              ctaLabel: "Learn more",
              ctaHref: "/contact",
            },
          ]}
        />
      </div>

      <StudioCtaFooter
        title={genome?.ctaFooter.title || website.ctaFooterTitle || "Emerge with it."}
        description={
          genome?.ctaFooter.description ||
          "Every journey starts folded up in the dark. Fable 5 is what comes after."
        }
        ctaLabel={genome?.ctaFooter.cta || "Get started"}
        ctaHref="/contact"
        secondaryCtaLabel="Talk to us"
        secondaryCtaHref="/contact"
        titleAttrs={editAttr({ kind: "genome", key: "home.ctaFooter.title" }, genomeEdit)}
        descriptionAttrs={editAttr(
          { kind: "genome", key: "home.ctaFooter.description" },
          genomeEdit,
        )}
      />
    </div>
  );
}
