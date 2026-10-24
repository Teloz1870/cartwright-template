import { routing } from "@/i18n/routing";

/**
 * Which locale is the CALLER on?
 *
 * A shop has more than one answer to "what is the default locale", and they
 * can disagree. Measured on the live coffee demo: the proxy redirects `/` to
 * `/en` (compile-time `brand.defaultLocale`, optionally overridden by a Redis
 * key the admin writes), while `getBrand().defaultLocale` returns `"da"` from a
 * stale `BrandingSettings` row. An agent searching from `/en` was handed
 * `/da/product/...` links, and the whole conversation switched language.
 *
 * The fix is not to pick a winner between those resolvers — an operator CAN
 * genuinely change the default, and that path works. It is to stop guessing
 * where the request already knows: a route handler serving an agent on `/en`
 * should answer in `/en`.
 *
 * Order: an explicit `?locale=`, then the Referer's first path segment, then
 * the shop-wide default. Every candidate is checked against `routing.locales`,
 * so a hostile or stale value can only fall through to the default — never
 * inject a path segment.
 */
export function resolveRequestLocale(
  request: Request,
  fallback: string,
): string {
  const serves = (value: string | null | undefined): value is string =>
    Boolean(value) &&
    (routing.locales as readonly string[]).includes(value as string);

  let url: URL | null = null;
  try {
    url = new URL(request.url);
  } catch {
    url = null;
  }

  const explicit = url?.searchParams.get("locale");
  if (serves(explicit)) return explicit;

  // The Referer is the page the agent is standing on. It is advisory — a
  // client can set it to anything — which is exactly why the value is only
  // ever used after the allowlist check above, and only to choose between the
  // shop's OWN locales. The worst a forged Referer achieves is a link in
  // another language this shop already publishes.
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const segment = new URL(referer).pathname.split("/")[1];
      if (serves(segment)) return segment;
    } catch {
      // Unparseable Referer: fall through.
    }
  }

  return serves(fallback) ? fallback : routing.defaultLocale;
}
