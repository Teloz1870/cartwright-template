import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "@/lib/three/types";
import { SIMPLEX_NOISE_GLSL } from "./glsl-noise";

/**
 * Orb — a glowing, gently-pulsing core sphere (noise-displaced, fresnel rim) with
 * a slow halo of orbiting points. Premium "core / AI / product" hero. Two draw
 * objects, GPU-side morph → cheap. Colours come straight from the brand palette,
 * so the orb glows in the active brand's accent.
 */
class OrbScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  private geometry?: THREE.IcosahedronGeometry;
  private material?: THREE.ShaderMaterial;
  private mesh?: THREE.Mesh;
  private haloGeo?: THREE.BufferGeometry;
  private haloMat?: THREE.PointsMaterial;
  private halo?: THREE.Points;
  private reduced = false;
  private readonly pointer = new THREE.Vector2();

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.camera.position.set(0, 0, 4.6);

    // ── Core orb ──
    this.geometry = new THREE.IcosahedronGeometry(1.4, 6);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: opts.intensity },
        uCore: { value: opts.palette.accentDeep.clone().lerp(opts.palette.ink, 0.4) },
        uGlow: { value: opts.palette.accent.clone() },
        uRim: { value: opts.palette.accent.clone().lerp(opts.palette.cream, 0.55) },
      },
      vertexShader: /* glsl */ `
        ${SIMPLEX_NOISE_GLSL}
        uniform float uTime, uIntensity;
        varying vec3 vNormal;
        varying vec3 vView;
        void main(){
          float t = uTime * 0.3;
          float d = snoise(position * 1.3 + vec3(t)) * 0.10 * (0.6 + uIntensity);
          vec3 p = position + normal * d;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uCore, uGlow, uRim;
        varying vec3 vNormal;
        varying vec3 vView;
        void main(){
          float ndv = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
          float fres = pow(1.0 - ndv, 2.2);
          vec3 col = mix(uCore, uGlow, ndv * 0.6);
          col += uRim * fres * 1.1;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    // ── Halo of orbiting points ──
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // points on a fuzzy spherical shell, biased to an equatorial ring
      const r = 2.1 + (Math.random() - 0.5) * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const flat = 0.45; // squash toward a ring
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * flat;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    this.haloGeo = new THREE.BufferGeometry();
    this.haloGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.haloMat = new THREE.PointsMaterial({
      color: opts.palette.accent.clone().lerp(opts.palette.cream, 0.3),
      size: 0.02,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Points(this.haloGeo, this.haloMat);
    this.scene.add(this.halo);
  }

  update(state: SceneState): void {
    if (!this.material || !this.mesh || !this.halo) return;
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.05);
    this.mesh.rotation.y = this.pointer.x * 0.4 + state.scroll * 0.3;
    this.mesh.rotation.x = this.pointer.y * 0.25;
    this.halo.rotation.x = -0.5;
    if (!this.reduced) {
      this.material.uniforms.uTime.value = state.elapsed;
      this.halo.rotation.y = state.elapsed * 0.12;
      const pulse = 1 + Math.sin(state.elapsed * 0.6) * 0.015;
      this.mesh.scale.setScalar(pulse);
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
    this.haloGeo?.dispose();
    this.haloMat?.dispose();
    this.scene.clear();
    this.geometry = undefined;
    this.material = undefined;
    this.mesh = undefined;
    this.haloGeo = undefined;
    this.haloMat = undefined;
    this.halo = undefined;
  }
}

const factory: SceneFactory = () => new OrbScene();
export default factory;
