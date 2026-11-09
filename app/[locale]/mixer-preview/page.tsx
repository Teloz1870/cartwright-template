import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { getDesign, type HomeGenomeCopy } from "@/designs";
import { getVertical, type VerticalPreset } from "@/verticals";
import { getFeatures } from "@/lib/brand";
import { decodeItems } from "@/lib/genome/list";
import { designToInlineCss, paletteToFullThemeCss } from "@/lib/theme";
import { getChromeMeta, isChromeSelectable } from "@/lib/builder/chrome-catalog";
import { CHROME_REGISTRY } from "@/lib/builder/chrome-registry";
import { designTracksPalette } from "@/designs/options";
import { LockedLookNotice } from "./LockedLookNotice";

/**
 * Mixer preview — renders any Skin (design) × Voice (vertical) combination,
 * EPHEMERALLY (in-memory, no DB write), so it can be embedded/iframed by the
 * public mixer and used by the admin mixer. The Voice's genome copy is built
 * from the preset and passed straight into the design's `genome` prop, and the
 * design's palette is injected — exactly like the real homepage, minus identity.
 *
 * Gated: always `noindex`; renders in dev, but in PRODUCTION only when the
 * `mixerPreviewEnabled` flag is on (default off → canaries 404 this route). It
 * reads NOTHING from the DB (pure from query + registries), so it cannot perturb
 * any existing route or the shop's stored genome.
 *
 * Usage: /<locale>/mixer-preview?design=<slug>&vertical=<slug>
 *        (+ optional &header=<chrome-key>&footer=<chrome-key> — Mixer 2.0)
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Mixer preview",
};

/** Build the homepage `genome` prop from a preset's overrides, anchoring missing
 *  fields to brand.website.* (so a design reads voice ?? anchor). */
function buildGenome(preset: VerticalPreset | null): HomeGenomeCopy | undefined {
  if (!preset) return undefined;
  const o = preset.genomeOverrides;
  const w = brand.website;
  return {
    hero: {
      eyebrow: o["home.hero.eyebrow"] ?? w.eyebrow,
      headline: o["home.hero.headline"] ?? w.headline,
      tagline: o["home.hero.tagline"] ?? w.tagline,
      cta: o["home.hero.cta"] ?? w.cta,
    },
    valueProps: {
      title: o["home.valueProps.title"] ?? w.valuePropsTitle,
      description: o["home.valueProps.description"] ?? w.valuePropsDescription,
    },
    valuePropsItems: decodeItems(o["home.valueProps.items"]),
    features: {
      title: o["home.features.title"] ?? w.featuresTitle,
      description: o["home.features.description"] ?? w.featuresDescription,
    },
    featuresItems: decodeItems(o["home.features.items"]),
    ctaFooter: {
      title: o["home.ctaFooter.title"] ?? w.ctaFooterTitle,
      description: o["home.ctaFooter.description"] ?? w.ctaFooterDescription,
      cta: o["home.ctaFooter.cta"] ?? w.ctaFooterCtaLabel,
    },
  };
}

export default async function MixerPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const features = await getFeatures();
  const allowed = process.env.NODE_ENV !== "production" || features.mixerPreviewEnabled;
  if (!allowed) notFound();

  const { locale } = await params;
  const sp = await searchParams;
  const designSlug = typeof sp.design === "string" ? sp.design : "aurora-site";
  const verticalSlug = typeof sp.vertical === "string" ? sp.vertical : null;

  const design = getDesign(designSlug);
  if (!design) notFound();

  // Mixer 2.0 Phase 1 — optional chrome-part params. When ?header=<key> /
  // ?footer=<key> name a registry chrome that is selectable on the previewed
  // design, it renders around the homepage INSTEAD of the design's own chrome
  // resolution (the locale layout still wraps the page in the SHOP's chrome —
  // this surface is for cropped/iframed part previews). Invalid keys are
  // ignored (fail-soft), so existing preview URLs render unchanged.
  const validChromeKey = (value: unknown, kind: "header" | "footer"): string | null => {
    if (typeof value !== "string" || !value) return null;
    const meta = getChromeMeta(value);
    return meta && meta.kind === kind && isChromeSelectable(meta, designSlug, design.mixable)
      ? value
      : null;
  };
  const headerKey = validChromeKey(sp.header, "header");
  const footerKey = validChromeKey(sp.footer, "footer");
  const previewHeaderEntry = headerKey ? CHROME_REGISTRY[headerKey] : undefined;
  const previewFooterEntry = footerKey ? CHROME_REGISTRY[footerKey] : undefined;
  const PreviewHeader = previewHeaderEntry?.Component;
  const PreviewFooter = previewFooterEntry?.Component;

  const preset = getVertical(verticalSlug);
  const genome = buildGenome(preset);

  // Skin×Voice mismatch hint: a Voice's palette only restyles packs whose
  // rendering tracks the injected sol-* / cw-* vars — a private-prefix
  // (locked-look) pack keeps its own accents, so the preview would silently
  // look like "the Voice did nothing". Surface that as a dismissible notice
  // (preview-only UI). Requires the Voice to actually CARRY a palette —
  // `VerticalPreset.palette` is optional, and a copy-/scene-only Voice has no
  // palette to be locked out (the preview then renders the design's own).
  const showLockedLookNotice = preset?.palette != null && !designTracksPalette(design);

  // The full VIBE: the Voice's palette wins over the Skin's, and the palette also
  // drives the palette-reactive 3D scene. Falls back to the design's own palette.
  const palette = preset?.palette ?? design.tokens.palette;
  const scene = preset?.scene ?? "aurora";
  const css = [designToInlineCss(design), paletteToFullThemeCss(palette)]
    .filter(Boolean)
    .join("\n");

  const Homepage = design.homepage;

  return (
    <>
      <style id="mixer-preview-tokens" dangerouslySetInnerHTML={{ __html: css }} />
      {PreviewHeader ? <PreviewHeader locale={locale} /> : null}
      <Homepage
        settings={null}
        locale={locale}
        featured={[]}
        categories={[]}
        threeD={{ enabled: true, scene, intensity: 0.7 }}
        editEnabled={false}
        genome={genome}
      />
      {PreviewFooter ? <PreviewFooter locale={locale} /> : null}
      {showLockedLookNotice ? <LockedLookNotice designName={design.name} /> : null}
    </>
  );
}
