/**
 * Sentry client-side config. No-op hvis NEXT_PUBLIC_SENTRY_DSN ikke er sat.
 *
 * Bemærk: client-DSN er offentlig (i bundled JS) — det er OK fordi DSN
 * kun tillader event-submission, ikke read. Stadig: lille volumen-impact
 * hvis DSN leakes (folk kan spamme dit Sentry-projekt). Reset DSN hvis
 * misbrug detekteres.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.05, // 5% client-side — billigere volumen
    replaysSessionSampleRate: 0, // ingen session replay (PII)
    replaysOnErrorSampleRate: 0,
  });
}
