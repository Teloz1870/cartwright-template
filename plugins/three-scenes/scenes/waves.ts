import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "@/lib/three/types";
import { SIMPLEX_NOISE_GLSL } from "./glsl-noise";

/**
 * Waves — a full-bleed plane displaced by layered simplex noise in the vertex
 * shader (flowing dunes / silk / ocean), shaded with a palette gradient from
 * trough→crest + a fresnel sheen. One mesh, GPU morph → LCP/INP-friendly.
 * Premium organic hero; reads the active brand palette so it always matches.
 */
class WavesScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private geometry?: THREE.PlaneGeometry;
  private material?: THREE.ShaderMaterial;
  private mesh?: THREE.Mesh;
  private reduced = false;
  private readonly pointer = new THREE.Vector2();

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.camera.position.set(0, 1.7, 5.2);
    this.camera.lookAt(0, -0.2, 0);

    // Large plane, tilted to lie away from camera; high subdivision for smooth crests.
    this.geometry = new THREE.PlaneGeometry(20, 16, 200, 160);

    const trough = opts.palette.ink.clone();
    const crest = opts.palette.accent.clone();
    const sheen = opts.palette.accent.clone().lerp(opts.palette.cream, 0.5);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: opts.intensity },
        uTrough: { value: trough },
        uCrest: { value: crest },
        uSheen: { value: sheen },
      },
      vertexShader: /* glsl */ `
        ${SIMPLEX_NOISE_GLSL}
        uniform float uTime, uIntensity;
        varying float vH;
        varying vec3 vNormal;
        varying vec3 vView;
        float wave(vec2 p){
          float t = uTime * 0.18;
          float h = snoise(vec3(p * 0.35, t)) * 1.0;
          h += snoise(vec3(p * 0.8 + 4.0, t * 1.4)) * 0.45;
          h += snoise(vec3(p * 1.8 - 2.0, t * 0.7)) * 0.18;
          return h * (0.55 + uIntensity * 0.6);
        }
        void main(){
          vec3 p = position;
          float h = wave(p.xy);
          p.z += h;
          vH = h;
          // cheap normal from finite differences for the sheen
          float e = 0.25;
          float hx = wave(p.xy + vec2(e, 0.0));
          float hy = wave(p.xy + vec2(0.0, e));
          vNormal = normalize(vec3(h - hx, h - hy, e));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uTrough, uCrest, uSheen;
        varying float vH;
        varying vec3 vNormal;
        varying vec3 vView;
        void main(){
          float t = clamp(vH * 0.5 + 0.4, 0.0, 1.0);
          vec3 base = mix(uTrough, uCrest, t);
          float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 2.0);
          vec3 col = base + uSheen * fres * 0.5 * t;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2.35;
    this.scene.add(this.mesh);
  }

  update(state: SceneState): void {
    if (!this.material || !this.mesh) return;
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.04);
    // Gentle parallax steer from pointer + scroll.
    this.camera.position.x = this.pointer.x * 0.6;
    this.camera.position.y = 1.7 - this.pointer.y * 0.4 - state.scroll * 0.6;
    this.camera.lookAt(0, -0.2, 0);
    if (!this.reduced) this.material.uniforms.uTime.value = state.elapsed;
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

const factory: SceneFactory = () => new WavesScene();
export default factory;
