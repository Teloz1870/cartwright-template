import { z } from "zod";
import { ThreeHero } from "@/components/ThreeHero";
import type { SceneId } from "@/lib/three/types";
import { StudioHero } from "./StudioHero";

/**
 * Hero with a palette-reactive 3D scene behind it (Live Canvas). A builder Part:
 * composes the standard StudioHero copy with a chosen 3D scene background, so you
 * can drop a premium 3D hero onto ANY page via the Visual Builder / mixer.
 *
 * Client-safe (sync, prop-driven): <ThreeHero> is a `next/dynamic(ssr:false)`
 * wrapper that self-gates WebGL2 / reduced-motion / saveData and lazy-loads
 * three.js — so this satisfies the section-registry contract and three never
 * lands in a first-load bundle. The scene reads --color-sol-*, so it adopts the
 * active brand/Voice palette automatically.
 */

const SCENE_VALUES = [
  "aurora",
  "waves",
  "orb",
  "gridflow",
  "blob",
  "particles",
  "wireframe",
  "floating-geometry",
  "butterflies",
] as const satisfies readonly SceneId[];

export const heroAuroraSchema = z
  .object({
    eyebrow: z.string().optional(),
    headline: z.string().min(1),
    headlineAccent: z.string().optional(),
    tagline: z.string().min(1),
    ctaLabel: z.string().min(1),
    ctaHref: z.string().min(1),
    secondaryCtaLabel: z.string().optional(),
    secondaryCtaHref: z.string().optional(),
    microcopy: z.string().optional(),
    scene: z.enum(SCENE_VALUES).default("aurora"),
    intensity: z.number().min(0).max(1).default(0.7),
  })
  .strict();

export type HeroAuroraProps = z.infer<typeof heroAuroraSchema>;

export const heroAuroraDefaults: HeroAuroraProps = {
  eyebrow: "Live Canvas",
  headline: "A hero that moves",
  headlineAccent: "",
  tagline:
    "Drop a palette-reactive 3D scene behind any hero — it adopts your brand colours automatically.",
  ctaLabel: "Get started",
  ctaHref: "/contact",
  secondaryCtaLabel: "",
  secondaryCtaHref: "",
  microcopy: "",
  scene: "aurora",
  intensity: 0.7,
};

/**
 * In-place-editing hooks (annotateEdit) — IKKE en del af builder-Part-schemaet
 * (heroAuroraSchema er strict og styrer kun governed DATA); attrs'ene er rene
 * render-props som spredes videre til StudioHero. Undefined ⇒ byte-identisk.
 */
type EditHookProps = {
  headlineAttrs?: Record<string, string>;
  taglineAttrs?: Record<string, string>;
};

export function StudioHeroAurora({
  scene,
  intensity,
  ...hero
}: HeroAuroraProps & EditHookProps) {
  return (
    <div className="motion-aurora-bg relative isolate">
      <ThreeHero
        scene={scene}
        intensity={intensity}
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70"
      />
      <StudioHero {...hero} />
    </div>
  );
}
