/**
 * "Aerospace" design — DesignPack registration.
 *
 * A premium, cinematic deep-tech website skin built as real code (not the
 * governed section-builder): mission-control voice, a near-black space canvas
 * with a CSS starfield + perspective horizon grid, one ice-blue accent, and
 * monospace telemetry detailing. A LOCKED dark theme (explicit CSS vars +
 * `color-scheme: dark`, no `dark:` variants → no OS light-mode leak), distinctive
 * fonts (Oswald condensed display / Inter body / JetBrains Mono telemetry via
 * next/font), CSS-only visuals (starfield, scanlines, horizon glow), and CSS-only
 * motion. No 3D. Selectable like any design in /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import AerospaceHomepage from "./homepage";
import { AeroShell, AeroHeader, AeroFooter } from "./chrome";
import AerospaceContact from "./contact";
import AerospaceInfo from "./info";
import AerospaceNotFound from "./not-found";

export const aerospaceDesign: DesignPack = {
  slug: "aerospace",
  name: "Aerospace (cinematic deep-tech)",
  description:
    "Premium cinematic aerospace / mission-control design — a near-black space canvas, one ice-blue accent, and a dry technical voice. CSS starfield hero with a perspective horizon grid + glow, condensed uppercase headlines, monospace telemetry chips, vehicle/system spec cards, a stat band, a countdown mission-sequence timeline, and a quiet horizon CTA. Locked dark theme (no OS light-mode flip). No 3D — pure CSS visuals + motion.",
  mode: "website",
  chrome: "dark",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "aero",
    palette: {
      accent: "#4d9fff",
      accentDeep: "#1b3a8f",
      cream: "#080b12",
      sand: "#141b28",
      ink: "#eef3fb",
      muted: "#8a97ad",
    },
    extraTokens: {
      "color-aero-ice": "#4d9fff",
      "color-aero-ice-deep": "#1b3a8f",
      "color-aero-nominal": "#5fe3a1",
    },
    fonts: {
      sans: "Inter, system-ui, sans-serif",
      mono: "JetBrains Mono, ui-monospace, monospace",
    },
  },
  homepage: AerospaceHomepage,
  // Site-wide chrome → the aero look reaches every page (the homepage renders
  // inside the Shell instead of as a fixed overlay).
  siteChrome: { Shell: AeroShell, Header: AeroHeader, Footer: AeroFooter },
  // Bespoke per-page templates (rendered inside the Shell + chrome).
  pages: { contact: AerospaceContact, info: AerospaceInfo, notFound: AerospaceNotFound },
};
