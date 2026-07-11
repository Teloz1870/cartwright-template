/**
 * Generate marketplace-manifest.json — the single source of truth the
 * cartwright.app marketplace derives EVERY catalogue from (designs, voices,
 * scenes, svg-items, elements, looks), so the site never drifts behind the
 * engine. Emits from the engine's own registries (client-safe imports only —
 * no design packs / no server-only; the svg-items are pure zero-import server
 * components, rendered here to static markup). Run in `pnpm build`; the
 * committed JSON is what the public mirror serves and cartwright.app fetches
 * at build/ISR.
 *
 * Deterministic (no timestamps, stable gradient ids) so
 * marketplace-manifest.test.ts can fail CI if the committed file drifts from
 * the registries.
 *
 *   pnpm gen:manifest   # writes ./marketplace-manifest.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DESIGN_OPTIONS } from "@/designs/options";
import { DESIGN_TOKENS } from "@/designs/tokens";
import { CHROME_DESIGN_SLUGS } from "@/designs/chrome-slugs";
import { CHROME_CATALOG } from "@/lib/builder/chrome-catalog";
import { SCENE_REGISTRY, SCENE_IDS } from "@/lib/three/scenes/registry";
import { ELEMENTS_CATALOG } from "@/lib/builder/elements-catalog";
import { LOOKS } from "@/verticals/looks";
import { lookToComposition } from "@/lib/compositions/from-look";
import { pluginCatalogue } from "@/plugins/registry";
import { DESIGN_MOTIFS } from "@/components/svg-items/design-motifs";
import {
  SVG_ITEMS,
  OrbitMark,
  PrismMark,
  ConstellationMark,
  CometMark,
  SunburstMark,
  LatticeMark,
  WaveDivider,
  VineDivider,
  BloomIllustration,
  MountainIllustration,
  CrystalIllustration,
  MothIllustration,
  OrbitMarkLive,
  ConstellationTwinkle,
  CometStreak,
  WaveDividerFlow,
  VineDividerGrow,
  AuroraRibbon,
  ButterflySwarm,
  BloomOpen,
  FireflyField,
} from "@/components/svg-items";
import { kindergartenPreset } from "@/verticals/kindergarten/preset";
import { carpenterPreset } from "@/verticals/carpenter/preset";
import { cafePreset } from "@/verticals/cafe/preset";
import { salonPreset } from "@/verticals/salon/preset";
import { fablePreset } from "@/verticals/fable/preset";
import { dentistPreset } from "@/verticals/dentist/preset";
import { restaurantPreset } from "@/verticals/restaurant/preset";
import { fitnessPreset } from "@/verticals/fitness/preset";
import type { VerticalPreset } from "@/verticals/types";

/** slug → component, for server-rendering each item's static markup. */
const SVG_COMPONENTS: Record<string, ComponentType<{ className?: string }>> = {
  "orbit-mark": OrbitMark,
  "prism-mark": PrismMark,
  "constellation-mark": ConstellationMark,
  "comet-mark": CometMark,
  "sunburst-mark": SunburstMark,
  "lattice-mark": LatticeMark,
  "wave-divider": WaveDivider,
  "vine-divider": VineDivider,
  "bloom-illustration": BloomIllustration,
  "mountain-illustration": MountainIllustration,
  "crystal-illustration": CrystalIllustration,
  "moth-illustration": MothIllustration,
  "orbit-mark-live": OrbitMarkLive,
  "constellation-twinkle": ConstellationTwinkle,
  "comet-streak": CometStreak,
  "wave-divider-flow": WaveDividerFlow,
  "vine-divider-grow": VineDividerGrow,
  "aurora-ribbon": AuroraRibbon,
  "butterfly-swarm": ButterflySwarm,
  "bloom-open": BloomOpen,
  "firefly-field": FireflyField,
};

const PRESETS: VerticalPreset[] = [
  kindergartenPreset,
  carpenterPreset,
  cafePreset,
  salonPreset,
  fablePreset,
  dentistPreset,
  restaurantPreset,
  fitnessPreset,
];

function engineVersion(): string {
  try {
    const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf-8");
    const m = changelog.match(/^##\s+v(\d+\.\d+\.\d+)/m);
    return m ? m[1] : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function voiceFromPreset(p: VerticalPreset) {
  const id = p.identity ?? {};
  const ov = p.genomeOverrides ?? {};
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    keywords: p.keywords,
    tone: id.tone ?? "",
    audience: id.audience ?? "",
    formality: id.formality ?? "",
    vibe: id.vibe ?? "",
    suggestedDesign: p.suggestedDesignSlug ?? "",
    scene: p.scene ?? "",
    palette: p.palette ?? null,
    sampleEyebrow: ov["home.hero.eyebrow"] ?? "",
    sampleHeadline: ov["home.hero.headline"] ?? "",
  };
}

/** Build the manifest object (pure — reused by the drift test). */
export function buildManifest() {
  const designs = DESIGN_OPTIONS.map((d) => {
    const tok = DESIGN_TOKENS[d.slug];
    return {
      slug: d.slug,
      name: d.name,
      description: d.description,
      mode: d.mode,
      premium: d.premium,
      threeD: tok?.threeD ?? false,
      palette: tok?.palette ?? null,
      /** Signature SVG motif (svg-items slug) — null when the design has none. */
      motifSlug: DESIGN_MOTIFS[d.slug] ?? null,
      /** True when the pack owns its site-wide Shell/Header/Footer chrome. */
      hasOwnChrome: CHROME_DESIGN_SLUGS.has(d.slug),
    };
  });

  // Live Canvas scenes — label/description verbatim from the registry.
  const scenes = SCENE_IDS.map((id) => ({
    slug: id,
    label: SCENE_REGISTRY[id].label,
    description: SCENE_REGISTRY[id].description,
  }));

  // SVG item library — manifest data + the server-rendered static markup, so
  // consumers (cartwright.app gallery) can inline each item without running
  // React. Gradient ids are stable/namespaced per component, so the markup is
  // deterministic and self-resolving.
  const svgItems = SVG_ITEMS.map((item) => {
    const Component = SVG_COMPONENTS[item.slug];
    if (!Component) {
      throw new Error(`[gen:manifest] svg-item "${item.slug}" has no component mapping`);
    }
    return { ...item, markup: renderToStaticMarkup(createElement(Component)) };
  });

  // Mixer 2.0 Phase 1 — the chrome catalogue (selectable headers/footers).
  // Pure metadata from lib/builder/chrome-catalog.ts (client-safe; components
  // stay in the server-only chrome-registry). designSlug is null for the
  // neutral chrome parts.
  const chrome = CHROME_CATALOG.map((m) => ({
    key: m.key,
    kind: m.kind,
    label: m.label,
    designSlug: m.designSlug ?? null,
    mixable: m.mixable,
  }));

  // Mixer 2.0 Phase 2 — each look ships WITH its full installable artifact
  // (cartwright-composition-v1: skin + voice identity/copy + palette + chrome
  // + scene), so cartwright.app can offer "Download this look". Additive
  // within manifest v3.
  const looks = LOOKS.map((look) => ({
    ...look,
    composition: lookToComposition(look),
  }));

  // Installable plugins (cartwright-plugin-v1) — compact catalogue entries so
  // cartwright.app can show a plugin gallery. Additive within manifest v3.
  const plugins = pluginCatalogue();

  return {
    // v3: adds the `chrome` catalogue (v2 + chrome — otherwise unchanged),
    // the per-look `composition` artifact and the `plugins` catalogue (both
    // additive).
    $schema: "cartwright-marketplace-manifest-v3",
    version: engineVersion(),
    designs,
    voices: PRESETS.map(voiceFromPreset),
    scenes,
    svgItems,
    elements: ELEMENTS_CATALOG,
    looks,
    chrome,
    plugins,
  };
}

function main() {
  const manifest = buildManifest();
  const out = new URL("../marketplace-manifest.json", import.meta.url);
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(
    `[gen:manifest] wrote marketplace-manifest.json — ${manifest.designs.length} designs, ` +
      `${manifest.voices.length} voices, ${manifest.scenes.length} scenes, ` +
      `${manifest.svgItems.length} svg-items, ${manifest.elements.length} elements, ` +
      `${manifest.looks.length} looks, ${manifest.chrome.length} chromes, ` +
      `${manifest.plugins.length} plugins, v${manifest.version}`,
  );
}

// Run when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
