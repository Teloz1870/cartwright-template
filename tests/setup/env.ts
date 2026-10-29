/**
 * Vitest global setup — deterministic test environment.
 *
 * Several unit tests exercise pure helpers (API-key hashing pepper, token
 * signing, etc.) that require certain env vars to be present at call time.
 * These are NON-secret, deterministic placeholders so the suite is
 * self-sufficient and passes in any environment (local, CI, fresh fork)
 * without relying on externally injected secrets.
 *
 * Use `||=` so a real value from the environment always wins.
 */
process.env.AUTH_SECRET ||= "test-auth-secret-deterministic-pepper-not-for-prod";
process.env.DATABASE_URL ||= "file:./dev.db";

/**
 * Node ≥ 25 defines its own `localStorage`/`sessionStorage` on globalThis, and
 * without `--localstorage-file` they read as `undefined` (and warn). Vitest's
 * jsdom environment leaves those keys alone, so a jsdom test — and the
 * component it mounts — sees Node's empty global instead of jsdom's storage.
 * In a jsdom file, point both at jsdom's. Never read Node's getter to decide:
 * reading it is what emits the warning, and on Node ≤ 24 the key is already
 * jsdom's, so redefining it is a no-op there.
 */
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get: () => jsdomWindow[key],
    });
  }
}
