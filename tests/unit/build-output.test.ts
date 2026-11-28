import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildOutputConfig,
  CARTWRIGHT_OUTPUT_ENV,
  STANDALONE_TRACE_EXCLUDES,
  stripStandaloneEnvFiles,
} from "@/lib/build-output";

/**
 * HOST2-1: `output: "standalone"` is opt-in through CARTWRIGHT_OUTPUT, so a
 * Vercel build — and every canary — keeps the config it had before the
 * Dockerfile existed. The absence of the key is checked on the REAL
 * `next.config.ts` (Sentry and next-intl wrap it), the object Next loads.
 */
const ROOT = path.resolve(__dirname, "..", "..");

async function loadNextConfig(): Promise<Record<string, unknown>> {
  vi.resetModules();
  const { default: config } = await import("@/next.config");
  return config as Record<string, unknown>;
}

/** Captures the exit hooks a config registers instead of letting them run when the test worker exits. */
function captureExitHooks(): Array<() => void> {
  const hooks: Array<() => void> = [];
  vi.spyOn(process, "once").mockImplementation(((event: string, hook: () => void) => {
    if (event === "exit") hooks.push(hook);
    return process;
  }) as typeof process.once);
  return hooks;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildOutputConfig — standalone only when asked for", () => {
  it("adds nothing when the variable is unset or empty", () => {
    const hooks = captureExitHooks();
    expect(buildOutputConfig({})).toEqual({});
    expect(buildOutputConfig({ [CARTWRIGHT_OUTPUT_ENV]: "" })).toEqual({});
    expect(buildOutputConfig({ [CARTWRIGHT_OUTPUT_ENV]: "  " })).toEqual({});
    expect(Object.keys(buildOutputConfig({}))).toEqual([]);
    expect(hooks).toHaveLength(0);
  });

  it("turns on standalone output for CARTWRIGHT_OUTPUT=standalone", () => {
    captureExitHooks();
    expect(buildOutputConfig({ [CARTWRIGHT_OUTPUT_ENV]: "standalone" })).toMatchObject({
      output: "standalone",
    });
  });

  it("refuses any other value instead of quietly building a normal app", () => {
    for (const value of ["standlone", "export", "STANDALONE", "1"]) {
      expect(() => buildOutputConfig({ [CARTWRIGHT_OUTPUT_ENV]: value }), value).toThrow(
        /CARTWRIGHT_OUTPUT.*only supported value is "standalone"/,
      );
    }
  });
});

describe("next.config.ts — the object Next actually loads", () => {
  it("has no `output` key and no exit step when CARTWRIGHT_OUTPUT is unset (Vercel, the canaries)", async () => {
    vi.stubEnv(CARTWRIGHT_OUTPUT_ENV, undefined);
    const hooks = captureExitHooks();
    const config = await loadNextConfig();
    expect("output" in config).toBe(false);
    expect("outputFileTracingExcludes" in config).toBe(false);
    expect(hooks).toHaveLength(0);
  });

  it("is standalone, and strips env files on exit, when CARTWRIGHT_OUTPUT=standalone", async () => {
    vi.stubEnv(CARTWRIGHT_OUTPUT_ENV, "standalone");
    const hooks = captureExitHooks();
    const config = await loadNextConfig();
    expect(config.output).toBe("standalone");
    expect(config.outputFileTracingExcludes).toEqual({ "/*": [...STANDALONE_TRACE_EXCLUDES] });
    expect(hooks).toHaveLength(1);

    const project = mkdtempSync(path.join(os.tmpdir(), "cw-standalone-"));
    try {
      const standalone = path.join(project, ".next", "standalone");
      mkdirSync(standalone, { recursive: true });
      for (const file of [".env", ".env.production", "server.js"]) {
        writeFileSync(path.join(standalone, file), "TURSO_AUTH_TOKEN=planted\n");
      }
      vi.spyOn(process, "cwd").mockReturnValue(project);
      hooks[0]();
      expect(existsSync(path.join(standalone, ".env"))).toBe(false);
      expect(existsSync(path.join(standalone, ".env.production"))).toBe(false);
      expect(existsSync(path.join(standalone, "server.js"))).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

/**
 * Next copies the root `.env` and `.env.production` into `.next/standalone`
 * after tracing, so the trace excludes cannot stop them (measured on 16.3.8 —
 * a real build carried both). This builds nothing: it plants the layout Next
 * writes, flat and under a parent tracing root, and checks what survives.
 */
describe("stripStandaloneEnvFiles — the env files Next copies past the tracer", () => {
  it("removes every .env file beside server.js, at the root or nested, and nothing else", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cw-standalone-"));
    try {
      const planted = {
        gone: [".env", ".env.production", ".env.local", "apps/shop/.env", "apps/shop/.env.production"],
        kept: ["server.js", "package.json", "apps/shop/server.js", ".next/server/app/page.js", ".next/BUILD_ID"],
        untouched: ["node_modules/some-pkg/.env"],
      };
      for (const file of Object.values(planted).flat()) {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        writeFileSync(path.join(dir, file), "TURSO_AUTH_TOKEN=planted\n");
      }
      const removed = stripStandaloneEnvFiles(dir).map((file) => path.relative(dir, file));
      expect(removed.sort()).toEqual([...planted.gone].sort());
      for (const file of planted.gone) expect(existsSync(path.join(dir, file)), file).toBe(false);
      for (const file of [...planted.kept, ...planted.untouched]) {
        expect(existsSync(path.join(dir, file)), file).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does nothing when there is no standalone output", () => {
    expect(stripStandaloneEnvFiles(path.join(os.tmpdir(), "cw-no-such-standalone-dir"))).toEqual([]);
  });
});

/**
 * The Dockerfile ships in every scaffold profile (an unclaimed root file —
 * scaffold/manifest.json claims are exclusion lists). It stays correct for all
 * of them only while it never names a database-only step itself: the `site`
 * profile has no Prisma, no `prisma/` and no postinstall, and its `build`
 * script is plain `next build`, while light/full run `prisma generate` inside
 * `pnpm build`. So the image builds through `pnpm install` + `pnpm build`, and
 * these pins go red if someone adds a direct Prisma step or a path only the
 * database profiles have.
 */
describe("Dockerfile — one file that is right for every profile", () => {
  const dockerfile = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  const instructions = dockerfile
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .join("\n");

  it("builds with the standalone switch through the project's own scripts", () => {
    expect(instructions).toMatch(/CARTWRIGHT_OUTPUT=standalone/);
    expect(instructions).toMatch(/pnpm install --frozen-lockfile/);
    expect(instructions).toMatch(/pnpm build/);
  });

  it("never calls Prisma or copies a database-only path directly", () => {
    expect(instructions).not.toMatch(/prisma/i);
    expect(instructions).not.toMatch(/COPY[^\n]*\b(prisma|dev\.db|\.env)\b/);
  });

  it("ships the standalone server with its static files and public/, as a non-root user", () => {
    expect(instructions).toMatch(/COPY --from=build[^\n]*\/app\/\.next\/standalone \.\//);
    expect(instructions).toMatch(/COPY --from=build[^\n]*\/app\/\.next\/static \.\/\.next\/static/);
    expect(instructions).toMatch(/COPY --from=build[^\n]*\/app\/public \.\/public/);
    expect(instructions).toMatch(/^USER node$/m);
    expect(instructions).toMatch(/CMD \["node", "server\.js"\]/);
  });

  // What the build context leaves out is checked with Docker's own matching
  // rules, path by path, in tests/unit/dockerignore.test.ts.
});
