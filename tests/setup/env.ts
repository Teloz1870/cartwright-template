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
 * Node ≥ 25 puts its own `localStorage` and `sessionStorage` on globalThis, and
 * what they do without `--localstorage-file` depends on the release (on 26.13
 * the first reads as `undefined` and warns; the second is an empty store). In
 * Vitest's default pools the jsdom environment leaves those keys alone, so a
 * jsdom test — and the component it mounts — sees Node's storage instead of
 * jsdom's. In a jsdom file, point both at jsdom's, and keep a value a test
 * assigns, as Vitest's own globals do. Never read Node's getter to decide:
 * reading it is what emits the warning. In a VM pool (`vmThreads`, `vmForks`)
 * jsdom's window IS globalThis: its storage is already there, and a getter here
 * would call itself.
 */
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow && (jsdomWindow as unknown) !== globalThis) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    let assigned: { value: Storage } | undefined;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get: () => (assigned ? assigned.value : jsdomWindow[key]),
      set: (value: Storage) => {
        assigned = { value };
      },
    });
  }
}

export {};
