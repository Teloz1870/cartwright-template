/**
 * Speculation Rules — document-level prefetch of likely next navigations.
 *
 * Rendered in the root layout only when `brand.features.speculationRules` is on.
 * Emits a `<script type="speculationrules">` ruleset telling Chromium to prefetch
 * same-origin document links — excluding `/admin`, `/api`, and any element marked
 * `[data-no-prefetch]` or `[rel~=nofollow]` — at `moderate` eagerness
 * (hover/pointerdown). This makes PLP→PDP→cart→checkout feel SPA-instant without
 * leaving Next.js's server model, complementing `<Link>` prefetch with
 * full-document prefetch.
 *
 * Progressive enhancement: browsers without Speculation Rules (Firefox/Safari as
 * of mid-2026) ignore the script entirely, so there is no behaviour change there.
 * `type="speculationrules"` is a data block, NOT executable JS, so it is not
 * subject to `script-src` CSP (Cartwright ships no strict CSP regardless).
 *
 * Conservative on purpose: `prefetch` (not `prerender`) at `moderate` eagerness
 * avoids over-fetching and analytics/prerender side effects — matching the
 * settings Shopify measured a ~130–180ms LCP/FCP win with.
 */
const SPECULATION_RULES = {
  prefetch: [
    {
      source: "document",
      eagerness: "moderate",
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: "/admin/*" } },
          { not: { href_matches: "/api/*" } },
          { not: { selector_matches: "[data-no-prefetch]" } },
          { not: { selector_matches: "[rel~=nofollow]" } },
        ],
      },
    },
  ],
} as const;

export function SpeculationRules() {
  return (
    <script
      type="speculationrules"
      // Static, build-time constant — no user input, no XSS surface.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(SPECULATION_RULES) }}
    />
  );
}
