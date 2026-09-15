/**
 * wishlist — cartwright-plugin-v1 (plugin wave 2, core-audit §6b №2).
 *
 * Logged-in wishlist (WooCommerce-parity set): heart button on PLP/PDP,
 * `/account/wishlist` page, toggle/list API. Audit scope: `lib/wishlist*.ts`
 * inbound 9, own Prisma model.
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Storefront mount note: `components/ProductCard.tsx` and the PDP render
 * `<WishlistButton>` behind `brand.features.wishlist` (the existing
 * flag-gated mounts, reached through the `@/components/WishlistButton` shim).
 * v1 keeps those hand-wired mounts; slot-host mounting is the parked Phase-1
 * spec's follow-up.
 *
 * Schema note: `WishlistItem` is plugin-exclusive (no core code reads it), so
 * it is declared honestly below. The back-relation FIELDS it needs
 * (`User.wishlist`, `Product.wishlistItems`) live on core models in
 * prisma/schema.prisma and stay there — v1 install never mutates schema; the
 * fragment surfaces as a "run pnpm db:push" note.
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const wishlistPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "wishlist",
  name: "Wishlist",
  description:
    "Logged-in wishlist: a heart button on product cards and the product page, a 'My wishlist' account page, and the toggle/list API behind it.",
  version: "1.0.0",
  flag: "wishlist",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/wishlist/manifest.ts" },
    { path: "plugins/wishlist/lib/wishlist.ts" },
    { path: "plugins/wishlist/lib/wishlist-client.ts" },
    { path: "plugins/wishlist/components/WishlistButton.tsx" },
    { path: "plugins/wishlist/pages/WishlistPage.tsx" },
    { path: "plugins/wishlist/api/list.ts" },
    { path: "plugins/wishlist/api/toggle.ts" },
    // Import-path shims (existing scaffolds + core PLP/PDP import these).
    { path: "lib/wishlist.ts" },
    { path: "lib/wishlist-client.ts" },
    { path: "components/WishlistButton.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/[locale]/account/wishlist/page.tsx" },
    { path: "app/api/wishlist/route.ts" },
    { path: "app/api/wishlist/toggle/route.ts" },
  ],
  routeMounts: [
    {
      mount: "app/[locale]/account/wishlist/page.tsx",
      from: "plugins/wishlist/pages/WishlistPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/api/wishlist/route.ts",
      from: "plugins/wishlist/api/list.ts",
      exports: ["GET"],
    },
    {
      mount: "app/api/wishlist/toggle/route.ts",
      from: "plugins/wishlist/api/toggle.ts",
      exports: ["POST"],
    },
  ],
  prismaFragment: `// Ønskeliste (WooCommerce-paritet). Logged-in brugere. Unik pr. (userId, productId).
// NOTE: the back-relation fields User.wishlist + Product.wishlistItems live on
// the core models and stay in the core schema.
model WishlistItem {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, productId])
  @@index([userId])
}`,
};
