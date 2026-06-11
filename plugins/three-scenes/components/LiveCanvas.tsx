"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { supportsWebGL2 } from "@/lib/features";
import { createRenderer } from "@/plugins/three-scenes/lib/renderer";
import { createFrameLoop, clampDpr, type FrameLoop } from "@/plugins/three-scenes/lib/loop";
import { SCENE_REGISTRY } from "@/plugins/three-scenes/scenes/registry";
import type { SceneId, ThreePalette, ThreeScene } from "@/lib/three/types";

/**
 * Cartwright Live Canvas — the orchestrator. NEVER imported directly by a
 * design pack; always via components/ThreeHero.tsx (dynamic, ssr:false), so
 * three.js stays out of every first-load bundle and there is zero SSR/hydration
 * surface.
 *
 * Correctness contract:
 * - Gating cascade: WebGL2 + not reduced-motion (else single static frame) +
 *   not saveData. If gates fail, render nothing → the design pack's own gradient
 *   is the guaranteed fallback (this canvas is a decorative overlay).
 * - Pause the rAF loop when off-screen (IntersectionObserver) or the tab is
 *   hidden (visibilitychange) — no wasted CPU/GPU/battery.
 * - Teardown disposes the scene, the renderer, forces GL context loss, and
 *   removes every observer/listener — no detached contexts accumulate on
 *   route changes. This is the single most important part of the file.
 */

type Props = {
  scene: SceneId;
  /** 0..1 density/speed/amplitude. */
  intensity: number;
  className?: string;
};

function cssColor(name: string, fallback: string): THREE.Color {
  if (typeof document === "undefined") return new THREE.Color(fallback);
  let v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // THREE.Color rejects 8-digit hex (#rrggbbaa) — drop the alpha channel.
  const hex8 = v.match(/^#([0-9a-fA-F]{8})$/);
  if (hex8) v = "#" + hex8[1].slice(0, 6);
  try {
    return new THREE.Color(v || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function readPalette(): ThreePalette {
  return {
    accent: cssColor("--color-sol-accent", "#1e3f5a"),
    accentDeep: cssColor("--color-sol-accent-deep", "#0f2438"),
    cream: cssColor("--color-sol-cream", "#f4efe6"),
    sand: cssColor("--color-sol-sand", "#e8e1d3"),
    ink: cssColor("--color-sol-ink", "#1a1a1a"),
    muted: cssColor("--color-sol-muted", "#726d62"),
  };
}

export default function LiveCanvas({ scene, intensity, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (!supportsWebGL2() || conn?.saveData === true) {
      return; // gates failed → render nothing, gradient fallback remains
    }

    let disposed = false;
    let renderer: THREE.WebGLRenderer | undefined;
    let active: ThreeScene | undefined;
    let loop: FrameLoop | undefined;
    let ro: ResizeObserver | undefined;
    let io: IntersectionObserver | undefined;

    const pointer = { x: 0, y: 0 };
    let scrollN = 0;
    let onScreen = true;
    let quality = 1;

    const computeScroll = () => {
      const h = window.innerHeight || 1;
      scrollN = Math.min(1, Math.max(0, window.scrollY / h));
    };
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / (window.innerWidth || 1)) * 2 - 1;
      pointer.y = -((e.clientY / (window.innerHeight || 1)) * 2 - 1);
    };
    const sync = () => {
      if (!loop || reduced) return;
      if (onScreen && !document.hidden) loop.start();
      else loop.stop();
    };

    const applySize = () => {
      if (!renderer || !active) return;
      const w = canvas.clientWidth || canvas.offsetWidth || 1;
      const h = canvas.clientHeight || canvas.offsetHeight || 1;
      const dpr = clampDpr(quality);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      active.resize(w, h, dpr);
    };

    (async () => {
      const { renderer: r } = await createRenderer(canvas);
      if (disposed) {
        r.dispose();
        return;
      }
      renderer = r;

      const mod = await SCENE_REGISTRY[scene].load();
      if (disposed) {
        renderer.dispose();
        renderer.forceContextLoss();
        return;
      }
      active = mod.default();
      active.mount({ renderer, palette: readPalette(), intensity, reducedMotion: reduced });

      computeScroll();
      applySize();

      ro = new ResizeObserver(() => applySize());
      ro.observe(canvas);
      io = new IntersectionObserver(
        ([entry]) => {
          onScreen = entry.isIntersecting;
          sync();
        },
        { threshold: 0 },
      );
      io.observe(canvas);
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("scroll", computeScroll, { passive: true });
      document.addEventListener("visibilitychange", sync);

      loop = createFrameLoop((dt, elapsed, q) => {
        if (!renderer || !active) return;
        if (q !== quality) {
          quality = q;
          active.setQuality?.(q);
          applySize(); // re-apply DPR at the new quality tier
        }
        active.update({ scroll: scrollN, pointer, elapsed, dt });
        active.render(renderer);
      });

      if (reduced) {
        // Single static frame — no continuous animation under reduced-motion.
        active.update({ scroll: 0, pointer: { x: 0, y: 0 }, elapsed: 0, dt: 0 });
        active.render(renderer);
      } else {
        loop.start();
      }
    })();

    return () => {
      disposed = true;
      loop?.stop();
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", computeScroll);
      document.removeEventListener("visibilitychange", sync);
      active?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, [scene, intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? "pointer-events-none absolute inset-0 h-full w-full"}
    />
  );
}
