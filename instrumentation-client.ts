/**
 * Sentry browser-runtime config. No-op uden NEXT_PUBLIC_SENTRY_DSN.
 *
 * GDPR: vi masker ALL tekst og medier i Session Replay og stripper PII
 * fra events før upload. user.id må gerne sendes (anonymiseret), email/IP ikke.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,

    // Replay: 0% af alle sessioner, 100% af sessioner med fejl.
    // Vi vil ikke spilde budget på normale sessioner — kun replay'e
    // dem der faktisk havde et problem.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // GDPR: alt tekst/medier maskeres som default. Vi sender ikke
        // produktnavne, priser, kundeinput eller checkout-felter rå.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["cookie"];
        delete event.request.headers["authorization"];
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

// App Router navigation-tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
