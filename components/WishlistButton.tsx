/**
 * Re-export shim — the implementation moved to the wishlist plugin
 * (plugins/wishlist/, cartwright-plugin-v1). Keeps the historical import path
 * (`@/components/WishlistButton`) working unchanged for existing scaffolds and
 * the core PLP/PDP mounts (ProductCard + product page).
 */
export { WishlistButton } from "@/plugins/wishlist/components/WishlistButton";
