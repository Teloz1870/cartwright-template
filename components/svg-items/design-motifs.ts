/**
 * Design → signature motif mapping (client-safe, pure data).
 *
 * Each premium design can carry ONE signature SVG motif from the svg-items
 * library (components/svg-items) — the mark/divider/illustration that captures
 * its visual identity. The marketplace manifest emits this as `motifSlug` per
 * design so cartwright.app can render the motif next to the design card, and
 * the design-language doc (docs/design-language.md) documents the pairing.
 *
 * Values are SVG_ITEMS slugs (validated by marketplace-manifest.test.ts —
 * a typo here fails CI). Designs without a signature motif are simply absent.
 */
export const DESIGN_MOTIFS: Record<string, string> = {
  apex: "orbit-mark",
  engineered: "lattice-mark",
  nocturne: "constellation-mark",
  jungle: "vine-divider",
  meridian: "comet-mark",
  "editorial-ink": "prism-mark",
  brutalist: "sunburst-mark",
  studio: "bloom-illustration",
  fable: "moth-illustration",
  stillwater: "mountain-illustration",
  ember: "firefly-field",
};
