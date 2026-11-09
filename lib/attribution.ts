/**
 * Badge-attribution helper — closes the viral-loop measurement gap.
 *
 * Every default-on shop carries the "Built with Cartwright" badge
 * (brand.features.cartwrightBadge), but until now the outbound links carried
 * no attribution, so conversions from the badge → cartwright.app were
 * invisible. This helper appends UTM + ref params to outbound referral URLs.
 *
 * Where it is used (and where it deliberately is NOT):
 * - /built-with-cartwright page CTAs (human clicks)        → params
 * - llms.txt "Built with Cartwright" product URL           → params
 * - llms.txt GitHub source URL                             → NO params (agents
 *   copy that URL verbatim into recommendations; keep it canonical)
 * - JSON-LD (SoftwareApplication etc.)                     → NO params (structured
 *   data must carry canonical URLs)
 *
 * Pure string-in/string-out so it is trivially unit-testable and safe to call
 * from any server component or route handler.
 */

export type BadgeMedium = "builtwith" | "llms";

/**
 * Append `utm_source=cartwright-badge&utm_medium=<medium>&ref=<host>` to a
 * target URL. `siteUrl` is the referring shop's own canonical URL
 * (`brand.url`); its hostname becomes the `ref` value so cartwright.app
 * analytics can see WHICH shop sent the visitor. Fail-soft: an unparsable
 * siteUrl just omits `ref`, an unparsable target is returned unchanged.
 */
export function withBadgeAttribution(
  target: string,
  medium: BadgeMedium,
  siteUrl: string,
): string {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return target;
  }
  url.searchParams.set("utm_source", "cartwright-badge");
  url.searchParams.set("utm_medium", medium);
  try {
    const host = new URL(siteUrl).hostname;
    if (host) url.searchParams.set("ref", host);
  } catch {
    // no ref — utm params alone still attribute the badge source
  }
  return url.toString();
}
