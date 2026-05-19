import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Vercel Blob (admin-uploaded images via /api/admin/upload)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
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
  async headers() {
    if (process.env.NODE_ENV !== "production") {
      return [];
    }
    return [
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
// Org/project læses fra env så vi ikke hardcode'r dem i repo.
export default withSentryConfig(nextConfig, {
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
