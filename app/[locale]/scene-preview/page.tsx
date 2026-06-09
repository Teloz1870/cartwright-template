import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeatures } from "@/lib/brand";
import { getDesign } from "@/designs";
import { paletteToFullThemeCss } from "@/lib/theme";
import { isSceneId } from "@/lib/three/scenes/registry";
import { ThreeHero } from "@/components/ThreeHero";

/**
 * Scene preview — renders a single Live Canvas 3D scene full-bleed, in the
 * palette of a chosen design (so you can see how a scene combines with brand
 * colours). Used to record the 3D gallery previews on cartwright.app and to
 * iframe a live scene. Pure (no DB), always noindex; gated like mixer-preview:
 * dev renders, production only when `mixerPreviewEnabled` is on.
 *
 * Usage: /<locale>/scene-preview?scene=<id>&design=<slug>&intensity=0.85
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Scene preview",
};

export default async function ScenePreviewPage({
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const features = await getFeatures();
  if (!(process.env.NODE_ENV !== "production" || features.mixerPreviewEnabled)) notFound();

  const sp = await searchParams;
  const scene = typeof sp.scene === "string" && isSceneId(sp.scene) ? sp.scene : "aurora";
  const designSlug = typeof sp.design === "string" ? sp.design : "engineered";
  const intensityRaw = typeof sp.intensity === "string" ? Number(sp.intensity) : 0.85;
  const intensity = Number.isFinite(intensityRaw) ? Math.min(1, Math.max(0, intensityRaw)) : 0.85;

  // Inject the chosen design's palette so the scene reads its --color-sol-* vars.
  const design = getDesign(designSlug);
  const css = design ? paletteToFullThemeCss(design.tokens.palette) : "";
  // Dark stage (3D scenes pop on dark). Use the design's ink only if it's dark;
  // some designs' "ink" is a light text colour, so fall back to near-black.
  const isLight = (hex: string): boolean => {
    const c = hex.replace("#", "");
    if (c.length < 6) return false;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 130;
  };
  const ink = design?.tokens.palette.ink ?? "#0a0a0a";
  const bg = isLight(ink) ? "#0a0a0a" : ink;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bg,
        overflow: "hidden",
        // Cover the site chrome (header/footer/FAB from the locale layout) so the
        // preview is a clean full-bleed scene for the gallery + video capture.
        zIndex: 2147483600,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `${css}\nbody{margin:0;background:${bg};}` }} />
      <ThreeHero scene={scene} intensity={intensity} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
