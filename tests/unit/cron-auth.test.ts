import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isEngineCheckout, lineOf, read, stripComments, walkCode } from "../guards/_shared";

/**
 * CRON-AUTH-a — one auth gate for every scheduled job.
 *
 * Measured on 2026-10-05: all eleven cron handlers carried their own copy of
 * `if (cronSecret) { if (auth !== \`Bearer …\`) 401 }`. Eleven copies of a
 * security check drift, and `!==` on a secret is not a constant-time compare.
 * They now call `verifyCronRequest` (lib/cron/auth.ts). Behaviour is otherwise
 * unchanged this release: without CRON_SECRET the routes still answer
 * (deprecated — the next release refuses in production).
 */

const crypto = vi.hoisted(() => ({ calls: [] as Array<[number, number]> }));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    default: actual,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      crypto.calls.push([a.byteLength, b.byteLength]);
      return actual.timingSafeEqual(a, b);
    },
  };
});

const SECRET = "s3cret-value-0123456789abcdef";

function request(authorization?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return { headers };
}

async function load() {
  vi.resetModules();
  return import("@/lib/cron/auth");
}

describe("verifyCronRequest", () => {
  beforeEach(() => {
    crypto.calls.length = 0;
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("lets every request through while CRON_SECRET is unset (fail-open, deprecated)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { verifyCronRequest } = await load();
    expect(verifyCronRequest(request())).toBeNull();
    expect(verifyCronRequest(request("Bearer anything"))).toBeNull();
  });

  it("answers 401 for a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { verifyCronRequest } = await load();
    const denied = verifyCronRequest(request(`Bearer ${SECRET.replace(/.$/, "X")}`));
    expect(denied?.status).toBe(401);
    await expect(denied!.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("lets the right secret through", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { verifyCronRequest } = await load();
    expect(verifyCronRequest(request(`Bearer ${SECRET}`))).toBeNull();
  });

  it("answers 401 — without throwing — for a header of a different length, or none", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { verifyCronRequest } = await load();
    for (const header of [
      undefined,
      "",
      "Bearer",
      `Bearer ${SECRET.slice(0, 4)}`,
      `Bearer ${SECRET}${SECRET}`,
      `Bearer  ${SECRET}`, // (Headers trims edges, so the extra space goes inside)
      `bearer ${SECRET}`,
      SECRET,
    ]) {
      expect(verifyCronRequest(request(header))?.status, String(header)).toBe(401);
    }
  });

  it("compares with timingSafeEqual on equal-length buffers", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { verifyCronRequest } = await load();
    verifyCronRequest(request("Bearer x"));
    verifyCronRequest(request(`Bearer ${SECRET}`));
    expect(crypto.calls).toHaveLength(2);
    for (const [a, b] of crypto.calls) expect(a).toBe(b);
  });

  it("warns once per instance when a production deploy runs open", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { verifyCronRequest } = await load();
    verifyCronRequest(request());
    verifyCronRequest(request());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("CRON_SECRET is not set");
  });

  it("stays quiet outside production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { verifyCronRequest } = await load();
    verifyCronRequest(request());
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("cronJobsOpenInProduction", () => {
  it("is true only for a production deploy without CRON_SECRET", async () => {
    const { cronJobsOpenInProduction } = await load();
    expect(cronJobsOpenInProduction({ VERCEL_ENV: "production" })).toBe(true);
    expect(cronJobsOpenInProduction({ NODE_ENV: "production" })).toBe(true);
    expect(
      cronJobsOpenInProduction({ NODE_ENV: "production", CRON_SECRET: SECRET }),
    ).toBe(false);
    expect(cronJobsOpenInProduction({ NODE_ENV: "development" })).toBe(false);
    expect(
      cronJobsOpenInProduction({ NODE_ENV: "development", VERCEL_ENV: "preview" }),
    ).toBe(false);
  });
});

// ── Static guard: no cron route reads CRON_SECRET itself ───────────────────

const ROOT = resolve(__dirname, "../..");
const CRON_ROOT = join(ROOT, "app/api/cron");
const HANDLER_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const GUARD_RE =
  /const (\w+) = verifyCronRequest\(request\);\s*if \(\1\) return \1;/g;
const DIRECT_READ_RE =
  /\benv\s*(?:\.\s*CRON_SECRET\b|\[\s*["'`]CRON_SECRET["'`]\s*\])|\{[^}]*\bCRON_SECRET\b[^}]*\}\s*=\s*process\.env/;

function walkRoutes(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkRoutes(path, out);
    else if (/^route(\.static)?\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** A thin `export { GET } from "@/…"` mount is read through to its implementation. */
function implementationOf(routeFile: string): string {
  const src = readFileSync(routeFile, "utf8");
  const reexport = src.match(/export\s*\{[^}]*\}\s*from\s*["']([^"']+)["']/);
  if (!reexport) return routeFile;
  const spec = reexport[1];
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(dirname(routeFile), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
    if (existsSync(candidate)) return candidate;
  }
  return routeFile;
}

const routes = walkRoutes(CRON_ROOT).sort();

describe("every route under app/api/cron goes through verifyCronRequest", () => {
  it.skipIf(!existsSync(CRON_ROOT))("discovers the cron routes", () => {
    // The engine ships all eleven; a scaffold keeps the ones its profile owns.
    expect(routes.length).toBeGreaterThanOrEqual(isEngineCheckout() ? 11 : 1);
  });

  for (const route of routes) {
    const rel = relative(ROOT, route);
    it(rel, () => {
      const impl = implementationOf(route);
      const src = stripComments(readFileSync(impl, "utf8"));
      const handlers = [...src.matchAll(HANDLER_RE)].length;
      expect(handlers, `${relative(ROOT, impl)} exports no handler`).toBeGreaterThan(0);
      expect(
        [...src.matchAll(GUARD_RE)].length,
        `${relative(ROOT, impl)}: each handler must open with ` +
          "`const unauthorized = verifyCronRequest(request); if (unauthorized) return unauthorized;`",
      ).toBe(handlers);
      expect(
        DIRECT_READ_RE.test(src),
        `${relative(ROOT, impl)} reads CRON_SECRET itself — use verifyCronRequest (lib/cron/auth.ts)`,
      ).toBe(false);
    });
  }
});

describe("no CRON_SECRET bearer is compared with === or !== anywhere", () => {
  // The two machine-only admin routes (run-pending-migrations,
  // reset-demo-data) also take `Bearer <CRON_SECRET>`; they stay fail-closed
  // but compare through cronBearerMatches. A plain string compare of a bearer
  // template is the old pattern, wherever it turns up.
  const PLAIN_COMPARE_RE = /[!=]==\s*`Bearer \$\{|`Bearer \$\{[^`]*\}`\s*[!=]==/g;

  it("finds none in app/, lib/, plugins/ or components/", () => {
    const hits: string[] = [];
    for (const zone of ["app", "lib", "plugins", "components"]) {
      for (const file of walkCode(zone)) {
        const src = stripComments(read(file));
        for (const match of src.matchAll(PLAIN_COMPARE_RE)) {
          hits.push(`${file}:${lineOf(src, match.index ?? 0)}`);
        }
      }
    }
    expect(hits, "compare through cronBearerMatches (lib/cron/auth.ts)").toEqual([]);
  });
});
