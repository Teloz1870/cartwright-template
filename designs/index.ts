/**
 * v0.7.0 Design Registry — public API.
 *
 * Registrér en ny design ved at importere den her og adde til DESIGNS-map.
 * `DESIGN_OPTIONS` deriveres automatisk så SetupWizard og /admin/designs
 * picker den nye design op uden code-edit på UI-laget.
 *
 * Ved import via `npx cartwright design import`: CLI scaffolder
 * designs/<slug>/{index.ts,homepage.tsx,design.md} og tilføjer en linje her
 * automatisk (via codemod i lib/designs/codegen.ts — PR I).
 */
/**
 * v0.7.0 Design Registry — SERVER-SIDE entry-point.
 *
 * Importerer alle DesignPack-objekter med deres React-komponenter (som
 * transitivt har server-only deps som prisma, stripe.ts). Brug KUN denne
 * fil fra Server Components.
 *
 * Client Components (SetupWizard, /admin/designs UI) skal importere fra
 * `@/designs/options` der har samme metadata men ingen komponenter.
 */
import type { DesignPack } from "./types";
import { saasDarkDesign } from "./saas-dark";
import { studioDesign } from "./studio";
import { corporateBaselineDesign } from "./corporate-baseline";
import { webshopClassicDesign } from "./webshop-classic";
import { webshopMinimalDesign } from "./webshop-minimal";
import { webshopEditorialDesign } from "./webshop-editorial";
import { webshopBoldDesign } from "./webshop-bold";
import { northernCoffeeDesign } from "./northern-coffee";
import { atelierDesign } from "./atelier";
import { stackDesign } from "./stack";

const DESIGNS: Record<string, DesignPack> = {
  "saas-dark": saasDarkDesign,
  studio: studioDesign,
  "corporate-baseline": corporateBaselineDesign,
  "webshop-classic": webshopClassicDesign,
  "webshop-minimal": webshopMinimalDesign,
  "webshop-editorial": webshopEditorialDesign,
  "webshop-bold": webshopBoldDesign,
  // Cartwright Studio premium designs — sketch towards v0.8.0 marketplace.
  // Når marketplace lander, flytter de ud af cartwright-private og installeres
  // via `npx cartwright design install @marketplace/<slug>`.
  "northern-coffee": northernCoffeeDesign,
  atelier: atelierDesign,
  stack: stackDesign,
};

/**
 * Lookup en design pr slug. Returnerer null hvis slug er ukendt — app/[locale]/
 * page.tsx renderer notFound() i det tilfælde med en admin-hint i error-message.
 */
export function getDesign(slug: string | null | undefined): DesignPack | null {
  if (!slug) return null;
  return DESIGNS[slug] ?? null;
}

// Re-eksport CLIENT-SAFE helpers så Server Components stadig kan importere
// alt fra `@/designs` uden at vide om server/client-split.
export { inferDesignFromIndustry, DESIGN_OPTIONS } from "./options";
export type { DesignOption } from "./options";
export type { DesignPack, DesignMode, DesignTokens, DesignHomepageProps, WebshopOverrides } from "./types";
