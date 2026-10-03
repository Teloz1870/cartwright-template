/**
 * Routes that ARE locale-shadowed and are deliberately left that way. Listing
 * one here is a decision with a reason, not a mute button —
 * `tests/unit/locale-exempt-routes.test.ts` requires the shadowed set to equal
 * this set exactly, so removing a shadow without removing its entry fails too.
 *
 * Shared rather than local to that test because a shadowed route is also an
 * address the site must never point at: `tests/unit/sitemap-canonical-routes.test.ts`
 * reads the same list and refuses any sitemap entry on one of these paths
 * (AUD18-a — `/manifest` sat in the sitemap while answering 307 → 404 on every
 * canary). One list, two readers, no drift.
 */
export const KNOWN_SHADOWED: Record<string, string> = {
  "/manifest":
    "app/manifest/page.tsx renders hardcoded English webshop copy ('An online " +
    "store powered by AI', 'the catalog') with no locale context and no site " +
    "chrome. Un-shadowing it would publish an indexable shop-language page on " +
    "Teloz, which is website-mode (ecommerceEnabled:false) and Danish-default. " +
    "It needs locale-aware copy or a mode gate before it should answer; that is " +
    "a content decision, not a routing fix. (/manifest.webmanifest is a " +
    "different route and is reachable — it has a dot.)",
};
