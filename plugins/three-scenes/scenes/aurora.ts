import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "@/lib/three/types";
import { SIMPLEX_NOISE_GLSL } from "./glsl-noise";

/**
 * Aurora — a full-screen GLSL aurora: domain-warped fbm (shared simplex noise)
 * painting flowing ribbons, blended over the page. Palette-driven (uses the
 * injected --color-sol-* brand colours), mouse-reactive, alpha-blended so the
 * pack's own background shows through. A single full-screen quad → very cheap.
 *
 * This generalises the bespoke designs/engineered hero into a reusable Live
 * Canvas scene, so ANY design pack gets a premium 3D hero via <DesignHero />
 * (components/DesignHero.tsx) and inherits LiveCanvas's WebGL2 / reduced-motion
 * / saveData gating for free.
 */
class AuroraScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  // Full-screen quad in clip space → an orthographic identity camera.
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry?: THREE.PlaneGeometry;
  private material?: THREE.ShaderMaterial;
  private mesh?: THREE.Mesh;
  private reduced = false;
  private intensity = 0.7;
  private readonly mouse = new THREE.Vector2(0.5, 0.55);

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.intensity = opts.intensity;

    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: opts.intensity },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: this.mouse },
        // Palette-driven: base (canvas) → glow (accent) → deep highlight.
        uBase: { value: opts.palette.ink.clone() },
        uGlow: { value: opts.palette.accent.clone() },
        uDeep: { value: opts.palette.accentDeep.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${SIMPLEX_NOISE_GLSL}
        uniform float uTime, uIntensity;
        uniform vec2 uResolution, uMouse;
        uniform vec3 uBase, uGlow, uDeep;
        varying vec2 vUv;

        float fbm(vec2 p, float t){
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++){ s += a * snoise(vec3(p, t)); p *= 2.02; a *= 0.5; }
          return s;
        }

        void main(){
          vec2 uv = vUv;
          vec2 p = uv - 0.5;
          p.x *= uResolution.x / max(uResolution.y, 1.0);
          float t = uTime * 0.05;
          vec2 q = vec2(fbm(p * 1.5, t), fbm(p * 1.5 + 5.2, -t));
          float n = fbm(p * 2.0 + q * 1.2, t * 2.0);
          float md = distance(uv, uMouse);
          n += smoothstep(0.45, 0.0, md) * 0.18;
          float bands = smoothstep(0.05, 0.7, n);
          vec3 col = mix(uBase, uGlow, bands);
          col = mix(col, uDeep, smoothstep(0.78, 1.0, n) * 0.35);
          float vignette = smoothstep(1.15, 0.15, length(p));
          float alpha = bands * vignette * (0.5 + 0.5 * uIntensity);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  update(state: SceneState): void {
    if (!this.material) return;
    // pointer is -1..1 → map to 0..1 uv space; smooth it.
    this.mouse.lerp(
      new THREE.Vector2(state.pointer.x * 0.5 + 0.5, state.pointer.y * 0.5 + 0.5),
      0.06,
    );
    if (!this.reduced) {
      this.material.uniforms.uTime.value = state.elapsed;
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (!this.material) return;
    this.material.uniforms.uResolution.value.set(
      Math.max(1, width),
      Math.max(1, height),
    );
  }

  setQuality(): void {
    /* full-screen quad is already cheap; nothing to degrade. */
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    this.scene.clear();
    this.geometry = undefined;
    this.material = undefined;
    this.mesh = undefined;
  }
}

const factory: SceneFactory = () => new AuroraScene();
export default factory;
