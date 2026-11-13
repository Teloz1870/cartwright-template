/**
 * fail-fast env check; called from boot path or CLI script; reuses lib/db.ts guard logic.
 */

const BUILD_PHASE = "phase-production-build";

function cleanEnv(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw.replace(/[^\x20-\x7E]/g, "").trim();
  const unquoted = stripped.replace(/^["']|["']$/g, "");
  return unquoted || undefined;
}

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === BUILD_PHASE;
}

function missingEnvError(name: string, hint: string): Error {
  return new Error(`[Cartwright] Missing required env: ${name}. ${hint}.`);
}

function requireEnv(name: string, hint: string): string {
  const value = cleanEnv(process.env[name]);
  if (!value) {
    throw missingEnvError(name, hint);
  }
  return value;
}

export function assertEnv(): void {
  if (isBuildPhase()) return;

  requireEnv(
    "AUTH_SECRET",
    "Generate one with `openssl rand -hex 32` and set AUTH_SECRET",
  );

  const tursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
  const tursoToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);

  if (process.env.NODE_ENV === "production") {
    // Deliberate self-hoster escape hatch (DEPLOY.md §2): a persistent-volume
    // deployment may run production on a local SQLite file. Without this leg
    // the ALLOW_SQLITE_IN_PRODUCTION guard in lib/db.ts was unreachable dead
    // code — preflight threw before it ever ran.
    if (
      process.env.ALLOW_SQLITE_IN_PRODUCTION === "1" &&
      cleanEnv(process.env.DATABASE_URL)?.startsWith("file:")
    ) {
      return;
    }
    if (!tursoUrl) {
      throw missingEnvError(
        "TURSO_DATABASE_URL",
        "Create a Turso database and set TURSO_DATABASE_URL " +
          "(or set ALLOW_SQLITE_IN_PRODUCTION=1 with a file: DATABASE_URL " +
          "on a persistent volume — see DEPLOY.md)",
      );
    }
    if (!tursoToken) {
      throw missingEnvError(
        "TURSO_AUTH_TOKEN",
        "Create a Turso database token and set TURSO_AUTH_TOKEN",
      );
    }
    return;
  }

  const databaseUrl = cleanEnv(process.env.DATABASE_URL);
  if (!databaseUrl && !(tursoUrl && tursoToken)) {
    throw missingEnvError(
      "DATABASE_URL",
      "Set DATABASE_URL=file:./dev.db or set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN",
    );
  }
}

export function runPreflightCli(): void {
  try {
    assertEnv();
    console.log("[Cartwright] Env preflight OK");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
