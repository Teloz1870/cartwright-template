import { afterEach, describe, expect, it, vi } from "vitest";

import { assertEnv, runPreflightCli } from "@/lib/env-preflight";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("assertEnv", () => {
  it("dev requires AUTH_SECRET", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("DATABASE_URL", "file:./dev.db");

    expect(() => assertEnv()).toThrow(
      "[Cartwright] Missing required env: AUTH_SECRET.",
    );
  });

  it("dev accepts AUTH_SECRET with DATABASE_URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "dev-secret");
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");

    expect(() => assertEnv()).not.toThrow();
  });

  it("dev accepts AUTH_SECRET with both Turso vars", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "dev-secret");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://example.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "token");

    expect(() => assertEnv()).not.toThrow();
  });

  it("dev rejects missing DATABASE_URL when Turso pair is incomplete", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "dev-secret");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://example.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");

    expect(() => assertEnv()).toThrow(
      "[Cartwright] Missing required env: DATABASE_URL.",
    );
  });

  it("prod requires AUTH_SECRET and both Turso vars", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://example.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");

    expect(() => assertEnv()).toThrow(
      "[Cartwright] Missing required env: TURSO_AUTH_TOKEN.",
    );
  });

  it("does not fire during Next production build phase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");

    expect(() => assertEnv()).not.toThrow();
  });
});

describe("runPreflightCli", () => {
  it("prints OK on success", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "dev-secret");
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    runPreflightCli();

    expect(log).toHaveBeenCalledWith("[Cartwright] Env preflight OK");
  });

  it("prints the actionable error and exits 1 on failure", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    runPreflightCli();

    expect(error).toHaveBeenCalledWith(
      "[Cartwright] Missing required env: AUTH_SECRET. Generate one with `openssl rand -hex 32` and set AUTH_SECRET.",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
