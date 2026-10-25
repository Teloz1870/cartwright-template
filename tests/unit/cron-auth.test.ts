import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isEngineCheckout, lineOf, read, stripComments, walkCode } from "../guards/_shared";

/**
 * CRON-AUTH — one auth gate for every scheduled job.
 *
 * (a) Measured on 2026-10-05: all eleven cron handlers carried their own copy
 * of `if (cronSecret) { if (auth !== \`Bearer …\`) 401 }`. Eleven copies of a
 * security check drift, and `!==` on a secret is not a constant-time compare.
 * They now call `verifyCronRequest` (lib/cron/auth.ts).
 *
 * (b) Without CRON_SECRET a production deploy refuses every cron call (503)
 * instead of running the job for whoever asks. Outside production the routes
 * still answer, as before. The refusal is checked on every route found on
 * disk, not on a list.
 *
 * (d) A CRON_SECRET of only whitespace is no secret: it counts as unset
 * everywhere the secret is read. A real one is compared trimmed, and so is the
 * bearer a caller sends, so a secret that matched before still matches. The
 * bearer is the caller's own input, read before any auth, so the trim is a
 * linear scan and a header over MAX_AUTHORIZATION_LENGTH is refused unread.
 */

const crypto = vi.hoisted(() => ({ calls: [] as Array<[number, number]>, hashes: 0 }));

// A cron body that ran past the gate would reach the database through this.
// None may: every call below is one the gate has to turn away.
vi.mock("@/lib/db", () => {
  const ranPastTheGate = (): never => {
    throw new Error("a cron route touched the database without passing verifyCronRequest");
  };
  const prisma = new Proxy({}, { get: ranPastTheGate, apply: ranPastTheGate });
  return { prisma, default: prisma };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    default: actual,
    createHash: (...args: Parameters<typeof actual.createHash>) => {
      crypto.hashes += 1;
      return actual.createHash(...args);
    },
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

  it("outside production, lets every request through while CRON_SECRET is unset (unchanged)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const nodeEnv of ["test", "development"]) {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const { verifyCronRequest } = await load();
      expect(verifyCronRequest(request()), nodeEnv).toBeNull();
      expect(verifyCronRequest(request("Bearer anything")), nodeEnv).toBeNull();
    }
  });

  it("refuses with 503 in production while CRON_SECRET is unset, whatever the header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const env of [
      { VERCEL_ENV: "production", NODE_ENV: "test" },
      { VERCEL_ENV: "", NODE_ENV: "production" }, // next start, a container, a Vercel preview
    ]) {
      vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV);
      vi.stubEnv("NODE_ENV", env.NODE_ENV);
      const { verifyCronRequest } = await load();
      for (const header of [undefined, "", "Bearer ", "Bearer anything"]) {
        const refused = verifyCronRequest(request(header));
        expect(refused?.status, `${JSON.stringify(env)} ${String(header)}`).toBe(503);
        await expect(refused!.json()).resolves.toEqual({
          error: "CRON_SECRET not configured on this deploy",
        });
      }
    }
  });

  it("in production, answers 401 for a wrong secret and lets the right one through", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("VERCEL_ENV", "production");
    const { verifyCronRequest } = await load();
    expect(verifyCronRequest(request(`Bearer ${SECRET.replace(/.$/, "X")}`))?.status).toBe(401);
    expect(verifyCronRequest(request())?.status).toBe(401);
    expect(verifyCronRequest(request(`Bearer ${SECRET}`))).toBeNull();
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
      `Bearer ${SECRET} x`,
      `Bearer x${SECRET}`,
      `bearer ${SECRET}`,
      `Basic ${SECRET}`,
      `Bearer\t${SECRET}`,
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

  it("treats a CRON_SECRET of only whitespace as unset (CRON-AUTH-d)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A non-breaking space is the dangerous one: HTTP strips spaces and tabs from
    // the edges of a header (so those secrets matched nothing and every job
    // stayed off behind a 401), but U+00A0 survives the wire — `Bearer \u00a0`
    // was a bearer anyone could send, and it let them in.
    // U+0085 (NEL) is Unicode White_Space that String#trim leaves, and it too
    // survives the wire (a latin1 header byte 0x85).
    for (const blank of [" ", "   ", "\t", "\n", " \t\r\n ", "\u00a0", " \u00a0 ", "\u0085", " \u0085\u00a0"]) {
      vi.stubEnv("CRON_SECRET", blank);
      vi.stubEnv("VERCEL_ENV", "production");
      const prod = await load();
      expect(prod.configuredCronSecret(), JSON.stringify(blank)).toBeUndefined();
      // `Bearer ` + the blank is what the old gate expected — a bearer anyone can guess.
      for (const header of [undefined, "", "Bearer", "Bearer ", `Bearer ${blank}`]) {
        const refused = prod.verifyCronRequest(request(header));
        expect(refused?.status, JSON.stringify([blank, header])).toBe(503);
      }
      vi.stubEnv("VERCEL_ENV", "");
      const dev = await load();
      expect(dev.verifyCronRequest(request()), JSON.stringify(blank)).toBeNull();
    }
  });

  it("compares a padded CRON_SECRET by its trimmed value, on both sides", async () => {
    // A secret pasted with a stray space into a dashboard or an env-file. A
    // caller sends `Bearer $CRON_SECRET` as written — the crontab in
    // docs/self-hosting.md, the curl in docs/backup-restore.md — so the pad
    // reaches the header: a leading one inside it, a trailing one stripped by
    // HTTP. Both that header and the unpadded one must pass; the first passed
    // before CRON-AUTH-d trimmed the secret, and must not turn into a 401.
    vi.stubEnv("VERCEL_ENV", "production");
    for (const padded of [
      ` ${SECRET}`,
      `\t${SECRET}`,
      `  ${SECRET}\n`,
      `${SECRET} `,
      `\u00a0${SECRET}\u00a0`,
      `\u0085${SECRET}`,
    ]) {
      vi.stubEnv("CRON_SECRET", padded);
      const { configuredCronSecret, verifyCronRequest } = await load();
      const label = JSON.stringify(padded);
      expect(configuredCronSecret(), label).toBe(SECRET);
      expect(verifyCronRequest(request(`Bearer ${padded}`)), `${label} as written`).toBeNull();
      expect(verifyCronRequest(request(`Bearer ${SECRET}`)), `${label} trimmed`).toBeNull();
      expect(verifyCronRequest(request("Bearer"))?.status, label).toBe(401);
      expect(verifyCronRequest(request(`Bearer ${padded.trimEnd()}x`))?.status, label).toBe(401);
    }
  });

  it("logs the refusal once per instance in production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { verifyCronRequest } = await load();
    verifyCronRequest(request());
    verifyCronRequest(request());
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("CRON_SECRET is not set");
    expect(String(error.mock.calls[0][0])).toContain("refused");
  });

  it("stays quiet outside production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { verifyCronRequest } = await load();
    verifyCronRequest(request());
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("cronBearerMatches", () => {
  it("never matches against a blank secret, whatever is sent", async () => {
    // verifyCronRequest and the two admin routes never call it with one (a
    // blank secret is unset), but a caller that did must not get `Bearer `
    // plus whitespace as a bearer anyone can send.
    const { cronBearerMatches } = await load();
    for (const secret of ["", " ", "\t", "\u00a0", "\u0085"]) {
      for (const header of [null, "", "Bearer", "Bearer ", `Bearer ${secret}`, "Bearer \u00a0", "Bearer \u0085"]) {
        expect(cronBearerMatches(header, secret), JSON.stringify([secret, header])).toBe(false);
      }
    }
  });

  it("matches the trimmed token against the trimmed secret", async () => {
    const { cronBearerMatches } = await load();
    expect(cronBearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronBearerMatches(`Bearer  ${SECRET}`, ` ${SECRET}`)).toBe(true);
    expect(cronBearerMatches(`Bearer ${SECRET}`, ` ${SECRET}\n`)).toBe(true);
    expect(cronBearerMatches(`Bearer \u00a0${SECRET}`, SECRET)).toBe(true);
    expect(cronBearerMatches(`Bearer ${SECRET}`, `${SECRET}x`)).toBe(false);
    expect(cronBearerMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronBearerMatches(SECRET, SECRET)).toBe(false);
  });

  it("trims what String#trim trims, plus U+0085, from the two ends only", async () => {
    // Every UTF-16 unit the old `/^[\s\u0085]+|[\s\u0085]+$/g` trim stripped,
    // run through configuredCronSecret, the trim's other reader.
    const { configuredCronSecret } = await load();
    const spaces: string[] = [];
    for (let unit = 0; unit <= 0xffff; unit++) {
      const char = String.fromCharCode(unit);
      if (/[\s\u0085]/.test(char)) spaces.push(char);
    }
    for (const char of ["\t", "\n", " ", "\u0085", " ", " ", "　", "﻿"]) {
      expect(spaces).toContain(char);
    }
    for (const s of spaces) {
      const label = `U+${s.charCodeAt(0).toString(16).padStart(4, "0")}`;
      expect(configuredCronSecret({ CRON_SECRET: `${s}${s}a${s}${s}b${s}` }), label).toBe(`a${s}${s}b`);
      expect(configuredCronSecret({ CRON_SECRET: s.repeat(3) }), label).toBeUndefined();
    }
    // Not White_Space, so kept: a zero-width space and a lone surrogate.
    for (const kept of ["​", "\ud800", "​x​"]) {
      expect(configuredCronSecret({ CRON_SECRET: kept }), JSON.stringify(kept)).toBe(kept);
    }
  });
});

describe("an Authorization header over MAX_AUTHORIZATION_LENGTH", () => {
  // The gate runs before any auth, on public routes, so what one request can
  // make it do must not grow with the header. A long one is refused unread:
  // not trimmed, not hashed, not compared — even when trimming it would match.
  // Asserted on what the gate touches, not on wall-clock time.
  beforeEach(() => {
    crypto.calls.length = 0;
    crypto.hashes = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a 401 that is never hashed or compared, even padded around the right secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("VERCEL_ENV", "production");
    const { verifyCronRequest } = await load();
    crypto.hashes = 0;
    for (const size of [200_000, 16_000]) {
      const pad = " ".repeat(size);
      for (const header of [`Bearer x${pad}y`, `Bearer ${pad}${SECRET}`, `Bearer  ${pad}${SECRET}`]) {
        expect(verifyCronRequest(request(header))?.status, `${size} ${header.slice(0, 9)}`).toBe(401);
      }
    }
    expect(crypto.hashes, "createHash calls").toBe(0);
    expect(crypto.calls, "timingSafeEqual calls").toEqual([]);
  });

  it("is refused before anything but its length is read", async () => {
    const { cronBearerMatches, MAX_AUTHORIZATION_LENGTH } = await load();
    const touched: string[] = [];
    const unread = new Proxy(
      { length: MAX_AUTHORIZATION_LENGTH + 1 },
      {
        get(target, key) {
          if (key === "length") return target.length;
          touched.push(String(key));
          return undefined;
        },
      },
    ) as unknown as string;
    expect(cronBearerMatches(unread, SECRET)).toBe(false);
    expect(touched, "header members read past the length").toEqual([]);
  });

  it("still reads a padded header of exactly the cap, and refuses one character more", async () => {
    const { cronBearerMatches, MAX_AUTHORIZATION_LENGTH } = await load();
    const pad = " ".repeat(MAX_AUTHORIZATION_LENGTH - "Bearer ".length - SECRET.length);
    const atCap = `Bearer ${pad}${SECRET}`;
    expect(atCap).toHaveLength(MAX_AUTHORIZATION_LENGTH);
    expect(cronBearerMatches(atCap, SECRET)).toBe(true);
    expect(cronBearerMatches(atCap, ` ${SECRET}\n`)).toBe(true);
    expect(cronBearerMatches(`Bearer  ${pad}${SECRET}`, SECRET)).toBe(false);
    // The cap leaves room for any real secret: 512 characters is eight
    // `openssl rand -hex 32` secrets end to end.
    const long = "f".repeat(512);
    expect(cronBearerMatches(`Bearer ${long}`, long)).toBe(true);
  });
});

describe("cronJobsRefusedInProduction", () => {
  it("is true only for a production deploy without CRON_SECRET", async () => {
    const { cronJobsRefusedInProduction } = await load();
    expect(cronJobsRefusedInProduction({ VERCEL_ENV: "production" })).toBe(true);
    expect(cronJobsRefusedInProduction({ NODE_ENV: "production" })).toBe(true);
    expect(
      cronJobsRefusedInProduction({ NODE_ENV: "production", CRON_SECRET: SECRET }),
    ).toBe(false);
    // CRON-AUTH-d: whitespace is not a secret.
    expect(
      cronJobsRefusedInProduction({ NODE_ENV: "production", CRON_SECRET: " \t\n" }),
    ).toBe(true);
    expect(
      cronJobsRefusedInProduction({ NODE_ENV: "production", CRON_SECRET: "\u0085" }),
    ).toBe(true);
    expect(cronJobsRefusedInProduction({ NODE_ENV: "development" })).toBe(false);
    expect(
      cronJobsRefusedInProduction({ NODE_ENV: "development", VERCEL_ENV: "preview" }),
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

describe("in production every route under app/api/cron refuses a call it cannot trust", () => {
  const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
  type Handler = (request: Request) => Promise<Response> | Response;

  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production");
    // Nothing behind the gate may run; a network call would be one.
    vi.stubGlobal("fetch", () => {
      throw new Error("a cron route called fetch without passing verifyCronRequest");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function handlersOf(route: string): Promise<Array<[string, Handler]>> {
    const mod = (await import(route)) as Record<string, unknown>;
    return HTTP_METHODS.filter((m) => typeof mod[m] === "function").map(
      (m) => [m, mod[m] as Handler] as [string, Handler],
    );
  }

  function call(handler: Handler, method: string, authorization?: string) {
    const headers = new Headers();
    if (authorization !== undefined) headers.set("authorization", authorization);
    return handler(new Request("https://shop.example/api/cron/x?dryRun=1", { method, headers }));
  }

  for (const route of routes) {
    const rel = relative(ROOT, route);
    it(`${rel}: 503 without CRON_SECRET (or a blank one), 401 with a wrong or missing bearer`, async () => {
      const handlers = await handlersOf(route);
      expect(handlers.length, `${rel} exports no handler`).toBeGreaterThan(0);
      for (const [method, handler] of handlers) {
        vi.stubEnv("CRON_SECRET", "");
        expect((await call(handler, method)).status, `${method} no secret`).toBe(503);
        expect((await call(handler, method, "Bearer guess")).status, `${method} no secret`).toBe(503);
        vi.stubEnv("CRON_SECRET", "  ");
        expect((await call(handler, method, "Bearer")).status, `${method} blank secret`).toBe(503);

        vi.stubEnv("CRON_SECRET", SECRET);
        expect((await call(handler, method, `Bearer ${SECRET}x`)).status, `${method} wrong`).toBe(401);
        expect((await call(handler, method)).status, `${method} missing`).toBe(401);
      }
    });
  }
});

describe("the two machine-only admin routes read the secret the same way (CRON-AUTH-d)", () => {
  // They take `Bearer <CRON_SECRET>` too, and stay fail-closed with a 500 when
  // it is unset. A blank secret used to count as set — and one of a
  // non-breaking space let `Bearer \u00a0` through; it is now the unset case.
  const MACHINE_ROUTES = [
    "app/api/admin/run-pending-migrations/route.ts",
    "app/api/admin/reset-demo-data/route.ts",
  ].filter((rel) => existsSync(join(ROOT, rel)));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const rel of MACHINE_ROUTES) {
    it(`${rel}: a blank CRON_SECRET is "not configured", not a bearer to match`, async () => {
      const { POST } = (await import(join(ROOT, rel))) as {
        POST: (request: Request) => Promise<Response>;
      };
      vi.stubEnv("CRON_SECRET", "\u00a0");
      // Past the gate the route would reach for Turso; give it nothing to reach.
      vi.stubEnv("TURSO_DATABASE_URL", "");
      vi.stubEnv("TURSO_AUTH_TOKEN", "");
      const res = await POST(
        new Request("https://shop.example/api/admin/x", {
          method: "POST",
          headers: { authorization: "Bearer \u00a0" },
        }),
      );
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        error: "CRON_SECRET not configured on this deploy",
      });
    });

    it(`${rel}: a padded CRON_SECRET still lets in a caller that sends it as written`, async () => {
      const { POST } = (await import(join(ROOT, rel))) as {
        POST: (request: Request) => Promise<Response>;
      };
      vi.stubEnv("CRON_SECRET", ` ${SECRET}`);
      // Past the gate the route stops at the missing Turso credentials, a 500
      // that is not the auth answer — which is how this proves the gate opened.
      vi.stubEnv("TURSO_DATABASE_URL", "");
      vi.stubEnv("TURSO_AUTH_TOKEN", "");
      const post = (authorization: string) =>
        POST(
          new Request("https://shop.example/api/admin/x", {
            method: "POST",
            headers: { authorization },
          }),
        );
      const asWritten = await post(`Bearer  ${SECRET}`);
      expect(asWritten.status).toBe(500);
      expect(((await asWritten.json()) as { error: string }).error).toMatch(/TURSO/);
      expect((await post(`Bearer ${SECRET}x`)).status).toBe(401);
      // Over MAX_AUTHORIZATION_LENGTH it is refused unread, though trimmed it would match.
      expect((await post(`Bearer ${" ".repeat(200_000)}${SECRET}`)).status).toBe(401);
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
