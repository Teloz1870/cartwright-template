import "server-only";

import { withAudit, type AuditActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { GENOME_FIELDS, isGenomeFieldKey } from "@/lib/genome/fields";
import { mutateGenome, readGenomeJson } from "@/lib/genome/store";
import { validateIdentity } from "@/lib/genome/identity";
import { invalidateThemeCache } from "@/lib/theme";
import { applyThreeDConfig } from "@/lib/three/apply";
import { DESIGN_OPTIONS } from "@/designs/options";
import { getVertical } from "@/verticals";
import type { GenomeAnchorKey } from "@/lib/genome/types";

/**
 * Apply a Vertical / Voice preset to the shop. ONE audited mutateGenome merges
 * the preset's identity anchors + pre-written genome overrides (the homepage
 * re-tones immediately — no LLM). Optionally sets the suggested design (Skin),
 * skipping gracefully if that slug isn't in the registry yet.
 *
 * Validates every identity anchor + override key/value up front, so a malformed
 * preset is rejected wholesale rather than half-applied. Idempotent: re-applying
 * the same preset yields the same genome blob.
 */

export type ApplyVerticalOpts = { applySkin?: boolean };

export type ApplyVerticalResult =
  | {
      ok: true;
      slug: string;
      appliedSkin: string | null;
      skinSkipped: string | null;
      appliedPalette: boolean;
      appliedScene: string | null;
      fields: number;
      identityKeys: string[];
    }
  | { ok: false; error: string };

export async function applyVertical(
  slug: string,
  opts: ApplyVerticalOpts,
  actor: AuditActor,
): Promise<ApplyVerticalResult> {
  const preset = getVertical(slug);
  if (!preset) return { ok: false, error: `Vertical "${slug}" findes ikke.` };

  // 1) Validate identity anchors (tone/audience/formality enums; vibe free).
  const idEntries = Object.entries(preset.identity) as [GenomeAnchorKey, string][];
  for (const [k, v] of idEntries) {
    const err = validateIdentity(k, v);
    if (err) return { ok: false, error: `Preset "${slug}" identity.${k}: ${err}` };
  }

  // 2) Validate genome overrides (allowlist + per-field schema).
  const ovEntries = Object.entries(preset.genomeOverrides) as [string, string][];
  for (const [k, v] of ovEntries) {
    if (!isGenomeFieldKey(k)) {
      return { ok: false, error: `Preset "${slug}": ukendt genome-felt "${k}".` };
    }
    const p = GENOME_FIELDS[k].schema.safeParse(v);
    if (!p.success) {
      const msg = p.error.issues[0]?.message ?? "ugyldig værdi";
      return { ok: false, error: `Preset "${slug}" felt "${k}": ${msg}` };
    }
  }

  // 3) Apply identity + overrides in a single audited mutation.
  try {
    await withAudit(
      { actor, tool: "vertical.apply", args: { slug }, before: readGenomeJson },
      async () => {
        await mutateGenome((cur) => ({
          ...cur,
          identity: { ...(cur.identity ?? {}), ...preset.identity },
          overrides: { ...(cur.overrides ?? {}), ...preset.genomeOverrides },
        }));
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Kunne ikke anvende vertical.",
    };
  }

  // 4) Optionally apply the full VIBE: Skin (designSlug) + Palette (themeJson) +
  //    3D Scene. The palette drives BOTH the chrome and the palette-reactive 3D
  //    scene. Graceful: an uninstalled skin is skipped, not fatal.
  let appliedSkin: string | null = null;
  let skinSkipped: string | null = null;
  let appliedPalette = false;
  let appliedScene: string | null = null;
  if (opts.applySkin) {
    const target =
      preset.suggestedDesignSlug &&
      DESIGN_OPTIONS.some((d) => d.slug === preset.suggestedDesignSlug)
        ? preset.suggestedDesignSlug
        : null;
    if (target) appliedSkin = target;
    else if (preset.suggestedDesignSlug) skinSkipped = preset.suggestedDesignSlug;

    const update: { designSlug?: string; themeJson?: string } = {};
    if (target) update.designSlug = target;
    if (preset.palette) {
      update.themeJson = JSON.stringify(preset.palette);
      appliedPalette = true;
    }
    if (update.designSlug || update.themeJson) {
      await prisma.brandingSettings.upsert({
        where: { id: 1 },
        update,
        create: {
          id: 1,
          storeName: "Cartwright",
          heroImage: "",
          announcement: "",
          ...update,
        },
      });
      invalidateThemeCache();
    }

    if (preset.scene) {
      const r = await applyThreeDConfig({ scene: preset.scene }, actor);
      if (r.ok) appliedScene = preset.scene;
    }
  }

  return {
    ok: true,
    slug,
    appliedSkin,
    skinSkipped,
    appliedPalette,
    appliedScene,
    fields: ovEntries.length,
    identityKeys: idEntries.map(([k]) => k),
  };
}
