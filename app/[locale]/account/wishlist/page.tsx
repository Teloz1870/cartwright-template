/**
 * Route mount (cartwright-plugin-v1) — wishlist plugin. The page
 * implementation lives in the plugin's self-contained module; this file only
 * fixes the URL (`/account/wishlist`). Segment config stays literal here so
 * Next's static analysis keeps seeing it.
 */
export const dynamic = "force-dynamic";

export { default } from "@/plugins/wishlist/pages/WishlistPage";
