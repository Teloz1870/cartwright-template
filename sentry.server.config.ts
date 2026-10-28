/**
 * Sentry server-side config. No-op uden SENTRY_DSN (= dev/test).
 *
 * GDPR PII-protection: vi sender ALDRIG email, IP, cookies eller auth-headers
 * til Sentry. beforeSend redacter automatisk hvis vi har overset noget.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // 10% sampling — billig overhead, fanger problemer i prod
    tracesSampleRate: 0.1,
    enableLogs: true,
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
