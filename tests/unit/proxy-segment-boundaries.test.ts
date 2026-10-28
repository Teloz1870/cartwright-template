import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes, not the minimal tests/shims/next-server.ts:
// next-intl's middleware runs for real behind proxy.ts (rewrites, redirects).
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";
// Next's own answer to "does the proxy run for this URL": it compiles
// `config.matcher` the way the build does and applies it the way the server
// does (docs: proxy.md → "Unit testing").
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * PROXY-SEGMENT-BOUNDARIES — every path check in proxy.ts reads whole path
 * segments.
 *
 * On v0.63.0 five of them did not. The matcher's `hero` skipped any path that
 * began with it, so a migrated `/heron-hegn/x/` or `/heroes/` never reached the
 * proxy: no permalink, no redirect row, no language redirect. The admin gate
 * took `/en/administration`, the account gate `/en/accounting` and any path
 * with `/account/` in it, and sent a visitor to sign in. `/apiary` was treated
 * as the API: no redirect lookup, no locale, a 404.
 *
 * What the checks exist for is pinned unchanged: every asset the matcher
 * skipped (the `/hero/` folder, Next's files, the metadata routes), the admin
 * and account gates on their own paths, and the /api branch.
 *
 * Every brand value a row depends on is set by the row (locales, defaultLocale,
 * urls), so the file passes in a scaffold whose own brand.config differs.
 */

const ORIGIN = "https://shop.example";

const ALWAYS = { locales: ["da", "en"], defaultLocale: "da", urls: { localePrefix: "always" } };
const NEVER = { locales: ["da"], defaultLocale: "da", urls: { localePrefix: "never" } };

type Session = { user: { role: string } } | null;
type Handler = (req: NextRequest) => Promise<Response> | Response;

const CUSTOMER: Session = { user: { role: "customer" } };
const ADMIN: Session = { user: { role: "admin" } };
const LOGIN = "/account/login";

const strip = (value: string | null) => (value ? value.replace(ORIGIN, "") : null);

async function hit(proxy: Handler, path: string, session: Session = null) {
  const res = await proxy(Object.assign(new NextRequest(new URL(path, ORIGIN)), { auth: session }));
  return {
    status: res.status,
    location: strip(res.headers.get("location")),
    rewrite: strip(res.headers.get("x-middleware-rewrite")),
    rateLimit: res.headers.get("ratelimit-limit"),
  };
}

const productFindMany = vi.fn(async () => [] as { slug: string; permalink: string }[]);

async function mockShop(patch: Record<string, unknown>) {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({ ...actual, brand: { ...actual.brand, ...patch } }));
}

/**
 * The db variant, with a merchant redirect map in Redis (as lib/redirects/
 * store.ts writes it) and an always-passing rate limiter, so an /api answer
 * carries the RateLimit headers that mark the API branch.
 */
async function loadProxy(patch: Record<string, unknown>, redirects: Record<string, unknown> = {}): Promise<Handler> {
  await mockShop(patch);
  // `auth(handler)` hands the handler straight back; each request carries its own `auth`.
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
  vi.doMock("@upstash/redis", () => ({
    Redis: { fromEnv: () => ({ get: async (key: string) => (key === "cartwright_redirects" ? redirects : null) }) },
  }));
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(
      class {
        limit = async () => ({ success: true, limit: 20, remaining: 19, reset: Date.now() + 10_000 });
      },
      { slidingWindow: () => ({}) },
    ),
  }));
  vi.doMock("@/lib/db", () => ({
    prisma: { category: { findMany: async () => [] }, product: { findMany: productFindMany } },
  }));
  return (await import("@/proxy")).default as unknown as Handler;
}

async function loadStaticProxy(patch: Record<string, unknown>): Promise<Handler> {
  await mockShop(patch);
  return (await import("@/proxy.static")).default as unknown as Handler;
}

afterEach(() => {
  for (const mod of [
    "@/brand.config",
    "@/lib/db",
    "next/server",
    "next-auth",
    "@/lib/auth.config",
    "@upstash/redis",
    "@upstash/ratelimit",
  ]) {
    vi.doUnmock(mod);
  }
  productFindMany.mockReset();
  productFindMany.mockResolvedValue([]);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ── 1. the matcher ────────────────────────────────────────────────────────────

/** v0.63.0's matcher: the baseline every asset below is held to. */
const BEFORE =
  "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|apple-icon|.*\\..*|hero).*)";

/**
 * Two readings of one matcher: as a native RegExp (how the link helper and the
 * other tests read it), and as Next compiles it at build — data-route prefix,
 * `.rsc`/`.json` suffix and all — then applies it per request.
 */
function readings(matcher: string) {
  // A source Next refuses ends the build process; here it fails the test.
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`Next refused the matcher (exit ${code})`);
  });
  const native = new RegExp(`^${matcher}$`);
  return {
    native: (p: string) => native.test(p),
    next: (p: string) => unstable_doesMiddlewareMatch({ config: { matcher }, url: p }),
  };
}

async function matchers() {
  await loadProxy(ALWAYS);
  const { config } = await import("@/proxy");
  const { config: staticConfig } = await import("@/proxy.static");
  return { proxy: config.matcher[0], proxyStatic: staticConfig.matcher[0] };
}

const PUBLIC = path.join(process.cwd(), "public");

/** Every file under public/, as the address it is served at. */
function publicFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(`/${path.relative(PUBLIC, full).split(path.sep).join("/")}`);
    }
  };
  if (existsSync(PUBLIC)) walk(PUBLIC);
  return out;
}

/**
 * The hero videos and posters the demo canaries serve from public/hero/ —
 * demo/northbound-coffee-v2 and demo/solbrillen-dk, which brand.config.ts and
 * designs/crema link — plus the undotted shapes of that folder.
 */
const HERO_ASSETS = [
  "/hero/hero-v1.mp4",
  "/hero/hero-poster-v1.jpg",
  "/hero/hero-v4.mp4",
  "/hero/hero-v4.webm",
  "/hero/hero-poster-v4.jpg",
  "/hero/x",
  "/hero/x/y",
  "/hero/",
  "/hero",
];

/** Next's own files, the root metadata routes, and the dotted documents. */
const OTHER_SKIPPED = [
  "/_next/static/chunks/a.js",
  "/_next/static/css/b.css",
  "/_next/image",
  "/_next/image/x",
  "/favicon.ico",
  "/opengraph-image",
  "/opengraph-image-1a2b3c",
  "/twitter-image",
  "/apple-icon",
  "/apple-icon/0",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/.well-known/oauth-authorization-server",
];

const NOW_PROXIED = ["/heron-hegn/x", "/heron-hegn/x/", "/heroes", "/heroes/", "/hero-sale/", "/herox", "/heron"];
/**
 * Paths that reached the proxy before and still do — including every gate and
 * branch the proxy owns (admin, account, /api, OAuth) and the undotted
 * `app/icon.tsx` and `app/og` routes, which are not metadata the matcher names.
 * A matcher that newly skipped any of them would take the gate or the branch
 * away without a single gate test noticing, since those call the proxy directly.
 */
const STILL_PROXIED = [
  "/",
  "/da",
  "/da/",
  "/da/heron-hegn/x/",
  "/da/hero/x",
  "/hegn/hero/",
  "/en/produkter",
  "/admin",
  "/admin/x",
  "/da/admin",
  "/account",
  "/da/account/orders",
  "/api",
  "/api/x",
  "/oauth/authorize",
  "/icon",
  "/og",
];

describe("the matcher skips the /hero segment, not every path that begins with hero", () => {
  it("both proxies carry the same matcher", async () => {
    const { proxy, proxyStatic } = await matchers();
    expect(proxyStatic).toBe(proxy);
  });

  it.each(["native", "next"] as const)(
    "%s: every asset the v0.63.0 matcher skipped is still skipped",
    async (reading) => {
      const now = readings((await matchers()).proxy)[reading];
      const before = readings(BEFORE)[reading];
      const files = publicFiles();
      // Guards the walk itself: one that silently came back short would pass
      // for the worst reason. Every top-level file of public/ must be in it.
      const top = existsSync(PUBLIC) ? readdirSync(PUBLIC).filter((n) => statSync(path.join(PUBLIC, n)).isFile()) : [];
      expect(files).toEqual(expect.arrayContaining(top.map((n) => `/${n}`)));
      const assets = [...files, ...HERO_ASSETS, ...OTHER_SKIPPED];
      for (const asset of assets) {
        expect({ asset, skippedBefore: !before(asset) }).toEqual({ asset, skippedBefore: true });
        expect({ asset, skipped: !now(asset) }).toEqual({ asset, skipped: true });
      }
    },
  );

  it.each(["native", "next"] as const)("%s: a path that only begins with hero reaches the proxy", async (reading) => {
    const now = readings((await matchers()).proxy)[reading];
    for (const p of [...NOW_PROXIED, ...STILL_PROXIED]) {
      expect({ p, proxied: now(p) }).toEqual({ p, proxied: true });
    }
  });

  it.each(["native", "next"] as const)(
    "%s: that is the whole difference — nothing newly skipped, and only hero-named paths freed",
    async (reading) => {
      const now = readings((await matchers()).proxy)[reading];
      const before = readings(BEFORE)[reading];
      const corpus = [...publicFiles(), ...HERO_ASSETS, ...OTHER_SKIPPED, ...NOW_PROXIED, ...STILL_PROXIED];
      for (const p of corpus) {
        const freed = !before(p) && now(p);
        expect({ p, freed }).toEqual({ p, freed: /^\/hero[^/]/.test(p) });
        if (before(p)) expect({ p, proxied: now(p) }).toEqual({ p, proxied: true });
      }
    },
  );
});

// ── 2. the admin and account gates ────────────────────────────────────────────

const MODES = [
  ["always", ALWAYS, false],
  ["always + trailingSlash", ALWAYS, true],
  ["never", NEVER, false],
  ["never + trailingSlash", NEVER, true],
] as const;

async function loadMode(base: typeof ALWAYS | typeof NEVER, trailingSlash: boolean) {
  if (trailingSlash) vi.stubEnv("_next_intl_trailing_slash", "true");
  return loadProxy({ ...base, urls: { ...base.urls, ...(trailingSlash ? { trailingSlash: true } : {}) } });
}

const isAlways = (base: typeof ALWAYS | typeof NEVER) => base.urls.localePrefix === "always";

describe.each(MODES)("the gates, under %s", (_, base, trailingSlash) => {
  const adminPaths = ["/admin", "/admin/", "/admin/x", "/da/admin", "/da/admin/x/", ...(isAlways(base) ? ["/en/admin"] : [])];
  const accountPaths = [
    "/account",
    "/account/",
    "/account/orders",
    "/da/account",
    "/da/account/settings/",
    ...(isAlways(base) ? ["/en/account/orders"] : []),
  ];
  const storefrontPaths = [
    "/da/administration",
    "/da/admin-old/",
    "/da/accounting",
    "/da/accountants/x",
    "/x/account/y",
    "/da/hegn/account/x/",
    ...(isAlways(base) ? ["/en/administration", "/en/accounting/"] : ["/administration", "/accounting", "/hegn/account/x"]),
  ];

  it("still gates the admin: sign in, then admins only", async () => {
    const proxy = await loadMode(base, trailingSlash);
    for (const p of adminPaths) {
      expect(await hit(proxy, p), p).toMatchObject({ status: 307, location: LOGIN });
      expect(await hit(proxy, p, CUSTOMER), p).toMatchObject({ status: 307, location: "/" });
      expect(await hit(proxy, p, ADMIN), p).toMatchObject({ status: 200, location: null });
    }
  });

  it("still gates the account pages, and still sends an admin from the account root to /admin", async () => {
    const proxy = await loadMode(base, trailingSlash);
    for (const p of accountPaths) {
      expect(await hit(proxy, p), p).toMatchObject({ status: 307, location: LOGIN });
      expect((await hit(proxy, p, CUSTOMER)).location, p).not.toBe(LOGIN);
    }
    for (const p of ["/account", "/da/account", "/da/account/"]) {
      expect(await hit(proxy, p, ADMIN), p).toMatchObject({ status: 307, location: "/admin" });
    }
  });

  it("keeps the public auth pages open", async () => {
    const proxy = await loadMode(base, trailingSlash);
    for (const p of ["/da/account/login", "/account/signup", "/da/account/forgot-password/"]) {
      expect(await hit(proxy, p), p).not.toMatchObject({ status: 307, location: LOGIN });
    }
  });

  it("lets a path that only begins with admin or account, or has /account/ deeper down, through ungated", async () => {
    const proxy = await loadMode(base, trailingSlash);
    for (const p of storefrontPaths) {
      const signedOut = await hit(proxy, p);
      // A gate is the only part of the proxy that reads the session, so an
      // ungated path answers the same to everyone.
      expect(signedOut.location, p).not.toBe(LOGIN);
      expect(await hit(proxy, p, CUSTOMER), p).toEqual(signedOut);
      expect(await hit(proxy, p, ADMIN), p).toEqual(signedOut);
    }
  });
});

// ── 3. /api and the redirect lookup ───────────────────────────────────────────

const ROWS = {
  "/apiary": { to: "/ny", status: 301 },
  "/administration": { to: "/ny", status: 301 },
  "/api/x": { to: "/ny", status: 301 },
  "/admin/x": { to: "/ny", status: 301 },
};

describe("/api and /admin are whole segments for the API branch and the redirect lookup", () => {
  it("looks /apiary and /administration up like any other path", async () => {
    const proxy = await loadProxy(ALWAYS, ROWS);
    expect(await hit(proxy, "/apiary")).toMatchObject({ status: 301, location: "/ny", rateLimit: null });
    expect(await hit(proxy, "/administration")).toMatchObject({ status: 301, location: "/ny" });
    // Behind a locale it was looked up before as well.
    expect(await hit(proxy, "/da/administration")).toMatchObject({ status: 301, location: "/da/ny" });
  });

  it("sends an /api-named page without a row to its locale, not to the API branch", async () => {
    const proxy = await loadProxy(ALWAYS, ROWS);
    expect(await hit(proxy, "/apikultur")).toMatchObject({ status: 307, location: "/da/apikultur", rateLimit: null });
  });

  it("still hands /api to its routes, rate-limited, and never fires a row on /api or /admin", async () => {
    const proxy = await loadProxy(ALWAYS, ROWS);
    for (const p of ["/api", "/api/", "/api/x", "/api/v1/tools/products.search"]) {
      expect(await hit(proxy, p), p).toEqual({ status: 200, location: null, rewrite: null, rateLimit: "20" });
    }
    expect(await hit(proxy, "/admin/x")).toMatchObject({ status: 307, location: LOGIN });
  });

  it.each([
    ["always", ALWAYS, { status: 307, location: "/da/apiary", rewrite: null }],
    ["never", NEVER, { status: 200, location: null, rewrite: "/da/apiary" }],
  ] as const)("the site profile's proxy does the same (%s)", async (_, patch, apiary) => {
    const proxy = await loadStaticProxy(patch);
    for (const p of ["/api", "/api/x"]) {
      expect(await hit(proxy, p), p).toMatchObject({ status: 200, location: null, rewrite: null });
    }
    expect(await hit(proxy, "/apiary")).toMatchObject(apiary);
  });
});

// ── 4. end to end: a migrated permalink that begins with hero ─────────────────

describe("a stored /heron-hegn/x/ permalink is reached and served", () => {
  it("passes the matcher, goes to its locale, and is served there", async () => {
    productFindMany.mockResolvedValue([{ slug: "type-1", permalink: "/heron-hegn/x/" }]);
    const proxy = await loadProxy({ ...ALWAYS, urls: { ...ALWAYS.urls, permalinks: true } });
    const { config } = await import("@/proxy");
    const { next } = readings(config.matcher[0]);
    // The old inbound link, as Next hands it over: the proxy runs for it now…
    expect(next("/heron-hegn/x/")).toBe(true);
    // …and sends it to the reader's language, where the product answers.
    expect(await hit(proxy, "/heron-hegn/x/")).toMatchObject({ status: 307, location: "/da/heron-hegn/x" });
    expect(next("/da/heron-hegn/x")).toBe(true);
    expect(await hit(proxy, "/da/heron-hegn/x")).toMatchObject({ status: 200, rewrite: "/da/product/type-1" });
  });
});
