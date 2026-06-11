import { ThreeHero } from "./ThreeHero";

/**
 * DesignHero — one-line premium 3D hero for any design pack. Sugar over
 * <ThreeHero scene="aurora" /> (the reusable palette-driven GLSL aurora). Place
 * it absolutely-positioned behind a pack's hero content; it inherits LiveCanvas's
 * WebGL2 / reduced-motion / saveData gating and renders nothing when unsupported
 * (the pack's own CSS background remains the visible fallback).
 *
 *   {brand.features.threeD && <DesignHero className="absolute inset-0 -z-10" />}
 *
 * Colours come from the active brand palette (--color-sol-*), so the hero is
 * on-brand automatically across packs.
 */
export function DesignHero({
  intensity = 0.7,
  className,
}: {
  /** 0..1 density/brightness. Default 0.7. */
  intensity?: number;
  className?: string;
}) {
  return <ThreeHero scene="aurora" intensity={intensity} className={className} />;
}
