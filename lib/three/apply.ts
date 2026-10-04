import "server-only";

import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { isSceneId } from "./scenes/registry";
import {
  getActiveThreeDConfig,
  invalidateThreeDCache,
  parseThreeDConfig,
  type PaletteSource,
  type ThreeDConfig,
} from "./resolve";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

/**
 * Shared apply core for the Live Canvas config — used by BOTH the admin server
 * action (/admin/three-d) and the AI tool (three.configure), so validation +
 * audit + cache-invalidation never diverge. Mirrors lib/feature-flags/apply.ts.
 */

export type ThreeDPatch = Partial<{
  scene: string;
  intensity: number;
  paletteSource: PaletteSource;
}>;

export type ApplyThreeDResult =
  | { ok: true; config: ThreeDConfig }
  | { ok: false; error: string };

export async function applyThreeDConfig(
  patch: ThreeDPatch,
  actor: AuditActor,
): Promise<ApplyThreeDResult> {
  // Validate (cosmetic config, but never trust the caller).
  if (patch.scene !== undefined && !isSceneId(patch.scene)) {
    return { ok: false, error: `Ukendt scene '${patch.scene}'.` };
  }
  if (
    patch.intensity !== undefined &&
    (typeof patch.intensity !== "number" || !Number.isFinite(patch.intensity))
  ) {
    return { ok: false, error: "intensity skal være et tal mellem 0 og 1." };
  }
  if (
    patch.paletteSource !== undefined &&
    patch.paletteSource !== "theme" &&
    patch.paletteSource !== "custom"
  ) {
    return { ok: false, error: "paletteSource skal være 'theme' eller 'custom'." };
  }

  const clean: ThreeDPatch = {};
  if (patch.scene !== undefined) clean.scene = patch.scene;
  if (patch.intensity !== undefined) {
    clean.intensity = Math.max(0, Math.min(1, patch.intensity));
  }
  if (patch.paletteSource !== undefined) clean.paletteSource = patch.paletteSource;

  try {
    await withAudit(
      {
        actor,
        tool: "three.configure",
        args: clean,
        before: async () => {
          const r = await prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: { threeDConfigJson: true },
          });
          return r?.threeDConfigJson ?? null;
        },
      },
      async () => {
        const row = await prisma.brandingSettings.findUnique({
          where: { id: 1 },
          select: { threeDConfigJson: true },
        });
        const current = parseThreeDConfig(row?.threeDConfigJson) ?? {};
        const merged = { ...current, ...clean };
        const json = JSON.stringify(merged);
        await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: { threeDConfigJson: json },
          create: {
            ...brandingCreateDefaults(),
            threeDConfigJson: json,
          },
        });
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Kunne ikke gemme 3D-config.",
    };
  }

  invalidateThreeDCache();
  return { ok: true, config: await getActiveThreeDConfig() };
}
