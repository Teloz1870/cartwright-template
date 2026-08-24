/**
 * Re-export shim — the scene moved to the three-scenes plugin
 * (plugins/three-scenes/scenes/orb.ts, cartwright-plugin-v1). The plugin's
 * registry lazy-loads the plugin module directly; this shim only keeps the
 * historical import path working for existing scaffolds.
 */
export { default } from "@/plugins/three-scenes/scenes/orb";
