/**
 * Studio sections barrel — shared section-atom-bibliotek der bruges af
 * imported designs (via lib/designs/codegen.ts).
 *
 * Vi re-eksporterer alle StudioX-komponenter herfra så codegenererede
 * designs/<slug>/homepage.tsx kun har ÉN import-path at vide om, frem for
 * 6 individuelle. Hvis vi tilføjer en ny section-type (fx StudioTestimonial),
 * appende den her — codegen.ts opdateres ikke fordi den slår navnet op fra
 * spec'en hvor designeren har valgt at bruge den.
 */
export { StudioHero } from "./StudioHero";
export { StudioButton, StudioButtonLink } from "./StudioButton";
export { StudioBadge } from "./StudioBadge";
export { StudioSection, StudioSectionHeader } from "./StudioSection";
export { StudioValueProps } from "./StudioValueProps";
export { StudioFeatureGrid } from "./StudioFeatureGrid";
export { StudioHowItWorks } from "./StudioHowItWorks";
export { StudioStackGrid } from "./StudioStackGrid";
export { StudioCtaFooter } from "./StudioCtaFooter";
export type { StudioValueProp } from "./StudioValueProps";
export type { StudioFeature } from "./StudioFeatureGrid";
export type { StudioStep } from "./StudioHowItWorks";
