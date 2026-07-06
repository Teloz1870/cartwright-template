import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "@/lib/three/types";

/**
 * Gridflow — a glowing perspective grid floor (+ faint ceiling) flowing toward
 * the viewer to a horizon, synthwave/retro-future style. Pure fragment-shader
 * grid on two planes → almost free. Lines glow in the brand accent on the brand
 * ink, with distance fade, so it reads premium-tech in any palette.
 */
class GridflowScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 60);
  private geometry?: THREE.PlaneGeometry;
  private floorMat?: THREE.ShaderMaterial;
  private ceilMat?: THREE.ShaderMaterial;
  private floor?: THREE.Mesh;
  private ceil?: THREE.Mesh;
  private reduced = false;
  private readonly pointer = new THREE.Vector2();

  private makeMat(opts: SceneMountOpts): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      // fwidth() in the grid function — derivatives are built-in on WebGL2 (the
      // LiveCanvas renderer), so no explicit extension is needed.
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: opts.intensity },
        uLine: { value: opts.palette.accent.clone().lerp(opts.palette.cream, 0.25) },
        uBase: { value: opts.palette.ink.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDepth;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform float uTime, uIntensity;
        uniform vec3 uLine, uBase;
        varying vec2 vUv;
        varying float vDepth;
        float gridLine(vec2 uv, float scale){
          vec2 g = abs(fract(uv * scale - 0.5) - 0.5) / fwidth(uv * scale);
          float l = min(g.x, g.y);
          return 1.0 - clamp(l, 0.0, 1.0);
        }
        void main(){
          // Scroll the grid toward the camera.
          vec2 uv = vUv;
          uv.y += uTime * (0.05 + uIntensity * 0.10);
          float line = gridLine(uv, 30.0);
          // Distance fade by view depth: bright near the camera → dark into the
          // distance (true fog regardless of plane geometry).
          float fade = clamp(exp(-vDepth * 0.085), 0.0, 1.0);
          float glow = line * fade * (1.1 + uIntensity * 0.6);
          vec3 col = mix(uBase, uLine, clamp(glow, 0.0, 1.0));
          float alpha = clamp(glow * 1.4, 0.0, 1.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
  }

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    // No scene.background → the canvas is transparent and the page's dark stage
    // shows through, with the glowing grid fading into it.
    this.camera.position.set(0, 1.1, 4);
    this.camera.lookAt(0, 0.1, -12);

    this.geometry = new THREE.PlaneGeometry(80, 80, 1, 1);

    this.floorMat = this.makeMat(opts);
    this.floor = new THREE.Mesh(this.geometry, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -1.3;
    this.scene.add(this.floor);

    // Faint mirrored ceiling for a tunnel feel.
    this.ceilMat = this.makeMat(opts);
    this.ceilMat.uniforms.uIntensity.value = opts.intensity * 0.55;
    this.ceil = new THREE.Mesh(this.geometry, this.ceilMat);
    this.ceil.rotation.x = Math.PI / 2;
    this.ceil.position.y = 3.0;
    this.scene.add(this.ceil);
  }

  update(state: SceneState): void {
    if (!this.floorMat || !this.ceilMat) return;
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.04);
    this.camera.position.x = this.pointer.x * 0.5;
    this.camera.lookAt(this.pointer.x * 0.2, 0.4, -6);
    if (!this.reduced) {
      const t = state.elapsed;
      this.floorMat.uniforms.uTime.value = t;
      this.ceilMat.uniforms.uTime.value = t;
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
    this.floorMat?.dispose();
    this.ceilMat?.dispose();
    this.scene.clear();
    this.geometry = undefined;
    this.floorMat = undefined;
    this.ceilMat = undefined;
    this.floor = undefined;
    this.ceil = undefined;
  }
}

const factory: SceneFactory = () => new GridflowScene();
export default factory;
