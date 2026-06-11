/**
 * "Drive" design — DesignPack registration.
 *
 * A premium, full-bleed automotive / silent-luxury product showcase built as
 * real code (not the governed section-builder): the homepage is a vertical
 * stack of full-viewport panels, each a CSS-only atmospheric backdrop (dusk /
 * open-road / studio / solar) with a centered top headline and two
 * bottom-anchored pill CTAs. A LOCKED theme (explicit CSS vars + per-panel text
 * colour, no `dark:` variants → no OS dark-mode leak), Montserrat throughout via
 * next/font, and CSS-only visuals — gradients, vignettes, a faint horizon, a
 * car silhouette, a sensor sweep. No 3D / no photos. Selectable like any design
 * in /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import DriveHomepage from "./homepage";
import { DriveShell, DriveHeader, DriveFooter } from "./chrome";
import DriveContact from "./contact";
import DriveInfo from "./info";
import DriveNotFound from "./not-found";

export const driveDesign: DesignPack = {
  slug: "drive",
  name: "Drive (full-bleed automotive)",
  description:
    "Premium full-bleed automotive design — silent-luxury EV product showcase. A vertical stack of full-viewport panels, each a CSS-only atmospheric backdrop (dusk, open road, dark studio, solar sky) with a centered top headline and two bottom-anchored pill CTAs. Ultra-minimal, confident, almost no body copy. Montserrat throughout. Locked light theme (no OS dark-mode flip). No 3D, no photos — pure CSS gradients, vignettes, horizon, car silhouette.",
  mode: "website",
  chrome: "light",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "drv",
    palette: {
      accent: "#171a20",
      accentDeep: "#000000",
      cream: "#ffffff",
      sand: "#e2e3e5",
      ink: "#171a20",
      muted: "#5c5e62",
    },
    fonts: {
      sans: "Montserrat, system-ui, sans-serif",
      mono: "ui-monospace, monospace",
    },
  },
  homepage: DriveHomepage,
  // Site-wide chrome → the Drive look reaches every page (the homepage renders
  // inside the Shell instead of as a fixed overlay).
  siteChrome: { Shell: DriveShell, Header: DriveHeader, Footer: DriveFooter },
  // Bespoke per-page templates (rendered inside the Shell + chrome).
  pages: { contact: DriveContact, info: DriveInfo, notFound: DriveNotFound },
};
