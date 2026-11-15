/**
 * shipmondo — Shipmondo as the engine's one shipping aggregator (owner
 * decision 2026-09-16, INT5; SHIP-SM). Shipmondo reaches PostNord, GLS, DAO,
 * Bring, Danske Fragtmænd and 50+ carriers through one API.
 *
 * The model is the one Shipmondo's WooCommerce plugin uses: a paid order goes
 * to Shipmondo as a sales order, the shop books the label there, and the
 * shipment's tracking comes back on a signed webhook. Slices:
 *   1. typed API client, order → sales order, webhook verification
 *   2a. /admin/shipmondo (send one / send all) + the /api/cron/shipmondo-orders sweep
 *   2b. this: sending at payment, through the webshop's paid-order seam
 *       (lib/orders/paid-hooks.ts, provided here by lib/on-paid.ts)
 *   3. this: the webhook route — tracking saved through lib/orders/tracking.ts, the
 *      order moved to shipped, the customer told; registered from /admin/shipmondo
 *   4. parcel-shop picker in checkout + the chosen point on the order
 *   5. credentials stored encrypted in /admin/integrations, agent tools, docs
 *
 * The flag stays `implemented: false` until a live Shipmondo sandbox run has
 * confirmed the webhook envelope (owner gate B62), so neither the admin,
 * llms.txt nor /built-with-cartwright claims Shipmondo support before then.
 *
 * PURE DATA module: imports nothing but the contract type.
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const shipmondoPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "shipmondo",
  name: "Shipmondo",
  description:
    "Ship through Shipmondo: paid orders go to Shipmondo as sales orders, labels are booked there for 50+ carriers (PostNord, GLS, DAO, Bring …), and tracking comes back to the order.",
  version: "0.1.0",
  flag: "shipmondo",
  files: [
    { path: "plugins/shipmondo/manifest.ts" },
    { path: "plugins/shipmondo/lib/api.d.ts" },
    { path: "plugins/shipmondo/lib/config.ts" },
    { path: "plugins/shipmondo/lib/client.ts" },
    { path: "plugins/shipmondo/lib/sales-order.ts" },
    { path: "plugins/shipmondo/lib/webhook.ts" },
    { path: "plugins/shipmondo/lib/send-order.ts" },
    { path: "plugins/shipmondo/lib/on-paid.ts" },
    { path: "plugins/shipmondo/lib/apply-shipment.ts" },
    { path: "plugins/shipmondo/lib/webhook-setup.ts" },
    { path: "plugins/shipmondo/lib/reconcile.ts" },
    { path: "plugins/shipmondo/api/webhook.ts" },
    { path: "plugins/shipmondo/api/send-orders-cron.ts" },
    { path: "plugins/shipmondo/admin/ShipmondoAdminPage.tsx" },
    { path: "plugins/shipmondo/admin/actions.ts" },
    { path: "plugins/shipmondo/openapi/shipmondo-v3.subset.json" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/admin/shipmondo/page.tsx" },
    { path: "app/api/cron/shipmondo-orders/route.ts" },
    { path: "app/api/shipmondo/webhook/route.ts" },
  ],
  routeMounts: [
    {
      mount: "app/admin/shipmondo/page.tsx",
      from: "plugins/shipmondo/admin/ShipmondoAdminPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/api/cron/shipmondo-orders/route.ts",
      from: "plugins/shipmondo/api/send-orders-cron.ts",
      exports: ["GET"],
    },
    {
      mount: "app/api/shipmondo/webhook/route.ts",
      from: "plugins/shipmondo/api/webhook.ts",
      exports: ["POST"],
    },
  ],
  adminNav: [{ href: "/admin/shipmondo", label: "Shipmondo" }],
};
