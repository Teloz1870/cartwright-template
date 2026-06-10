import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "../types";
import { SIMPLEX_NOISE_GLSL } from "./glsl-noise";

/**
 * Butterflies — an instanced flock of palette-tinted butterflies drifting on
 * analytic Lissajous paths. One InstancedMesh, all motion in the vertex shader
 * (flight, heading, wing flap) so per-frame CPU cost is zero; the fragment
 * shader paints each wing procedurally (two-lobe silhouette, shimmer band,
 * ink rim) so no textures ship. Normal blending over the light ivory page —
 * additive would wash out. The metamorphosis showpiece of the flagship design.
 */

/** Reduced motion: freeze the clock at a seeded constant → static mid-pose scatter. */
const FROZEN_TIME = 19.47;

/**
 * Merge two 3×2-segment wing planes into one butterfly. Per-vertex extras:
 * aSide (-1 left / +1 right) and aFold (0 at the body axis → 1 at the wing
 * tip) so the flap rotation can leave the wing roots attached to the body.
 * UVs run root→tip on BOTH wings (mirrored geometry, shared wing pattern).
 */
const buildButterflyGeometry = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const sides: number[] = [];
  const folds: number[] = [];
  const indices: number[] = [];

  for (const side of [-1, 1]) {
    const wing = new THREE.PlaneGeometry(1, 0.9, 3, 2);
    wing.translate(0.5, 0, 0); // wing root at x = 0, tip at x = 1
    const pos = wing.attributes.position;
    const uv = wing.attributes.uv;
    const offset = positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      positions.push(x * side, pos.getY(i), 0);
      uvs.push(uv.getX(i), uv.getY(i)); // already root→tip after translate
      sides.push(side);
      folds.push(x);
    }
    const idx = wing.index!;
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    wing.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aSide", new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute("aFold", new THREE.Float32BufferAttribute(folds, 1));
  geometry.setIndex(indices);
  return geometry;
};

class ButterfliesScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
  private geometry?: THREE.BufferGeometry;
  private material?: THREE.ShaderMaterial;
  private mesh?: THREE.InstancedMesh;
  private total = 0;
  private reduced = false;
  private readonly pointer = new THREE.Vector2();

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.camera.position.set(0, 0, 10);

    this.total = Math.round(36 + opts.intensity * 110);
    this.geometry = buildButterflyGeometry();

    // Per-instance flight DNA: seed, flap phase, size, palette tint and a
    // Lissajous path (xyz angular frequencies + radius). Generated once.
    const seeds = new Float32Array(this.total);
    const phases = new Float32Array(this.total);
    const scales = new Float32Array(this.total);
    const tints = new Float32Array(this.total);
    const paths = new Float32Array(this.total * 4);
    const pace = 0.7 + 0.6 * opts.intensity;
    for (let i = 0; i < this.total; i++) {
      seeds[i] = Math.random();
      phases[i] = Math.random() * Math.PI * 2;
      scales[i] = 0.22 + Math.random() * 0.5;
      tints[i] = Math.random();
      paths[i * 4] = (0.18 + Math.random() * 0.37) * pace;
      paths[i * 4 + 1] = (0.18 + Math.random() * 0.37) * pace;
      paths[i * 4 + 2] = (0.18 + Math.random() * 0.37) * pace;
      // Orbit radius kept tighter than the centre-clearing so the flock
      // frames the copy; the simplex wobble still lets strays drift across.
      paths[i * 4 + 3] = 1.0 + Math.random() * 1.7;
    }
    this.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    this.geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    this.geometry.setAttribute("aScale", new THREE.InstancedBufferAttribute(scales, 1));
    this.geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 1));
    this.geometry.setAttribute("aPath", new THREE.InstancedBufferAttribute(paths, 4));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: this.reduced ? FROZEN_TIME : 0 },
        uScroll: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uGlow: { value: opts.intensity },
        uColorA: { value: opts.palette.accent.clone() },
        uColorB: { value: opts.palette.accentDeep.clone() },
        uColorC: { value: opts.palette.cream.clone() },
        uInk: { value: opts.palette.ink.clone() },
      },
      vertexShader: /* glsl */ `
        ${SIMPLEX_NOISE_GLSL}
        attribute float aSide, aFold, aSeed, aPhase, aScale, aTint;
        attribute vec4 aPath;
        uniform float uTime, uScroll;
        uniform vec2 uPointer;
        varying vec2 vWing;
        varying float vTint, vFlap, vDepth;

        void main(){
          float t = uTime;

          // Hashed home anchor per butterfly — zero CPU, stable scatter.
          vec3 home = vec3(
            (fract(aSeed * 17.31) - 0.5) * 12.0,
            (fract(aSeed * 9.77) - 0.5) * 7.0,
            (fract(aSeed * 13.53) - 0.5) * 6.0 - 2.0
          );

          // Keep a reading-clearing at the page centre: anchors that land
          // inside the central ellipse are re-anchored to a ring just outside
          // it, so the flock frames the headline instead of covering it.
          vec2 clearAxes = vec2(4.1, 2.9);
          vec2 eN = home.xy / clearAxes;
          float eD = length(eN);
          if (eD < 1.0) {
            vec2 dir = eD > 0.001 ? eN / eD : vec2(1.0, 0.0);
            home.xy = dir * clearAxes * mix(1.08, 1.5, fract(aSeed * 31.7));
          }

          // Analytic Lissajous flight (y damped → flight reads horizontal).
          vec3 w = aPath.xyz;
          float R = aPath.w;
          vec3 ph = vec3(aPhase, aPhase * 1.7 + 1.3, aPhase * 2.3 + 4.1);
          vec3 orbit = vec3(
            R * sin(w.x * t + ph.x),
            R * 0.6 * sin(w.y * t + ph.y),
            R * sin(w.z * t + ph.z)
          );
          // Heading from the analytic velocity (exact derivative, cos terms).
          vec3 vel = vec3(
            R * w.x * cos(w.x * t + ph.x),
            R * 0.6 * w.y * cos(w.y * t + ph.y),
            R * w.z * cos(w.z * t + ph.z)
          );
          // Low-frequency simplex wobble so paths never read as clockwork.
          orbit += 0.45 * vec3(
            snoise(vec3(aSeed * 10.0, t * 0.18, 1.7)),
            snoise(vec3(aSeed * 10.0 + 7.0, t * 0.15, 4.2)),
            snoise(vec3(aSeed * 10.0 + 13.0, t * 0.21, 8.9))
          );

          vec3 center = home + orbit;
          center.y += uScroll * 2.5; // flock drifts upward with page scroll

          // Pointer: gentle swarm parallax, depth-weighted per instance…
          center.xy += uPointer * vec2(0.7, 0.45) * (0.3 + 0.7 * fract(aSeed * 23.1));
          // …plus a soft radial scatter within ~1.5u of the cursor.
          vec2 pw = uPointer * vec2(6.0, 3.8);
          vec2 away = center.xy - pw;
          float pd = length(away);
          center.xy += (away / max(pd, 0.001)) * smoothstep(1.5, 0.0, pd) * 1.1;

          // Alternate flap bursts and glides: a slow per-instance sine gates
          // the flap amplitude (the naturalism trick).
          float glide = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(t * (0.4 + 0.5 * aSeed) + aSeed * 6.2831));
          float flap = sin(t * (5.0 + 4.0 * aSeed) + aPhase) * mix(0.5, 1.05, glide);
          vFlap = flap;

          // Fold wings around the body axis; aFold weights the rotation so
          // the wing roots stay attached while tips sweep furthest.
          float ang = flap * mix(0.4, 1.3, aFold);
          vec3 folded = vec3(position.x * cos(ang), position.y, abs(position.x) * sin(ang));

          // Orient the body along the flight direction.
          vec3 fwd = normalize(vel + vec3(0.0, 0.0, 0.0001));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd) + vec3(0.0001));
          vec3 up = cross(fwd, side);
          vec3 world = center + (side * folded.x + fwd * folded.y + up * folded.z) * aScale;

          vWing = uv;
          vTint = aTint;
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          vDepth = clamp((-mv.z - 5.0) / 12.0, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColorA, uColorB, uColorC, uInk;
        uniform float uGlow;
        varying vec2 vWing;
        varying float vTint, vFlap, vDepth;

        float lobe(vec2 p, vec2 c, vec2 r){
          vec2 q = (p - c) / r;
          return dot(q, q);
        }

        void main(){
          // Two-lobe silhouette: forewing + hindwing ellipses in wing space
          // (x: 0 body root → 1 tip, y: 0 trailing → 1 leading edge).
          float fore = lobe(vWing, vec2(0.46, 0.66), vec2(0.46, 0.33));
          float hind = lobe(vWing, vec2(0.30, 0.28), vec2(0.36, 0.30));
          float d = min(fore, hind);
          if (d > 1.0) discard;
          float fill = smoothstep(1.0, 0.86, d);

          // Palette fill in three per-instance families so the flock isn't a
          // single colour: ~55% accent→deep gradient, ~25% pale cream/sand
          // wings with an accent edge, ~20% soft mid-tones toward muted.
          float radial = clamp(length(vWing - vec2(0.0, 0.45)) * 0.9, 0.0, 1.0);
          vec3 col;
          if (vTint > 0.75) {
            // Pale family: cream body graded toward sand, accent leading edge.
            col = mix(uColorC, mix(uColorC, uColorB, 0.35), radial);
            col = mix(col, uColorA, smoothstep(0.75, 1.0, vWing.y) * 0.35);
          } else if (vTint > 0.55) {
            // Soft family: muted wash between cream and accent.
            col = mix(mix(uColorA, uColorC, 0.55), uColorB, radial * 0.6);
          } else {
            // Accent family: the signature accent → deep gradient.
            col = mix(uColorA, uColorB, clamp(vTint * 0.9 + radial * 0.55, 0.0, 1.0));
          }

          // Cream shimmer band — sharpest mid-flap, when the wing squares up
          // to the viewer (fake iridescence).
          float open = 1.0 - clamp(abs(vFlap), 0.0, 1.0);
          float bandPos = 0.52 + 0.18 * sin(vTint * 12.566);
          float band = smoothstep(mix(0.30, 0.10, open), 0.0, abs(vWing.x - bandPos));
          col = mix(col, uColorC, band * (0.25 + 0.5 * open));

          // Ink rim + a thin body down the root.
          float rim = smoothstep(0.80, 1.0, d);
          col = mix(col, uInk, rim * 0.8);
          float body = smoothstep(0.07, 0.015, vWing.x) * smoothstep(1.0, 0.55, abs(vWing.y - 0.45) * 2.2);
          col = mix(col, uInk, body * 0.9);

          // Small accent glow at the rim, scaled by intensity. Normal
          // blending throughout — additive washes out on light ivory.
          col += uColorA * rim * fill * 0.3 * uGlow;

          float alpha = fill * mix(0.95, 0.55, vDepth);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.total);
    this.mesh.frustumCulled = false; // positions live in the vertex shader
    this.scene.add(this.mesh);
  }

  update(state: SceneState): void {
    if (!this.material) return;
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.06);
    this.material.uniforms.uPointer.value.copy(this.pointer);
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

  setQuality(quality: number): void {
    if (!this.mesh) return;
    this.mesh.count = Math.max(8, Math.floor(this.total * quality));
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    this.mesh?.dispose();
    this.scene.clear();
    this.geometry = undefined;
    this.material = undefined;
    this.mesh = undefined;
  }
}

const factory: SceneFactory = () => new ButterfliesScene();
export default factory;
