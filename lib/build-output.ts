import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * HOST2-1 — `CARTWRIGHT_OUTPUT=standalone` makes `next build` emit
 * `.next/standalone`, the Node server the `Dockerfile` ships (docs/self-hosting.md).
 * Unset — Vercel and all three canaries — this returns `{}` and registers
 * nothing, so Next gets the config it always had (tests/unit/build-output.test.ts
 * pins that on the real `next.config.ts`). Any other value is refused, so a
 * typo cannot quietly build a normal app.
 */
export const CARTWRIGHT_OUTPUT_ENV = "CARTWRIGHT_OUTPUT";

/**
 * Local data and credentials the tracer must not copy. It takes in the whole
 * tree (`lib/plugins/install.ts` resolves paths under `process.cwd()`):
 * measured, nested databases, `backups/` and `.mail-previews/` all reached
 * `.next/standalone`. Exact on purpose: `*.sqlite*` would also drop Prisma's
 * `query_compiler_fast_bg.sqlite.mjs`.
 */
export const STANDALONE_TRACE_EXCLUDES = [
  "**/*.db",
  "**/*.db-*",
  "**/*.sqlite",
  "**/*.sqlite3",
  "**/*.sqlite-*",
  "**/*.sqlite3-*",
  "**/backups/**",
  "**/.mail-previews/**",
  "**/.env*",
  "**/.admin-credentials*",
  "**/cookie.txt",
  "**/*.pem",
  "**/.vercel/**",
  "**/.mcp.json",
  "**/i18nexus.json",
] as const;

/**
 * Deletes every `.env*` file under a standalone output (outside node_modules)
 * and returns their paths. Next copies the root `.env` and `.env.production`
 * in AFTER tracing (`writeStandaloneDirectory`, next/dist/build/index.js), so no
 * trace exclude stops them. They sit beside `server.js`, nested when Next
 * infers a parent tracing root — hence the walk.
 */
export function stripStandaloneEnvFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.name.startsWith(".env")) {
      rmSync(file, { recursive: true, force: true });
      return [file];
    }
    return entry.isDirectory() && entry.name !== "node_modules" ? stripStandaloneEnvFiles(file) : [];
  });
}

export function buildOutputConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { output?: "standalone"; outputFileTracingExcludes?: Record<string, string[]> } {
  const value = env[CARTWRIGHT_OUTPUT_ENV]?.trim();
  if (!value) return {};
  if (value === "standalone") {
    // Next writes `.next/standalone` last, in the process that loaded this
    // config, so the env files it copied are removed as that process exits.
    process.once("exit", () => {
      stripStandaloneEnvFiles(path.join(process.cwd(), ".next", "standalone"));
    });
    return {
      output: "standalone",
      // "/*" is every route (Next matches keys with `contains`); Turbopack
      // honours it too — measured with planted copies of every file above.
      outputFileTracingExcludes: { "/*": [...STANDALONE_TRACE_EXCLUDES] },
    };
  }
  throw new Error(
    `[Cartwright] ${CARTWRIGHT_OUTPUT_ENV}=${JSON.stringify(value)} is not a build mode. ` +
      `The only supported value is "standalone" (a Node server for a container — see ` +
      `docs/self-hosting.md). Unset it for a normal build.`,
  );
}
