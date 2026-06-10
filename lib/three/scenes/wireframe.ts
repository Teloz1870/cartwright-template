import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "../types";
import { SIMPLEX_NOISE_GLSL } from "./glsl-noise";

/**
 * Low-poly wireframe terrain — a plane laid into perspective whose vertices are
 * displaced by scrolling simplex noise (GPU). Lines are tinted accent→deep by
 * elevation. Reads as a structured "engine/tech" backdrop.
 */
class WireframeScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 50);
  private geometry?: THREE.PlaneGeometry;
  private material?: THREE.ShaderMaterial;
  private mesh?: THREE.Mesh;
  private reduced = false;
  private readonly pointer = new THREE.Vector2();

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.camera.position.set(0, 1.4, 4.2);
    this.camera.lookAt(0, 0, -2);

    this.geometry = new THREE.PlaneGeometry(16, 12, 72, 56);
    this.material = new THREE.ShaderMaterial({
      wireframe: true,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: opts.intensity },
        uScroll: { value: 0 },
        uColorA: { value: opts.palette.accent.clone() },
        // muted (foreground) instead of accentDeep — visible on dark themes.
        uColorB: { value: opts.palette.muted.clone() },
      },
      vertexShader: /* glsl */ `
        ${SIMPLEX_NOISE_GLSL}
        uniform float uTime, uIntensity, uScroll;
        varying float vElev;
        void main(){
          vec3 p = position;
          float n = snoise(vec3(p.x * 0.25, p.y * 0.25 + uTime * 0.15 + uScroll * 2.5, uTime * 0.05));
          p.z += n * 1.5 * uIntensity;
          vElev = n;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColorA, uColorB;
        varying float vElev;
        void main(){
          vec3 col = mix(uColorB, uColorA, vElev * 0.5 + 0.5);
          gl_FragColor = vec4(col, 0.85);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -1.15; // lay the plane into the floor plane
    this.scene.add(this.mesh);
  }

  update(state: SceneState): void {
    if (!this.material || !this.mesh) return;
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.04);
    this.mesh.rotation.z = this.pointer.x * 0.12;
    this.material.uniforms.uScroll.value = state.scroll;
    if (!this.reduced) {
      this.material.uniforms.uTime.value = state.elapsed;
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
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

const factory: SceneFactory = () => new WireframeScene();
export default factory;
