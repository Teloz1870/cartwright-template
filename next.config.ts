import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
// Relative, not `@/`: Next transpiles this file with its own SWC require hook,
// which resolves sibling .ts files but not the tsconfig alias. brand.config.ts
// is plain data (its one import is type-only), so it is safe to load at config
// time; i18n/routing.ts is not — it pulls next-intl's navigation layer in.
import { brand } from "./brand.config";
import { buildOutputConfig } from "./lib/build-output";
// Plain data too (no imports); the materializer sets its values per profile.
import { profileCapabilities } from "./lib/profile-capabilities";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Global security headers — Day-1 parity-audit gap #2.
 *
 * Vercel adds HSTS on its own domains, but custom-domain + self-host forks got
 * NOTHING before this. These are the table-stakes companion headers (per the
 * web-security guidance "retrofit" path: low breakage risk, deploy in parallel):
 *
 *  - X-Content-Type-Options: nosniff          — block MIME sniffing
 *  - X-Frame-Options: SAMEORIGIN              — clickjacking defense (legacy
 *      twin of CSP frame-ancestors; kept for older browsers)
 *  - Referrer-Policy: strict-origin-when-cross-origin  — safe default
 *  - Permissions-Policy                        — disable unused powerful features.
 *      geolocation fully off. camera + microphone are scoped to `self` (NOT
 *      fully off) because the `voiceShop` feature uses getUserMedia for mic AND
 *      camera (vision) — see lib/voice/client.ts. A bare `microphone=()` would
 *      silently break voiceShop on every shop that enables it.
 *  - Strict-Transport-Security                 — force HTTPS (matters for
 *      self-host/custom-domain forks where the platform doesn't add it).
 *
 * CSP is shipped REPORT-ONLY (see cspReportOnly below): a strict enforcing CSP
 * would break Next/Turbopack inline bootstrap scripts, inline styles, three.js
 * (blob workers / wasm) and gsap. Report-only lets us observe violations
 * without breaking the 3 canaries; a fork can promote it to enforcing once it
 * has wired a reporting endpoint and triaged its own inline surface.
 */
const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * Report-only CSP. Deliberately permissive (`'unsafe-inline'`/`'unsafe-eval'`,
 * blob:/data:) so it NEVER blocks a working canary — its only job today is to
 * surface what a future enforcing policy would break. `frame-ancestors 'self'`
 * + `base-uri 'self'` + `object-src 'none'` are the parts safe to keep when a
 * fork later flips this to enforcing.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next bootstrap + three.js/wasm need inline + eval; blob: for workers.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self' https: blob: data:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/**
 * URL2: `brand.urls.trailingSlash` steers routing as well as the links
 * lib/urls.ts builds. On, Next gets `trailingSlash: true` — so the URLs it
 * generates itself (metadata canonicals, next-intl's locale redirect) carry the
 * slash — together with `skipTrailingSlashRedirect: true`, which turns off
 * Next's own `/x` → `/x/` redirect. That redirect has no `/api` exception: it
 * would 308 every cron path in vercel.json (Vercel Cron does not follow a
 * redirect), every webhook and every agent endpoint. proxy.ts sends storefront
 * pages to their slash form instead (`trailingSlashRedirect` in lib/urls.ts),
 * and `/api`, `/admin`, `/oauth`, `/icon`, `/og` and files answer at the address
 * as asked. Read here directly because this file cannot load lib/urls.ts (see
 * the import note above); only a literal `true` turns it on, and anything else
 * is caught by lib/urls.ts at the first link. Off — the default, and every
 * canary — leaves both keys out, so Next receives the config it did before.
 */
const trailingSlash =
  (brand as { urls?: { trailingSlash?: unknown } | null }).urls?.trailingSlash === true;

/**
 * URL1: `brand.urls.localePrefix: "never"` serves every page without its locale
 * (i18n/routing.ts reads it through lib/urls.ts `routingLocalePrefix`). It needs
 * exactly one locale, and routing cannot throw at import, so the build refuses
 * the combination here — loudly, before a shop serves two languages at one path.
 */
const localePrefixNever =
  (brand as { urls?: { localePrefix?: unknown } | null }).urls?.localePrefix === "never";
if (localePrefixNever && (brand.locales as readonly string[]).length !== 1) {
  throw new Error(
    `brand.urls.localePrefix: "never" needs exactly one locale, but brand.locales is ` +
      `[${brand.locales.join(", ")}]. Keep "always" (the default) on a multi-language shop.`,
  );
}

const nextConfig: NextConfig = {
  ...(trailingSlash ? { trailingSlash: true, skipTrailingSlashRedirect: true } : {}),
  // Standalone only with CARTWRIGHT_OUTPUT=standalone; unset spreads nothing (lib/build-output.ts).
  ...buildOutputConfig(),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Vercel Blob (admin-uploaded images via /api/admin/upload)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // dev seed-data uses picsum placeholders — required for capturing webshop designs locally
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // Eksplicitte cache-headers: HTML-sider revalideres altid, men hashede
  // static assets (CSS/JS chunks under _next/static/) caches aggressivt
  // — deres URL ændrer sig ved hver build, så det er sikkert.
  // Dette forhindrer at en palette-/CSS-ændring stranger i browser-cache
  // (hvilket producerede den intermittente "orange-på-refresh" bug).
  //
  // PRODUCTION-ONLY: I dev rebuilder Turbopack samme URL uden hash-bump,
  // så immutable cache forhindrer browseren i at se globals.css-ændringer.
  // Next dev advarer eksplicit hvis vi sætter custom Cache-Control på
  // _next/static i dev ("can break Next.js development behavior").
  // Diagnosticeret under Phase 6: globals.css token-ændringer var usynlige
  // i browseren indtil .next blev slettet OG en fresh isolated context blev åbnet.
  //
  // Addresses the site itself hands out that did not answer (AUD18-a, measured
  // live on Teloz 2026-09-21). Config redirects run BEFORE proxy.ts (Next
  // applies them ahead of middleware and the filesystem), so neither the locale
  // rewrite nor the merchant-redirect lookup sees these requests. `permanent:
  // true` is a 308: method-preserving, and browsers and search engines may
  // cache it for good — right for two addresses that will never answer
  // anything else.
  async redirects() {
    return [
      // `app/icon.tsx` replaced the static favicon, so the conventional
      // `/favicon.ico` every browser and crawler asks for by habit answered
      // with an HTML page instead of an image (lib/locale-exempt.ts). The
      // proxy matcher already excludes `favicon.ico`, so nothing else changes.
      { source: "/favicon.ico", destination: "/icon", permanent: true },
      // `om-os` is the Danish alias of the canonical `/about` page
      // (lib/canonical-public-routes.ts), yet `/:locale/om-os` had no route and
      // answered 404. Restricted to the configured locales — `brand.locales` is
      // the single source i18n/routing.ts reads too — so `/xx/om-os` stays a
      // 404 and `/:locale/info/om-os` (three segments) is untouched.
      // With `urls.trailingSlash` on, the destination carries the slash the
      // proxy would add, so `/da/om-os` and `/da/om-os/` both land in one hop
      // (URL2; Next matches a config source with or without its slash).
      // URL1: under `localePrefix: "never"` the page is `/about` and the alias is
      // asked for with or without the locale, so both forms land there in one
      // hop — in a profile that has the page at all.
      ...(localePrefixNever
        ? Boolean(profileCapabilities.trustPages)
          ? [
              {
                source: `/:locale(${brand.locales.join("|")})?/om-os`,
                destination: trailingSlash ? "/about/" : "/about",
                permanent: true,
              },
            ]
          : []
        : [
            {
              source: `/:locale(${brand.locales.join("|")})/om-os`,
              destination: trailingSlash ? "/:locale/about/" : "/:locale/about",
              permanent: true,
            },
          ]),
    ];
  },
  async headers() {
    // Security headers apply in EVERY environment (incl. dev) and to EVERY
    // route — they carry no Turbopack-cache caveat. The CSP rides along as
    // report-only so it can never break a render.
    const securityBlock = {
      source: "/:path*",
      headers: [
        ...SECURITY_HEADERS,
        {
          key: "Content-Security-Policy-Report-Only",
          value: CSP_REPORT_ONLY,
        },
      ],
    };

    if (process.env.NODE_ENV !== "production") {
      // Dev: ship the security headers but NOT the Cache-Control rules — those
      // break Turbopack's HMR on _next/static (see note above).
      return [securityBlock];
    }
    return [
      securityBlock,
      {
        source: "/((?!_next/static).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Hero-video + poster: versioneret med -v1 så vi kan rotere uden
      // cache-busting. Næste version bliver fx hero-v2.mp4. Immutable
      // sparer round-trips på revisits + CDN-egress.
      {
        source: "/hero/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

// withSentryConfig: source-map upload + tunnel-route mod ad-blockers.
// No-op uden SENTRY_AUTH_TOKEN — så build virker fint lokalt uden secrets.
// org/project læses fra env så vi ikke hardcode'r dem i repo.
export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  // Læses fra env så fork-shops uploader source-maps til deres egen Sentry-org,
  // ikke cartwright-skabelonens. Hvis env-vars ikke er sat, no-op'er Sentry-upload.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
