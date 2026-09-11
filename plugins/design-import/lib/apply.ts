import "server-only";

import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { invalidateThemeCache } from "@/lib/theme-cache";
import type { ThemePalette } from "@/lib/theme";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

/**
 * Anvend en importeret palette → BrandingSettings.themeJson (runtime-override af
 * brand-farver). Audited + invaliderer theme-cachen. Spejler lib/three/apply.ts.
 * Den forrige themeJson gemmes i audit-before, så audit.revert kan rulle tilbage.
 *
 * NB: fonts + tone fra extract gemmes ikke her (themeJson er palette-only). Tone
 * → Genome-identitet er en udvidelse når feat/genome-kernel er merged.
 */
export async function applyDesignPalette(
  palette: ThemePalette,
  actor: AuditActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await withAudit(
      {
        actor,
        tool: "design.import",
        args: { palette },
        before: async () => {
          const r = await prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: { themeJson: true },
          });
          return r?.themeJson ?? null;
        },
      },
      async () => {
        const json = JSON.stringify(palette);
        await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: { themeJson: json },
          create: { ...brandingCreateDefaults(), themeJson: json },
        });
      },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke gemme tema." };
  }
  invalidateThemeCache();
  return { ok: true };
}
