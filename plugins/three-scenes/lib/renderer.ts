import * as THREE from "three";

import type { RendererKind } from "@/lib/three/types";

/**
 * Renderer factory. v1 is WebGL2-only; the async signature + `prefer` arg exist
 * now so the Phase 7 WebGPU path is a non-breaking drop-in:
 *
 *   if (prefer === "webgpu" && supportsWebGPU()) {
 *     const { WebGPURenderer } = await import("three/webgpu");
 *     try { ...request adapter, return { renderer, kind: "webgpu" } }
 *     catch { ...fall through to WebGL2 }
 *   }
 *
 * `alpha: true` keeps the canvas transparent so the design-pack's own gradient
 * remains visible behind/through sparse scenes — and is the guaranteed fallback
 * layer if the 3D ever fails to paint.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  prefer: RendererKind = "webgl2",
): Promise<{ renderer: THREE.WebGLRenderer; kind: RendererKind }> {
  void prefer; // Phase 7 hook — currently always WebGL2.

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // FXAA-or-none per scene; MSAA is costly for INP
    alpha: true,
    powerPreference: "high-performance",
    // Decorative layer — depth/stencil only where a scene needs it.
    depth: true,
    stencil: false,
  });
  renderer.setClearColor(0x000000, 0); // fully transparent clear
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return { renderer, kind: "webgl2" };
}
