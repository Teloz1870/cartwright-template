/**
 * Shared currency constants — safe to import fra både Server Components
 * og Client Components. Server-only reader-logik lever i
 * `lib/currency-server.ts` (med `import "server-only"`-guard); client-side
 * provider/hook i `lib/currency-context.tsx`.
 *
 * Splittet i tre filer per Next.js's "server-only vs client" model — samme
 * pattern som `lib/consent.ts` (shared) + `lib/consent-server.ts` (server).
 */
export const CURRENCY_COOKIE_NAME = "cw_currency";
