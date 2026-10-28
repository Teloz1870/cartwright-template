/**
 * Whole-segment checks for the engine's own root areas, `/admin` and `/api`.
 *
 * A path that only BEGINS with the name is a storefront path: a migrated
 * WooCommerce shop can have `/administration` or `/apiary` pages, and since
 * PROXY-SEGMENT-BOUNDARIES (#693) the proxy routes them as such. These helpers
 * are the one reading of "is this the admin area / the API" for both the proxy
 * and the client components that hide storefront chrome inside the admin, so
 * the two cannot drift apart again.
 *
 * Client-safe by construction: no imports, no `server-only`, nothing from
 * `brand.config`. Locale-less on purpose — `/admin` and `/api` are root routes,
 * never under `[locale]`, which is the scope the proxy's redirect lookup and API
 * branch have always had. (The proxy's sign-in gate reads `/<locale>/admin` too,
 * through its own `ADMIN_SEGMENT_RE`.)
 */

/** `/admin`, `/admin/` and `/admin/…` — not `/administration`, not `/adminx`. */
export function isAdminPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** `/api`, `/api/` and `/api/…` — not `/apiary`. */
export function isApiPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/api" || pathname.startsWith("/api/");
}
