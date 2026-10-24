import "server-only";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { isSceneId } from "./scenes/registry";
import type { SceneId } from "./types";

/**
 * Live Canvas config resolution — modeled on lib/theme.ts (themeJson). Merges
 * the per-shop DB override (BrandingSettings.threeDConfigJson) over the
 * brand.config.threeD defaults, with a 30s cache. Fail-soft: a corrupt/hostile
 * JSON never breaks render — it falls back to the compile-time defaults.
 */

export type PaletteSource = "theme" | "custom";
export type ThreeDConfig = {
  scene: SceneId;
  intensity: number; // 0..1
  paletteSource: PaletteSource;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function defaults(): ThreeDConfig {
  return {
    scene: brand.threeD.scene,
    intensity: clamp01(brand.threeD.intensity),
    paletteSource: brand.threeD.paletteSource,
  };
}

/** Parse a stored override blob into a validated partial (unknown keys dropped). */
export function parseThreeDConfig(
  raw: string | null | undefined,
): Partial<ThreeDConfig> | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const out: Partial<ThreeDConfig> = {};
  if (isSceneId(o.scene)) out.scene = o.scene;
  if (typeof o.intensity === "number" && Number.isFinite(o.intensity)) {
    out.intensity = clamp01(o.intensity);
  }
  if (o.paletteSource === "theme" || o.paletteSource === "custom") {
    out.paletteSource = o.paletteSource;
  }
  return out;
}

let cache: { value: ThreeDConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getActiveThreeDConfig(): Promise<ThreeDConfig> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  const base = defaults();
  try {
    const row = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
      select: { threeDConfigJson: true },
    });
    const override = parseThreeDConfig(row?.threeDConfigJson) ?? {};
    const value: ThreeDConfig = { ...base, ...override };
    cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cache = { value: base, expiresAt: now + CACHE_TTL_MS };
    return base;
  }
}

export function invalidateThreeDCache(): void {
  cache = null;
}
