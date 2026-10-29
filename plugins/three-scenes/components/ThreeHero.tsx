"use client";

import dynamic from "next/dynamic";

import type { SceneId } from "@/lib/three/types";

/**
 * The ONLY entry point design packs use for the Live Canvas. Dynamic + ssr:false
 * is enforced here in one place, so three.js never SSR-renders and never lands
 * in a first-load chunk. Design packs render:
 *
 *   {brand.features.threeD && <ThreeHero scene={cfg.scene} intensity={cfg.intensity} />}
 *
 * The flag gate lives at the mount site; LiveCanvas adds the capability /
 * reduced-motion / saveData gates. When anything fails, nothing renders and the
 * pack's own gradient remains the visible background.
 *
 * `className` is MERGED with the full-bleed default
 * (`pointer-events-none absolute inset-0 h-full w-full`) — it never replaces
 * it. Pass additions like `opacity-70` or `-z-10`; a conflicting utility
 * (e.g. `h-screen`) wins over the default via tailwind-merge. Omitting it
 * gives the bare full-bleed canvas.
 */

const LiveCanvas = dynamic(() => import("./LiveCanvas"), {
  ssr: false,
  loading: () => null,
});

export function ThreeHero({
  scene,
  intensity,
  className,
}: {
  scene: SceneId;
  intensity: number;
  /**
   * Extra classes for the canvas — merged with (never replacing) the
   * full-bleed default `pointer-events-none absolute inset-0 h-full w-full`.
   */
  className?: string;
}) {
  return <LiveCanvas scene={scene} intensity={intensity} className={className} />;
}
