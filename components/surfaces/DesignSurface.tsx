import type { CSSProperties, ReactNode } from "react";

/**
 * Mixer 2.0 Phase 4 — designSurfaces ("backend follows frontend").
 *
 * Shared vocabulary for the design-adaptive variants of the storefront pages
 * that historically had NO design hook (cart, checkout, account(+subpages),
 * blog, services, cases, priser, order/[id]). Rendered ONLY when
 * `brand.features.designSurfaces` is on — every page keeps its legacy markup
 * verbatim in the flag-off branch, so default rendering is byte-identical
 * (canary-critical: Solbrillen/Northbound run cart/checkout live).
 *
 * Design philosophy: ONE token-adaptive version per page, not per-design
 * templates. Everything colors through the sol-* palette chain (set by
 * themes/<slug>.css, runtime themeJson, or the active design's
 * applyPaletteAsTheme mapping), so the same markup re-tones to ANY skin.
 * Headings additionally pick up the active design's display-family hint via
 * `--font-display` (DesignTokens.fonts.display → designToInlineCss) and fall
 * back to the inherited family when the design sets none.
 *
 * Flagship packs can take over the whole frame via the additive
 * DesignPages.cart/checkout/account wrapper templates (designs/types.ts) —
 * the pages hand them this adaptive body as `children`.
 */

/** Display-typography hint for headings. Inert when no design sets fonts.display. */
export const displayFont: CSSProperties = {
  fontFamily: "var(--font-display, inherit)",
};

/**
 * Token-respecting class vocabulary. sol-* tokens are palette-driven on every
 * shop, so these re-tone to the active palette without per-design CSS.
 */
export const surface = {
  /** Page shell background. */
  page: "bg-sol-cream",
  /** Primary text. */
  ink: "text-sol-ink",
  /** Secondary text. */
  muted: "text-sol-muted",
  /** Accent text. */
  accent: "text-sol-accent",
  /** Standard card on the page surface. */
  card: "rounded-2xl border border-sol-ink/10 bg-sol-sand/50 shadow-sm",
  /** Hairline divider color. */
  divider: "border-sol-ink/10",
} as const;

/**
 * Marker wrapper for the adaptive branch — lets tests/screenshots (and future
 * design CSS) target design-adaptive surfaces without structural assumptions.
 */
export function DesignSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-design-surface className={className}>
      {children}
    </div>
  );
}
