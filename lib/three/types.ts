import type * as THREE from "three";

/**
 * Cartwright Live Canvas — core contracts.
 *
 * The orchestrator (components/LiveCanvas.tsx) owns the single renderer + GL
 * context and the frame loop. Each scene owns its own THREE.Scene + camera and
 * draws itself via render(renderer) — so the active scene fully controls its
 * composition while the GL context stays singular (one context, no leaks).
 *
 * Everything here is imported only from the lazy, ssr:false LiveCanvas chunk,
 * so three.js never lands in a first-load bundle.
 */

export type RendererKind = "webgl2" | "webgpu";

/** The four launch scenes. Add a 5th here + one registry entry + one module. */
export type SceneId = "floating-geometry" | "particles" | "blob" | "wireframe";

/** Brand palette read at runtime from the injected --color-sol-* CSS vars. */
export type ThreePalette = {
  accent: THREE.Color;
  accentDeep: THREE.Color;
  cream: THREE.Color;
  sand: THREE.Color;
  ink: THREE.Color;
  muted: THREE.Color;
};

export type SceneMountOpts = {
  /** Shared renderer (Phase 7: union with WebGPURenderer). */
  renderer: THREE.WebGLRenderer;
  palette: ThreePalette;
  /** 0..1 — density/speed/amplitude. From brand.threeD.intensity. */
  intensity: number;
  /** When true: build a near-static composition, no continuous motion. */
  reducedMotion: boolean;
};

export type SceneState = {
  /** Page scroll progress 0..1. */
  scroll: number;
  /** Normalised pointer position, each axis -1..1. */
  pointer: { x: number; y: number };
  /** Seconds since mount. */
  elapsed: number;
  /** Delta seconds since last frame (clamped). */
  dt: number;
};

export interface ThreeScene {
  /** Build the scene graph + camera. Called once after the renderer exists. */
  mount(opts: SceneMountOpts): void;
  /** Advance animation state (no draw call here). */
  update(state: SceneState): void;
  /** Draw using the shared renderer (scene owns its own camera + THREE.Scene). */
  render(renderer: THREE.WebGLRenderer): void;
  /** Viewport changed — update camera aspect + any size-dependent buffers. */
  resize(width: number, height: number, dpr: number): void;
  /** Adaptive quality 0..1 (1 = full). Optional — degrade particle budget etc. */
  setQuality?(quality: number): void;
  /** Release ALL geometries, materials, textures, render targets. */
  dispose(): void;
}

export type SceneFactory = () => ThreeScene;
