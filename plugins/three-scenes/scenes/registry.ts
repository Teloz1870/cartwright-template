import type { SceneFactory, SceneId } from "@/lib/three/types";

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
    label: "Floating geometry",
    description: "Glassy, slowly rotating shapes. Elegant and brand-neutral.",
    load: () => import("./floating-geometry"),
  },
  particles: {
    label: "Particle field",
    description: "Floating dots that react to the mouse. Technical AI/data vibe.",
    load: () => import("./particles"),
  },
  blob: {
    label: "Morphing blob",
    description:
      "An organic gradient shape in gentle, wave-like motion. Trendy modern SaaS look.",
    load: () => import("./blob"),
  },
  wireframe: {
    label: "Low-poly / wireframe",
    description: "A geometric grid in perspective. Structured engine/tech expression.",
    load: () => import("./wireframe"),
  },
  aurora: {
    label: "Aurora (shader)",
    description:
      "Full-screen GLSL aurora — flowing palette-driven ribbons, mouse-reactive. Premium dark-luxe hero.",
    load: () => import("./aurora"),
  },
  waves: {
    label: "Waves",
    description:
      "Full-bleed plane of flowing noise dunes, palette-graded trough→crest with a fresnel sheen. Premium organic hero.",
    load: () => import("./waves"),
  },
  orb: {
    label: "Orb",
    description:
      "A glowing, gently-pulsing core sphere with a halo of orbiting points. Premium core / AI / product hero.",
    load: () => import("./orb"),
  },
  gridflow: {
    label: "Grid-flow (synthwave)",
    description:
      "A glowing perspective grid floor + faint ceiling flowing to a horizon. Retro-future tech hero, palette-glowing.",
    load: () => import("./gridflow"),
  },
  butterflies: {
    label: "Butterflies",
    description:
      "An instanced flock of palette-tinted butterflies — flapping, gliding, scattering from the pointer. Organic metamorphosis hero.",
    load: () => import("./butterflies"),
  },
};

export const SCENE_IDS = Object.keys(SCENE_REGISTRY) as SceneId[];

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && value in SCENE_REGISTRY;
}
