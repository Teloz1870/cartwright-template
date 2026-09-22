/**
 * Sentry edge-runtime config (middleware + edge routes). No-op uden SENTRY_DSN.
 *
 * Edge har samme PII-scrubbing som server — vi vil ikke have cookies/auth
 * sendt med events der opstår i middleware.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
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
