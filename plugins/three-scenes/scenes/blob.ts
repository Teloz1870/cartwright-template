import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "@/lib/three/types";
import { SIMPLEX_NOISE_GLSL } from "./glsl-noise";

/**
 * Morphing blob — a high-subdivision icosahedron displaced by layered simplex
 * noise in the vertex shader, shaded with a fake key light + fresnel rim. A
 * single mesh → very cheap; GPU does the morph, so it's LCP/INP-friendly.
 */
class BlobScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  private geometry?: THREE.IcosahedronGeometry;
  private material?: THREE.ShaderMaterial;
  private mesh?: THREE.Mesh;
  private reduced = false;
  private readonly pointer = new THREE.Vector2();

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.camera.position.set(0, 0, 4.4);

    this.geometry = new THREE.IcosahedronGeometry(1.6, 5);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: opts.intensity },
        uColorA: { value: opts.palette.accent.clone() },
        // Blend toward ink (contrast colour) rather than accentDeep, which is
        // pure black on dark themes and swallows half the blob.
        uColorB: { value: opts.palette.accent.clone().lerp(opts.palette.ink, 0.55) },
        uColorRim: { value: opts.palette.ink.clone() },
      },
      vertexShader: /* glsl */ `
        ${SIMPLEX_NOISE_GLSL}
        uniform float uTime, uIntensity;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vDisp;
        void main(){
          float t = uTime * 0.25;
          float disp = snoise(position * 0.9 + vec3(t)) * 0.34 * uIntensity;
          disp += snoise(position * 1.9 - vec3(t * 0.7)) * 0.14 * uIntensity;
          vDisp = disp;
          vec3 p = position + normal * disp;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColorA, uColorB, uColorRim;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vDisp;
        void main(){
          float light = clamp(dot(vNormal, normalize(vec3(0.5, 0.8, 0.6))), 0.0, 1.0);
          float fres = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 2.5);
          vec3 base = mix(uColorA, uColorB, vDisp * 0.5 + 0.5);
          vec3 col = base * (0.45 + 0.65 * light) + uColorRim * fres * 0.85;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  update(state: SceneState): void {
    if (!this.material || !this.mesh) return;
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.05);
    this.mesh.rotation.y = this.pointer.x * 0.5 + state.scroll * 0.4;
    this.mesh.rotation.x = this.pointer.y * 0.3;
    if (!this.reduced) {
      this.material.uniforms.uTime.value = state.elapsed;
      this.mesh.rotation.z = Math.sin(state.elapsed * 0.1) * 0.1;
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

const factory: SceneFactory = () => new BlobScene();
export default factory;
