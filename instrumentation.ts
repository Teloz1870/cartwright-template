/**
 * Next.js instrumentation hook. Indlæser Sentry-konfig per runtime.
 *
 * Uden denne fil loader Next ALDRIG sentry.server.config.ts eller
 * sentry.edge.config.ts — så server- og edge-events ville aldrig nå Sentry,
 * selv hvis SENTRY_DSN var sat. Diagnosticeret 2026-05-18.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Fanger unhandled server-side request errors (App Router server components,
// route handlers, server actions). Kræver @sentry/nextjs >= 8.28.0.
export const onRequestError = Sentry.captureRequestError;
