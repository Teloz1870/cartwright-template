/**
 * Studio 3D showroom — a premium product showroom built on the Live Canvas (a
 * Cartwright **Pro** Part). A dark stage with a palette-reactive 3D scene as the
 * centrepiece, framed with the product name, tagline, spec chips and a CTA — the
 * "see it in 3D" moment. Reuses the shared <ThreeHero> (next/dynamic ssr:false →
 * self-gates WebGL2 / reduced-motion / saveData, lazy-loads three.js), so this is
 * a sync, prop-driven server component (satisfies the section-registry contract)
 * and three never lands in a first-load bundle.
 */
import { z } from "zod";
import { ThreeHero } from "@/components/ThreeHero";
import type { SceneId } from "@/lib/three/scene-ids";

const SCENE_VALUES = [
  "orb",
  "blob",
  "aurora",
  "waves",
  "gridflow",
  "particles",
  "wireframe",
  "floating-geometry",
] as const satisfies readonly SceneId[];

export const showroom3dSchema = z
  .object({
    eyebrow: z.string().optional(),
    productName: z.string().min(1),
    tagline: z.string().optional(),
    scene: z.enum(SCENE_VALUES).default("orb"),
    intensity: z.number().min(0).max(1).default(0.75),
    specs: z
      .array(z.object({ label: z.string().min(1), value: z.string().min(1) }))
      .max(6)
      .default([]),
    ctaLabel: z.string().optional(),
    ctaHref: z.string().optional(),
  })
  .strict();

export type StudioShowroom3DProps = z.infer<typeof showroom3dSchema>;

export const showroom3dDefaults: StudioShowroom3DProps = {
  eyebrow: "In the showroom",
  productName: "The Signature",
  tagline: "Turn it. Light it. See every angle before you buy.",
  scene: "orb",
  intensity: 0.78,
  specs: [
    { label: "Material", value: "Anodised alloy" },
    { label: "Weight", value: "320 g" },
    { label: "Finish", value: "6 colours" },
    { label: "Warranty", value: "10 years" },
  ],
  ctaLabel: "Configure yours",
  ctaHref: "#configure",
};

export function StudioShowroom3D({
  eyebrow,
  productName,
  tagline,
  scene,
  intensity,
  specs,
  ctaLabel,
  ctaHref,
}: StudioShowroom3DProps) {
  return (
    <section className="border-b border-cw-stone-200 bg-cw-paper py-20 dark:border-cw-stone-800 dark:bg-cw-stone-900/40 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-cw-ink text-white shadow-2xl">
          {/* the 3D stage */}
          <div className="relative h-[26rem] sm:h-[34rem]">
            <ThreeHero
              scene={scene}
              intensity={intensity}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-cw-ink via-cw-ink/20 to-transparent" />
            <div className="absolute left-6 top-6">
              <span className="rounded-full border border-white/20 bg-black/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white/70 backdrop-blur-sm">
                ◐ 3D · live
              </span>
            </div>
            <div className="absolute inset-x-6 bottom-6 sm:inset-x-10 sm:bottom-9">
              {eyebrow && (
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">{eyebrow}</p>
              )}
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{productName}</h2>
              {tagline && <p className="mt-3 max-w-xl text-base text-white/70 sm:text-lg">{tagline}</p>}
            </div>
          </div>

          {/* spec rail + CTA */}
          {(specs.length > 0 || ctaLabel) && (
            <div className="flex flex-wrap items-center justify-between gap-6 border-t border-white/10 px-6 py-6 sm:px-10">
              {specs.length > 0 && (
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  {specs.map((s) => (
                    <div key={s.label}>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                        {s.label}
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-white">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {ctaLabel && (
                <a
                  href={ctaHref ?? "#"}
                  className="rounded-full bg-cw-terracotta px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                >
                  {ctaLabel}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
