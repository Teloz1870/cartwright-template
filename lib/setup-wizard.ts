import "server-only";

import { prisma } from "@/lib/db";

/**
 * Task D: setup-wizard-gating helper.
 *
 * Wizard skal kun køre på en frisk fork — eksisterende deploys (som solbrillen.dk
 * selv) skal ikke pludselig blive blokeret når denne kode rulles ud. Vi
 * kombinerer derfor flag + data-detect:
 *
 *   shouldShowSetupWizard = !setupComplete AND no products exist
 *
 * Det betyder:
 * - Fresh fork: setupComplete=false + 0 produkter → wizard kicker
 * - Eksisterende deploy: setupComplete=false MEN N produkter → ikke wizard
 *   (admin kan stadig manuelt visit /admin/setup hvis de vil)
 * - Efter wizard-completion: setupComplete=true → wizard skippes for evigt
 */
export async function shouldShowSetupWizard(): Promise<boolean> {
  const settings = await prisma.brandingSettings.findUnique({
    where: { id: 1 },
    select: { setupComplete: true },
  });
  if (settings?.setupComplete) return false;
  const productCount = await prisma.product.count();
  return productCount === 0;
}

/**
 * Whitelist af paths der ALDRIG redirectes til /admin/setup, selv hvis wizard
 * skal vises. /admin/integrations er kritisk: en power-user (især under setup)
 * skal kunne nå keys-siden direkte uden at wizard fanger dem. /admin/setup
 * + setup-actions er selvsagt undtaget for ikke at lave evig redirect.
 */
const SETUP_PATH_WHITELIST = [
  "/admin/setup",
  "/admin/integrations",
];

export function isSetupWhitelistedPath(pathname: string): boolean {
  return SETUP_PATH_WHITELIST.some(
    (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
  );
}

export async function markSetupComplete(): Promise<void> {
  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: { setupComplete: true },
    create: {
      id: 1,
      setupComplete: true,
      storeName: "Min shop",
      heroImage: "",
      announcement: "",
    },
  });
}
