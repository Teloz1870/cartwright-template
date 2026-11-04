import type { FeatureKey } from "@/lib/feature-flags/manifest";

/**
 * What a shop has switched on decides which parts of the engine are active for
 * it. This file is the table of that: pure data, claimed by `core`, so every
 * profile carries it and reading it needs no database.
 *
 * The profile graph in modules/registry.ts answers another question, at build
 * time: which files a scaffold gets. The runtime never reads that graph
 * (lib/modules/spec.ts), so the slugs below are written out, and
 * tests/unit/surface-gates.test.ts binds them to MODULES and PLUGINS[].flag.
 */

/**
 * The part of a shop's agent surface a tool belongs to.
 *
 *  - `operate`: running the business day to day: catalogue, orders, discounts,
 *    customers, content, audit. A tool that names no surface is this.
 *  - `build`: what the site is: its design, voice, front-page copy, page layouts,
 *    feature switches, and restoring or rebuilding it whole.
 *  - `storefront`: the shopper's chat: the cookie cart, the session, an address
 *    lookup at checkout, product cards in the chat. An agent over MCP or REST has
 *    no such session, so it never sees these.
 */
export type ToolSurface = "operate" | "build" | "storefront";

/** The shape of a NavItem's gate (lib/admin/nav.ts). */
export type SurfaceGate = {
  /** Requires brand.ecommerceEnabled (hidden in website mode). */
  ecommerce?: boolean;
  /** Requires ALL of these brand.features.* keys to be truthy. */
  flags?: readonly FeatureKey[];
};

export type ToolGate = SurfaceGate & {
  surface?: ToolSurface;
};

/**
 * Modules a shop can have off at runtime, by module slug. A slug that is not
 * here is always active: core, db, auth, admin, pages-db, mcp, agent-core,
 * contact-form, trust-pages, google-fonts.
 *
 * A plugin carries its manifest's one flag. For google-workspace that is
 * `sheetsSync`, the flag-bearer of its three (plugins/google-workspace/manifest.ts).
 */
export const MODULE_GATES: Readonly<Record<string, SurfaceGate>> = {
  webshop: { ecommerce: true },
  feeds: { flags: ["merchantFeed"] },
  acp: { flags: ["acp"] },
  a2a: { flags: ["a2a"] },
  ucp: { flags: ["ucpIdentityLinking"] },
  voice: { flags: ["voiceShop"] },
  "agent-admin": { flags: ["adminAgenticDashboard"] },
  "phone-widget": { flags: ["phoneWidget"] },
  wishlist: { flags: ["wishlist"] },
  blog: { flags: ["blog"] },
  reviews: { flags: ["reviews"] },
  "three-scenes": { flags: ["threeD"] },
  hoptify: { flags: ["hoptify"] },
  "logo-generator": { flags: ["logoGenerator"] },
  "design-import": { flags: ["designImport"] },
  "google-workspace": { flags: ["sheetsSync"] },
};
