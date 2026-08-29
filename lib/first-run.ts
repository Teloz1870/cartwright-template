import "server-only";

import { brand } from "@/brand.config";
import { getFeatures } from "@/lib/brand";
import { shouldShowSetupWizard } from "@/lib/setup-wizard";

/**
 * First-run welcome canvas predicate (FIRST IMPRESSION, Part 1).
 *
 * The canvas (components/first-run/WelcomeCanvas.tsx) is the very first thing
 * a fresh `npx create-cartwright` scaffold renders on its homepage — a full
 * Cartwright showcase that points the new owner at the three on-ramps
 * (build with AI / guided setup / compose a look). It must therefore ONLY
 * appear on a truly untouched site and disappear PERMANENTLY the moment the
 * owner makes the site theirs, via ANY of:
 *
 *   - setup wizard completed        (settings.setupComplete)
 *   - a design explicitly chosen    (settings.designSlug OR brand.designSlug)
 *   - hero copy set                 (websiteHeadline / tagline / heroCta)
 *   - a vibe homepage published     (homePage.vibeHtml)
 *   - a product created             (productCount > 0)
 *
 * The flag check short-circuits BEFORE any DB access: the engine default is
 * `firstRunWelcome: false` (canaries structurally immune — this function
 * returns false synchronously there); the CLI flips it true for scaffolds.
 *
 * `settings` + `homePage` are passed in from the homepage's existing fetches
 * (app/[locale]/page.tsx) — no duplicate queries. The remaining "fresh fork"
 * half (setupComplete re-check + productCount === 0) is composed from
 * shouldShowSetupWizard() so the two first-run predicates can never disagree
 * about what a fresh fork is. Fail-soft: a DB error means "don't show".
 */

type FirstRunSettings = {
  setupComplete?: boolean | null;
  designSlug?: string | null;
  websiteHeadline?: string | null;
  tagline?: string | null;
  heroCta?: string | null;
} | null;

type FirstRunHomePage = {
  vibeHtml?: string | null;
} | null;

export async function shouldShowWelcomeCanvas(
  settings: FirstRunSettings,
  homePage: FirstRunHomePage,
): Promise<boolean> {
  // Flag first — engine default false ⇒ we return before ANY DB call.
  if (!brand.features.firstRunWelcome) return false;
  // The owner made the site theirs in some way ⇒ never show again.
  // Config-level designSlug counts too: the documented Blank Canvas path
  // ("set designSlug: 'blank' in brand.config.ts") must retire the canvas
  // exactly like choosing a design in the admin does.
  if (brand.designSlug) return false;
  if (homePage?.vibeHtml) return false;
  if (settings?.setupComplete) return false;
  if (settings?.designSlug) return false;
  if (settings?.websiteHeadline || settings?.tagline || settings?.heroCta) {
    return false;
  }
  // The flag is runtime-toggleable: honor a DB override (an owner switching
  // the canvas off in /admin/features). Only reached when the compile-time
  // flag is on (scaffolds) — never on engine-default-false shops. Cached via
  // getBrand(); fail-soft to the compile-time value on DB error.
  const features = await getFeatures().catch(() => null);
  if (features && !features.firstRunWelcome) return false;
  // Fresh-fork half: setupComplete (DB truth) + productCount === 0 — same
  // definition the setup wizard uses. Fail-soft to "don't show" on DB error.
  return shouldShowSetupWizard().catch(() => false);
}
