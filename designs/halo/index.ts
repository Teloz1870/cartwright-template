/**
 * "Halo" design — DesignPack registration.
 *
 * A premium, ultra-minimal product-luxury webshop homepage built as real code
 * (not the governed section-builder): hand-crafted server component, a LOCKED
 * light theme (no `dark:` variants → no OS dark-mode leak), oversized tight-
 * tracked display type (Manrope) over a clean Inter body, the signature
 * alternating full-bleed light / near-black panels, and a pure-CSS "product"
 * object with a metallic conic sheen + soft layered ambient shadows. No 3D.
 * Selectable like any design in /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import HaloHomepage from "./homepage";
import { HaloShell, HaloHeader, HaloFooter } from "./chrome";
import HaloContact from "./contact";
import HaloInfo from "./info";
import HaloNotFound from "./not-found";
import { HaloProductCard } from "./ProductCard";
import { HaloPdpLayout } from "./PdpLayout";

export const haloDesign: DesignPack = {
  slug: "halo",
  name: "Halo (minimal product luxury)",
  description:
    "Premium ultra-minimal product-luxury storefront — a light-grey canvas, oversized tight-tracked headlines, and the signature alternating full-bleed light / near-black panels. A pure-CSS hero 'device' with a metallic conic sheen + soft ambient shadows, one restrained product-blue accent, a tidy spec grid, and a centered 'Get yours' CTA. Locked light theme (no OS dark-mode flip). No 3D — pure CSS visuals.",
  mode: "webshop",
  chrome: "light",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "halo",
    palette: {
      accent: "#0a84ff",
      accentDeep: "#0050a0",
      cream: "#f5f5f7",
      sand: "#d2d2d7",
      ink: "#1d1d1f",
      muted: "#6e6e73",
    },
    fonts: {
      sans: "Manrope, system-ui, sans-serif",
      mono: "ui-monospace, monospace",
    },
  },
  homepage: HaloHomepage,
  // Site-wide chrome → the Halo look reaches every page (the homepage renders
  // inside the Shell instead of as a fixed overlay).
  siteChrome: { Shell: HaloShell, Header: HaloHeader, Footer: HaloFooter },
  // Bespoke per-page templates (rendered inside the Shell + chrome).
  pages: { contact: HaloContact, info: HaloInfo, notFound: HaloNotFound },
  // Webshop overrides → bespoke product card on PLP/category + a framed PDP.
  // ownsBreadcrumb: HaloPdpLayout draws its own breadcrumb, so the route-level
  // breadcrumb skips PDP for this design (no double-render).
  webshop: { productCard: HaloProductCard, pdpLayout: HaloPdpLayout, ownsBreadcrumb: true },
};
