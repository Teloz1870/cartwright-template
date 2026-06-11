/**
 * Re-export shim — the implementation moved to the three-scenes plugin
 * (plugins/three-scenes/lib/renderer.ts, cartwright-plugin-v1). Keeps the
 * historical import path (`@/lib/three/renderer`) working unchanged.
 */
export { createRenderer } from "@/plugins/three-scenes/lib/renderer";
