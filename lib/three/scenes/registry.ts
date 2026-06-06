import type { SceneFactory, SceneId } from "../types";

/**
 * Scene registry — single source of truth for the available Live Canvas scenes.
 * Each `load` is a dynamic import so ONLY the active scene's module is fetched
 * (three.js core is shared once loaded). Adding a 5th scene = one new module +
 * one entry here + one `SceneId` union member. Same one-entry ethos as the
 * feature manifest.
 */

export type SceneRegistryEntry = {
  /** Human label (admin scene picker + AI tool output). */
  label: string;
  description: string;
  load: () => Promise<{ default: SceneFactory }>;
};

export const SCENE_REGISTRY: Record<SceneId, SceneRegistryEntry> = {
  "floating-geometry": {
    label: "Flydende geometri",
    description: "Glasede, langsomt roterende former. Elegant, brand-neutral.",
    load: () => import("./floating-geometry"),
  },
  particles: {
    label: "Partikel-felt",
    description: "Flydende prikker der reagerer på mus. Teknisk AI/data-vibe.",
    load: () => import("./particles"),
  },
  blob: {
    label: "Morphing blob",
    description: "Organisk gradient-form der bølger. Trendy moderne SaaS-look.",
    load: () => import("./blob"),
  },
  wireframe: {
    label: "Low-poly / wireframe",
    description: "Geometrisk grid i perspektiv. Struktureret engine/tech-udtryk.",
    load: () => import("./wireframe"),
  },
};

export const SCENE_IDS = Object.keys(SCENE_REGISTRY) as SceneId[];

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && value in SCENE_REGISTRY;
}
