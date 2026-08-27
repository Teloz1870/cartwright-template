/**
 * Re-export shim — the scene registry moved to the three-scenes plugin
 * (plugins/three-scenes/scenes/registry.ts, cartwright-plugin-v1). Keeps the
 * historical import path (`@/lib/three/scenes/registry`) working unchanged for
 * the core consumers of the scene-id vocabulary (lib/three/resolve+apply,
 * lib/tools/three-d, lib/compositions/spec, the marketplace-manifest
 * generator) and existing scaffolds.
 */
export { SCENE_REGISTRY, SCENE_IDS, isSceneId } from "@/plugins/three-scenes/scenes/registry";
export type { SceneRegistryEntry } from "@/plugins/three-scenes/scenes/registry";
