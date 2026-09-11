/**
 * Chrome registry — SERVER-only component map (Mixer 2.0 Phase 1).
 *
 * The render half of the chrome catalogue: maps every key in
 * lib/builder/chrome-catalog.ts → its React component, so headers/footers are
 * SELECTABLE parts. Consumed exclusively by server render seams —
 * app/[locale]/layout.tsx (chromeJson resolution) and the gated mixer-preview
 * route — NEVER by client components: the design chromes import their design
 * CSS (halo.css, flux.css, …) and `next/font`, which must stay out of client
 * bundles. `import "server-only"` enforces that at build time (the section
 * registry has the OPPOSITE contract — it feeds a client preview — which is
 * exactly why chrome gets its own registry instead of new section entries).
 *
 * Design chromes are resolved through the design registry (`getDesign(slug)
 * .siteChrome`) instead of a parallel static import list — designs/index.ts is
 * the ONE place that imports design packs, so a scaffold profile that prunes
 * packs (create-cartwright light codemods designs/{index,options}.ts) prunes
 * this registry automatically. A second import list here would 500 every page
 * of a pruned scaffold with "Module not found". This is safe on the render
 * path: the locale layout already transitively imports every registered pack
 * (lib/theme.ts → designs/index.ts), so it adds no new CSS/font weight.
 *
 * Adding a chrome: ship `siteChrome` on the pack, add the slug to
 * designs/chrome-slugs.ts + the catalogue's DESIGN_CHROMES list — the
 * chrome-registry unit test fails on any drift between the three.
 */
import "server-only";

import type { ComponentType } from "react";
import type { DesignChromeProps } from "@/designs/types";
import { getDesign } from "@/designs";
import { CHROME_CATALOG, type ChromeMeta } from "@/lib/builder/chrome-catalog";

// Neutral chrome parts (design-agnostic, cw-* palette-adaptive, always mixable).
import { MinimalHeader } from "@/components/chrome-parts/MinimalHeader";
import { CenteredHeader } from "@/components/chrome-parts/CenteredHeader";
import { MegaFooter } from "@/components/chrome-parts/MegaFooter";
import { SlimFooter } from "@/components/chrome-parts/SlimFooter";

export type ChromeRegistryEntry = ChromeMeta & {
  Component: ComponentType<DesignChromeProps>;
};

/** Neutral keys → components (the only chrome with no owning design pack). */
const NEUTRAL_COMPONENTS: Record<string, ComponentType<DesignChromeProps>> = {
  "minimal-header": MinimalHeader,
  "centered-header": CenteredHeader,
  "mega-footer": MegaFooter,
  "slim-footer": SlimFooter,
};

function resolveComponent(meta: ChromeMeta): ComponentType<DesignChromeProps> | undefined {
  if (!meta.designSlug) return NEUTRAL_COMPONENTS[meta.key];
  const chrome = getDesign(meta.designSlug)?.siteChrome;
  return meta.kind === "header" ? chrome?.Header : chrome?.Footer;
}

/** The full registry: catalogue metadata + component, keyed by chrome key. */
export const CHROME_REGISTRY: Record<string, ChromeRegistryEntry> = Object.fromEntries(
  CHROME_CATALOG.map((meta) => {
    const Component = resolveComponent(meta);
    if (!Component) {
      // Fail-fast at module init (same contract as the tool registry's
      // duplicate-name guard): the catalogue only lists REGISTERED designs, so
      // a missing component means a pack dropped its siteChrome (or a neutral
      // part lost its mapping) — a programming error, not a runtime condition.
      throw new Error(`CHROME_REGISTRY: catalogue key "${meta.key}" has no component mapping`);
    }
    return [meta.key, { ...meta, Component }];
  }),
);

export function getChromeComponent(
  key: string | null | undefined,
): ComponentType<DesignChromeProps> | undefined {
  if (!key) return undefined;
  return CHROME_REGISTRY[key]?.Component;
}
