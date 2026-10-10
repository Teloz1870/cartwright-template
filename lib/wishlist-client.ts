/**
 * Re-export shim — the implementation moved to the wishlist plugin
 * (plugins/wishlist/, cartwright-plugin-v1). Keeps `@/lib/wishlist-client`
 * working unchanged for existing scaffolds.
 */
export { getWishlistSet, toggleWishlistItem } from "@/plugins/wishlist/lib/wishlist-client";
