/**
 * Client-safe design token map (palette + threeD) — the data the marketplace
 * manifest + cartwright.app gallery need WITHOUT importing the design packs
 * (which pull server-only homepage components). Keep one entry per slug in
 * designs/options.ts. The designs-tokens.test.ts invariant fails CI if a
 * registered design is missing here — so the marketplace can never silently drift.
 *
 * `threeD` = "this pack wires a three.js / WebGL hero".
 */
export type DesignTokenEntry = {
  palette: {
    accent: string; accentDeep: string; cream: string; sand: string; ink: string; muted: string;
  } | null;
  threeD: boolean;
};

export const DESIGN_TOKENS: Record<string, DesignTokenEntry> = {
  "aurora-site": { palette: { accent: "#5b54f0", accentDeep: "#4138c7", cream: "#fdfcfb", sand: "#f3f1ee", ink: "#18171f", muted: "#6c6a78" }, threeD: true },
  "aurora-shop": { palette: { accent: "#5b54f0", accentDeep: "#4138c7", cream: "#fdfcfb", sand: "#f3f1ee", ink: "#18171f", muted: "#6c6a78" }, threeD: false },
  "saas-dark": { palette: { accent: "#818cf8", accentDeep: "#4f46e5", cream: "#000000", sand: "#0a0a0a", ink: "#ffffff", muted: "rgba(255,255,255,0.6)" }, threeD: true },
  "studio": { palette: { accent: "#7c5cff", accentDeep: "#5b3fd6", cream: "#fafaf9", sand: "#f5f5f4", ink: "#0a0a0b", muted: "#737373" }, threeD: false },
  "corporate-baseline": { palette: { accent: "#1e3f5a", accentDeep: "#0f2438", cream: "#f4efe6", sand: "#e8e1d3", ink: "#1a1a1a", muted: "#726d62" }, threeD: false },
  "webshop-classic": { palette: { accent: "#1e3f5a", accentDeep: "#0f2438", cream: "#f4efe6", sand: "#e8e1d3", ink: "#1a1a1a", muted: "#726d62" }, threeD: false },
  "webshop-minimal": { palette: { accent: "#1e3f5a", accentDeep: "#0f2438", cream: "#ffffff", sand: "#f5f5f4", ink: "#0a0a0b", muted: "#737373" }, threeD: false },
  "webshop-editorial": { palette: { accent: "#1e3f5a", accentDeep: "#0f2438", cream: "#f4efe6", sand: "#e8e1d3", ink: "#1a1a1a", muted: "#726d62" }, threeD: false },
  "webshop-bold": { palette: { accent: "#d97757", accentDeep: "#c4623e", cream: "#fef3c7", sand: "#ffffff", ink: "#0a0a0b", muted: "#525252" }, threeD: false },
  "northern-coffee": { palette: { accent: "#c2410c", accentDeep: "#9a3412", cream: "#fdfaf4", sand: "#ede5d3", ink: "#2c1810", muted: "#8a7560" }, threeD: false },
  "atelier": { palette: { accent: "#9b7837", accentDeep: "#7a5a2d", cream: "#f6f3ee", sand: "#ebe6dd", ink: "#0a0a0a", muted: "#6b6b6b" }, threeD: false },
  "stack": { palette: { accent: "#00d97e", accentDeep: "#00b368", cream: "#050505", sand: "#0e0e10", ink: "#fafafa", muted: "#888888" }, threeD: false },
  "hoptify": { palette: { accent: "#2f9e54", accentDeep: "#1f7a40", cream: "#f6faf6", sand: "#e7f1e8", ink: "#16241b", muted: "#5c6b60" }, threeD: false },
  "engineered": { palette: { accent: "#5fe6c4", accentDeep: "#1e3f5a", cream: "#f4efe6", sand: "#0d141a", ink: "#090d11", muted: "#737d86" }, threeD: true },
  "editorial-ink": { palette: { accent: "#7c2230", accentDeep: "#511620", cream: "#f6f1e7", sand: "#c9bca2", ink: "#1c1916", muted: "#6b6356" }, threeD: false },
  "brutalist": { palette: { accent: "#c8ff00", accentDeep: "#9bcb00", cream: "#f5f3ec", sand: "#fffdf6", ink: "#0a0a0a", muted: "#5a5a52" }, threeD: false },
  "nocturne": { palette: { accent: "#e9c789", accentDeep: "#c79a52", cream: "#f3ebe1", sand: "#1e1525", ink: "#160f1c", muted: "#9a8aa0" }, threeD: true },
  "meridian": { palette: { accent: "#2563ff", accentDeep: "#143a9c", cream: "#f7f9fc", sand: "#e6ebf3", ink: "#0c1322", muted: "#5b6577" }, threeD: false },
  "apex": { palette: { accent: "#7c5cff", accentDeep: "#5a3fd6", cream: "#faf8ff", sand: "#ece8f9", ink: "#16101f", muted: "#6e6680" }, threeD: true },
  "aerospace": { palette: { accent: "#4d9fff", accentDeep: "#1b3a8f", cream: "#080b12", sand: "#141b28", ink: "#eef3fb", muted: "#8a97ad" }, threeD: false },
  "halo": { palette: { accent: "#0a84ff", accentDeep: "#0050a0", cream: "#f5f5f7", sand: "#d2d2d7", ink: "#1d1d1f", muted: "#6e6e73" }, threeD: false },
  "flux": { palette: { accent: "#635bff", accentDeep: "#4b45c6", cream: "#ffffff", sand: "#e3e8ee", ink: "#0a2540", muted: "#425466" }, threeD: false },
  "drive": { palette: { accent: "#171a20", accentDeep: "#000000", cream: "#ffffff", sand: "#e2e3e5", ink: "#171a20", muted: "#5c5e62" }, threeD: false },
  "jungle": { palette: { accent: "#16a34a", accentDeep: "#15803d", cream: "#f6fef0", sand: "#dcfce7", ink: "#13251a", muted: "#6f8e7c" }, threeD: true },
  "fable": { palette: { accent: "#4e4af2", accentDeep: "#2f2bb8", cream: "#faf7f0", sand: "#f0ebdf", ink: "#23201c", muted: "#7d776c" }, threeD: true },
  "stillwater": { palette: { accent: "#3d6b6b", accentDeep: "#27494c", cream: "#f7f7f4", sand: "#e8e6df", ink: "#1c2321", muted: "#7c8482" }, threeD: true },
  "ember": { palette: { accent: "#e8553a", accentDeep: "#b83a24", cream: "#fdf6ef", sand: "#f7e8da", ink: "#2b1d16", muted: "#7d6557" }, threeD: true },
  "blank": { palette: { accent: "#171717", accentDeep: "#000000", cream: "#ffffff", sand: "#f5f5f5", ink: "#171717", muted: "#737373" }, threeD: false },
};
