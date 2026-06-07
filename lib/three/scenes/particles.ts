import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "../types";

/**
 * Particle field — additively-blended points drifting in depth, tinted from the
 * brand accent → muted gradient, reacting to pointer + scroll. Drift runs in the
 * vertex shader (GPU) so the main thread stays free. Quality scales the draw
 * range (fewer points) rather than reallocating.
 */
class ParticlesScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
  private geometry?: THREE.BufferGeometry;
  private material?: THREE.ShaderMaterial;
  private points?: THREE.Points;
  private total = 0;
  private reduced = false;
  private readonly pointer = new THREE.Vector2();

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.camera.position.set(0, 0, 7);

    this.total = Math.round(900 + opts.intensity * 1600);
    const positions = new Float32Array(this.total * 3);
    const seeds = new Float32Array(this.total);
    for (let i = 0; i < this.total; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
      seeds[i] = Math.random();
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: opts.intensity },
        uScroll: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uSize: { value: 26 + opts.intensity * 18 },
        uPixelRatio: { value: 1 },
        uColorA: { value: opts.palette.accent.clone() },
        uColorB: { value: opts.palette.muted.clone() },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uIntensity, uScroll, uSize, uPixelRatio;
        uniform vec2 uPointer;
        varying float vDepth;
        void main(){
          vec3 p = position;
          float t = uTime * 0.15 * uIntensity;
          p.x += sin(t + aSeed * 6.2831) * 0.35 * uIntensity;
          p.y += cos(t * 1.1 + aSeed * 6.2831) * 0.35 * uIntensity;
          p.xy += uPointer * 0.6 * (0.4 + aSeed);
          p.z += uScroll * 2.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = clamp(-mv.z / 14.0, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPixelRatio / max(0.1, -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColorA, uColorB;
        varying float vDepth;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d);
          vec3 col = mix(uColorA, uColorB, vDepth);
          gl_FragColor = vec4(col, alpha * (0.35 + 0.45 * (1.0 - vDepth)));
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  update(state: SceneState): void {
    if (!this.material) return;
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.05);
    this.material.uniforms.uPointer.value.copy(this.pointer);
    this.material.uniforms.uScroll.value = state.scroll;
    if (!this.reduced) {
      this.material.uniforms.uTime.value = state.elapsed;
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (this.material) {
      this.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    }
    renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setQuality(quality: number): void {
    if (!this.geometry) return;
    this.geometry.setDrawRange(0, Math.floor(this.total * quality));
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    this.scene.clear();
    this.geometry = undefined;
    this.material = undefined;
    this.points = undefined;
  }
}

const factory: SceneFactory = () => new ParticlesScene();
export default factory;
