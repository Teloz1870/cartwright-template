/**
 * phone-widget — the first cartwright-plugin-v1 plugin (the mechanics-prover).
 *
 * Chosen per internal-docs/core-audit.md §6b: graph degree 3, effort S, a
 * single storefront mount — the cheapest extraction in the codebase, so the
 * contract gets proven with minimal surface.
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Storefront mount note: the widget renders from app/[locale]/layout.tsx
 * behind `brand.features.phoneWidget` (the existing flag-gated mount). v1
 * keeps that hand-wired mount; slot-host mounting (`<CartwrightSlot>`) is the
 * parked Phase-1 spec's follow-up.
 *
 * Schema note: `IntegrationSettings.phoneIncWorkspaceId` (the workspace id
 * the layout passes to the widget) ships in the CORE schema and is shared
 * with the setup wizard — so this plugin honestly declares NO prismaFragment.
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const phoneWidgetPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "phone-widget",
  name: "Phone widget",
  description:
    "Phone.inc click-to-call widget in the storefront corner, plus an admin telephony dashboard (call history + AI answering machine).",
  version: "1.0.0",
  flag: "phoneWidget",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/phone-widget/manifest.ts" },
    { path: "plugins/phone-widget/components/PhoneWidget.tsx" },
    { path: "plugins/phone-widget/admin/TelefonDashboard.tsx" },
    { path: "plugins/phone-widget/api/token.ts" },
    { path: "plugins/phone-widget/api/webhook.ts" },
    { path: "plugins/phone-widget/api/admin.ts" },
    // Import-path shim (existing scaffolds import @/components/ui/PhoneWidget).
    { path: "components/ui/PhoneWidget.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/admin/telefon/page.tsx" },
    { path: "app/api/phone/token/route.ts" },
    { path: "app/api/phone/webhook/route.ts" },
    { path: "app/api/admin/phone/route.ts" },
  ],
  routeMounts: [
    {
      mount: "app/admin/telefon/page.tsx",
      from: "plugins/phone-widget/admin/TelefonDashboard.tsx",
      exports: ["default"],
    },
    {
      mount: "app/api/phone/token/route.ts",
      from: "plugins/phone-widget/api/token.ts",
      exports: ["POST"],
    },
    {
      mount: "app/api/phone/webhook/route.ts",
      from: "plugins/phone-widget/api/webhook.ts",
      exports: ["POST"],
    },
    {
      mount: "app/api/admin/phone/route.ts",
      from: "plugins/phone-widget/api/admin.ts",
      exports: ["GET", "POST"],
    },
  ],
  adminNav: [{ href: "/admin/telefon", label: "Telephony" }],
  // framer-motion is used by the widget today. It is a CORE dep for now
  // (3 website pages also import it); declared here so the light scaffold
  // knows the plugin needs it if core ever drops it (core-audit CUT-cand. 4).
  deps: [{ name: "framer-motion" }],
};
