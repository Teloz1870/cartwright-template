"use client";

/**
 * Studio hero background — a real three.js GLSL shader (flowing aurora ribbons
 * in the brand mint/navy palette, subtle mouse warp). Raw `three` (already a
 * dependency), no react-three-fiber. Sized to its container, alpha so it blends
 * over the page; static single frame under prefers-reduced-motion; full cleanup
 * on unmount. Pure decoration → aria-hidden, pointer-events none (set in CSS).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float iTime;
  uniform vec2  iResolution;
  uniform vec2  iMouse;
  varying vec2  vUv;

  // Ashima simplex noise (2D)
  vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
  vec2 mod289(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }
  vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ s += a * snoise(p); p *= 2.02; a *= 0.5; }
    return s;
  }

  void main(){
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    p.x *= iResolution.x / max(iResolution.y, 1.0);

    float t = iTime * 0.05;
    vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 - t + 5.2));
    float n = fbm(p * 2.0 + q * 1.2 + vec2(0.0, t * 2.0));

    // subtle mouse warmth
    float md = distance(uv, iMouse);
    n += smoothstep(0.45, 0.0, md) * 0.18;

    float bands = smoothstep(0.05, 0.7, n);
    vec3 navy  = vec3(0.04, 0.09, 0.13);
    vec3 teal  = vec3(0.37, 0.90, 0.77);
    vec3 amber = vec3(0.91, 0.63, 0.42);
    vec3 col = mix(navy, teal, bands);
    col = mix(col, amber, smoothstep(0.78, 1.0, n) * 0.22);

    float vignette = smoothstep(1.15, 0.15, length(p));
    float alpha = bands * vignette * 0.85;
    gl_FragColor = vec4(col, alpha);
  }
`;

export default function StudioHeroCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL → graceful: CSS aurora stays as the backdrop
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2(1, 1) },
      iMouse: { value: new THREE.Vector2(0.5, 0.6) },
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      uniforms.iResolution.value.set(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onMove = (e: MouseEvent) => {
      const r = container.getBoundingClientRect();
      uniforms.iMouse.value.set(
        (e.clientX - r.left) / r.width,
        1 - (e.clientY - r.top) / r.height,
      );
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      uniforms.iTime.value = (now - start) / 1000;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    if (reduce) {
      renderer.render(scene, camera); // single static frame
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={ref} className="studio__three" aria-hidden="true" />;
}
