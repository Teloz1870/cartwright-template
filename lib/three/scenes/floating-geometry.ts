import * as THREE from "three";

import type {
  SceneFactory,
  SceneMountOpts,
  SceneState,
  ThreeScene,
} from "../types";

/**
 * Floating glassy geometry — a handful of low-poly solids drifting and slowly
 * rotating, tinted from the brand palette, lit by an accent-coloured key light.
 * CPU-animated (few objects → cheap); honours reduced-motion by freezing.
 */
class FloatingGeometryScene implements ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  private readonly group = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly bodies: { mesh: THREE.Mesh; spin: THREE.Vector3; phase: number }[] = [];
  private reduced = false;
  private intensity = 1;
  private quality = 1;
  private readonly pointer = new THREE.Vector2();

  mount(opts: SceneMountOpts): void {
    this.reduced = opts.reducedMotion;
    this.intensity = opts.intensity;
    this.camera.position.set(0, 0, 6);
    this.scene.add(this.group);

    // Use the FOREGROUND palette (accent/ink/muted) — never cream/sand/
    // accentDeep, which are background tones and vanish on dark themes.
    const blend = opts.palette.accent.clone().lerp(opts.palette.ink, 0.45);
    const palette = [opts.palette.accent, opts.palette.ink, opts.palette.muted, blend];
    const geos: THREE.BufferGeometry[] = [
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.BoxGeometry(1.3, 1.3, 1.3),
      new THREE.TorusGeometry(0.9, 0.32, 16, 48),
      new THREE.OctahedronGeometry(1.1, 0),
      new THREE.DodecahedronGeometry(0.95, 0),
    ];
    geos.forEach((g) => this.disposables.push(g));

    const count = 5;
    for (let i = 0; i < count; i++) {
      const geo = geos[i % geos.length];
      const mat = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length].clone(),
        roughness: 0.25,
        metalness: 0.35,
        flatShading: true,
        transparent: true,
        opacity: 0.92,
      });
      this.disposables.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2;
      const radius = 2.6 + this.intensity * 0.8;
      mesh.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.3) * 1.4, -i * 0.6);
      const s = 0.55 + (i % 3) * 0.18;
      mesh.scale.setScalar(s);
      this.group.add(mesh);
      this.bodies.push({
        mesh,
        spin: new THREE.Vector3(0.1 + Math.random() * 0.2, 0.12 + Math.random() * 0.22, 0),
        phase: angle,
      });
    }

    const ambient = new THREE.AmbientLight(opts.palette.ink.clone(), 0.55);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 4, 5);
    const rim = new THREE.PointLight(opts.palette.accent.clone(), 1.1, 30);
    rim.position.set(-4, -2, 3);
    this.scene.add(ambient, key, rim);
  }

  update(state: SceneState): void {
    this.pointer.lerp(new THREE.Vector2(state.pointer.x, state.pointer.y), 0.06);
    // Pointer parallax + scroll drift always apply (subtle, not "motion").
    this.group.rotation.y = this.pointer.x * 0.4;
    this.group.rotation.x = this.pointer.y * 0.25 - state.scroll * 0.3;
    this.group.position.y = state.scroll * 1.5;
    if (this.reduced) return;
    const k = this.intensity;
    for (const b of this.bodies) {
      b.mesh.rotation.x += b.spin.x * state.dt * k;
      b.mesh.rotation.y += b.spin.y * state.dt * k;
      b.mesh.position.y += Math.sin(state.elapsed * 0.6 + b.phase) * 0.0025 * k;
    }
    this.group.rotation.z = Math.sin(state.elapsed * 0.1) * 0.05 * k;
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setQuality(quality: number): void {
    if (quality === this.quality) return;
    this.quality = quality;
    // At low quality, hide the rear-most bodies to cut overdraw.
    const visible = quality >= 1 ? 5 : quality >= 0.66 ? 4 : 3;
    this.bodies.forEach((b, i) => (b.mesh.visible = i < visible));
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.bodies.length = 0;
    this.scene.clear();
  }
}

const factory: SceneFactory = () => new FloatingGeometryScene();
export default factory;
