/**
 * Re-export shim — the implementation moved to the three-scenes plugin
 * (plugins/three-scenes/lib/loop.ts, cartwright-plugin-v1). Keeps the
 * historical import path (`@/lib/three/loop`) working unchanged.
 */
export { createFrameLoop, clampDpr } from "@/plugins/three-scenes/lib/loop";
export type { FrameLoop, FrameCallback } from "@/plugins/three-scenes/lib/loop";
