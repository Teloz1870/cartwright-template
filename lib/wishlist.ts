/**
 * Re-export shim — the implementation moved to the wishlist plugin
 * (plugins/wishlist/, cartwright-plugin-v1). This file keeps the historical
 * import path (`@/lib/wishlist`) working unchanged for existing scaffolds and
 * the canaries (Solbrillen runs wishlist:true).
 */
export {
  getWishlistProductIds,
  toggleWishlist,
  listWishlistProducts,
} from "@/plugins/wishlist/lib/wishlist";
