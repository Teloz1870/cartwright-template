/**
 * "Flux" design — DesignPack registration.
 *
 * A premium, vibrant developer-first payments / infra SaaS homepage built as
 * real code (not the governed section-builder): hand-crafted components, a
 * LOCKED light theme (no `dark:` variants → no OS dark-mode leak), distinctive
 * fonts (Sora display / Inter body / JetBrains Mono code via next/font), a BOLD
 * animated multi-hue gradient mesh (indigo → violet → cyan → teal) with a
 * signature angled clip, crisp white hairline cards, and syntax-tinted mono
 * code. No 3D — pure CSS visuals + motion. Selectable like any design in
 * /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import FluxHomepage from "./homepage";
import { FluxShell, FluxHeader, FluxFooter } from "./chrome";
import FluxContact from "./contact";
import FluxInfo from "./info";
import FluxNotFound from "./not-found";

export const fluxDesign: DesignPack = {
  slug: "flux",
  name: "Flux (vibrant gradient SaaS)",
  description:
    "Premium developer-first payments/infra SaaS design — white canvas, deep-navy text, one vivid indigo accent. Signature bold animated multi-hue gradient mesh (indigo → violet → cyan → teal) with an angled clip, crisp white hairline cards, and syntax-tinted mono code cards. Rounded pills, gradient stat band, saturated gradient CTA. Locked light theme (no OS dark-mode flip). No 3D — pure CSS visuals + motion.",
  mode: "website",
  chrome: "light",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "flux",
    palette: {
      accent: "#635bff",
      accentDeep: "#4b45c6",
      cream: "#ffffff",
      sand: "#e3e8ee",
      ink: "#0a2540",
      muted: "#425466",
    },
    extraTokens: {
      "color-flux-indigo": "#635bff",
      "color-flux-violet": "#a35bff",
      "color-flux-cyan": "#00d4ff",
      "color-flux-teal": "#00d9b2",
    },
    fonts: {
      sans: "Inter, system-ui, sans-serif",
      mono: "JetBrains Mono, ui-monospace, monospace",
    },
  },
  homepage: FluxHomepage,
  // Site-wide chrome → the Flux look reaches every page (the homepage renders
  // inside the Shell instead of as a fixed overlay).
  siteChrome: { Shell: FluxShell, Header: FluxHeader, Footer: FluxFooter },
  // Bespoke per-page templates (rendered inside the Shell + chrome).
  pages: { contact: FluxContact, info: FluxInfo, notFound: FluxNotFound },
};
