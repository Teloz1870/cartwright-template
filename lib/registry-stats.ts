import "server-only";

import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getFeatures } from "@/lib/brand";

/**
 * Registry install-statistik (brand.features.registryStats) — anonym
 * per-item-tælling på den offentlige komponent-registry (/api/registry).
 *
 * Designprincipper:
 *  - ANONYM: der persisteres KUN item-slug + count. Aldrig IP, User-Agent,
 *    cookies eller anden visitor-data — så er der intet GDPR-fodaftryk.
 *  - FIRE-AND-FORGET: tælling må aldrig blokere eller fejle selve
 *    registry-svaret. Skrivningen sker i `after()` (efter response er sendt)
 *    og sluger alle fejl (manglende tabel før `pnpm db:push`, DB nede, …).
 *  - FLAG-GATED INDE I MODULET: incrementRegistryHit læser det resolvede flag
 *    (getFeatures = brand.config-default + evt. runtime-DB-override) og gør
 *    INGENTING når off — nul RegistryHit-reads/-writes, byte-identisk adfærd.
 */

/** Flag-gated, fejl-slugende upsert-increment. Kaster aldrig. */
export async function incrementRegistryHit(item: string): Promise<void> {
  try {
    const features = await getFeatures();
    if (!features.registryStats) return;
    await prisma.registryHit.upsert({
      where: { item },
      create: { item, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    // Aldrig lade måling vælte noget — typisk "no such table: RegistryHit"
    // hvis flaget tændes før `pnpm db:push`.
    console.warn(
      "[registry-stats] failed to record hit:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Planlæg en tælling uden at røre response-latency: `after()` kører callbacken
 * efter svaret er streamet (og holder serverless-funktionen i live til den er
 * færdig). Uden for et request-scope (unit-tests, scripts) falder vi tilbage
 * til en løs promise — incrementRegistryHit kaster alligevel aldrig.
 */
export function scheduleRegistryHit(item: string): void {
  try {
    after(() => incrementRegistryHit(item));
  } catch {
    void incrementRegistryHit(item);
  }
}

export type RegistryHitRow = { item: string; count: number; updatedAt: Date };

/** Sorteret readout (mest installerede først) til admin-fladen. */
export async function listRegistryHits(limit = 500): Promise<RegistryHitRow[]> {
  return prisma.registryHit.findMany({
    orderBy: [{ count: "desc" }, { item: "asc" }],
    take: limit,
  });
}
