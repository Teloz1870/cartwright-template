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
