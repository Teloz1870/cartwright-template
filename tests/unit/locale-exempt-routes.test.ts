import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_EXEMPT_PREFIXES,
  LOCALE_EXEMPT_PREFIXES,
  PROTOCOL_EXEMPT_PREFIXES,
  isAssetExempt,
  isLocaleExempt,
  isProtocolExempt,
} from "@/lib/locale-exempt";

/**
 * `proxy.ts` is imported for real further down. Only its two untestable edges
 * are mocked: `auth()` (which would decode a session) is reduced to the identity
 * wrapper so the default export IS the handler, and next-intl's middleware
 * becomes a spy so "did this request reach the locale rewrite?" is observable.
 * Everything else — the matcher, the branch order, the redirect lookup — runs as
 * written. Redis is untouched: with no UPSTASH_* env the module's own guards
 * leave `redis`/`ratelimit` null, the shape a default scaffold runs in anyway.
 */
const intlSpy = vi.fn(() => new Response(null, { status: 200 }));

/**
 * A merchant redirect that fires for every path. The proxy only ever loads a
 * real map from Redis, so with no UPSTASH_* env the map is empty and the
 * ordering of the two exempt branches around the lookup is unobservable —
 * which is the one property that keeps an OAuth endpoint from being
 * retargetable off-origin. Forcing a hit makes that ordering behaviour instead
 * of a claim about line numbers.
 */
let redirectHit: { to: string; status: number } | null = null;
vi.mock("@/lib/redirects/match", () => ({
  matchRedirect: () => redirectHit,
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}));
vi.mock("@/lib/auth.config", () => ({ default: {} }));
vi.mock("next-intl/middleware", () => ({ default: () => intlSpy }));

/**
 * A route outside `app/[locale]/` is only reachable if something stops next-intl
 * from prepending a locale to it. There are exactly three such escapes (see
 * lib/locale-exempt.ts): an early return in `proxy.ts`, a dot in the path, or a
 * name written into the middleware matcher by hand.
 *
 * Nothing checked that a route had one. Four shipped without: `/oauth/*`,
 * `/icon`, `/og` and `/manifest` each answered `307 → /da/<path>` → `404` on
 * every verb — measured on all three canaries. The failure is silent by
 * construction: the folder builds, the route compiles, `pnpm dev` and
 * `pnpm build` are green, and only a request shows it.
 *
 * So the locale-less route paths are DERIVED from `app/` here rather than
 * restated as a hand-kept list, which would drift the way the matcher did. The
 * derivation covers root metadata conventions (`icon.tsx`, `sitemap.ts`, …) as
 * well as route folders — `/icon` is a metadata convention, and an earlier
 * version of this file that only walked route folders could not see it.
 */

const ROOT = join(__dirname, "..", "..");

/**
 * Does this tree ship the UCP/OAuth module?
 *
 * Read from the scaffold's own prune record, NOT from `existsSync("app/oauth")`:
 * a namespace probe flips true the moment anyone adds an unrelated
 * `app/oauth/callback/route.ts` to a light scaffold — and then demands the very
 * endpoints that profile pruned — while a stray deletion in a full tree would
 * read as "light" and quietly stop asserting. The marker has two writers with
 * different field names; no marker (the engine repo) means nothing was pruned.
 */
function declaredPrunedPaths(): string[] {
  const marker = join(ROOT, ".cartwright", "profile.json");
  if (!existsSync(marker)) return [];
  try {
    const m = JSON.parse(readFileSync(marker, "utf8")) as {
      excludedPaths?: string[];
      removedPaths?: string[];
    };
    const fields = [m.excludedPaths, m.removedPaths].filter(Array.isArray);
    return fields.flat() as string[];
  } catch {
    throw new Error(
      ".cartwright/profile.json exists but could not be parsed — refusing to " +
        "guess whether the OAuth module is present.",
    );
  }
}

const PRUNED_PATHS = declaredPrunedPaths();

/**
 * Is PATH covered by something this tree declares pruned?
 *
 * Asks whether a pruned entry equals or is a PARENT of the path. The first cut
 * asked the reverse (`p.startsWith("app/oauth/")`), which crashed the suite for
 * two valid shapes: pruning a parent (`["app"]`) read as "kept", and pruning one
 * child (`["app/oauth/token"]`) read as "the whole module is gone".
 */
function isDeclaredPruned(path: string): boolean {
  return PRUNED_PATHS.some(
    (p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

// Cross-check a SPECIFIC module route, never the namespace. `existsSync("app/oauth")`
// is true the moment an app adds an unrelated `app/oauth/callback/route.ts` to a
// light scaffold — which would have thrown here even though none of the pruned
// endpoints came back.
const OAUTH_SENTINEL = "app/oauth/token/route.ts";
const UCP_SENTINEL = "lib/ucp/oauth.ts";
const HAS_OAUTH_ROUTES = !isDeclaredPruned(OAUTH_SENTINEL);
const HAS_UCP_OAUTH = !isDeclaredPruned(UCP_SENTINEL);

// Both sentinels are cross-checked, not just the first: a marker entry for
// lib/ucp on a tree that still ships it would otherwise silently retire the
// RFC 8414 test instead of failing.
for (const [label, declaredPresent, file] of [
  ["app/oauth", HAS_OAUTH_ROUTES, OAUTH_SENTINEL],
  ["lib/ucp", HAS_UCP_OAUTH, UCP_SENTINEL],
] as const) {
  if (declaredPresent !== existsSync(join(ROOT, file))) {
    throw new Error(
      `.cartwright/profile.json and the filesystem disagree about ${label} ` +
        `(declared present=${declaredPresent}, ${file} on disk=${existsSync(join(ROOT, file))})`,
    );
  }
}
const APP = join(ROOT, "app");

/**
 * Routes that ARE locale-shadowed and are deliberately left that way. Listing
 * one here is a decision with a reason, not a mute button — the assertion below
 * requires the shadowed set to equal this set exactly, so removing a shadow
 * without removing its entry fails too.
 */
const KNOWN_SHADOWED: Record<string, string> = {
  "/manifest":
    "app/manifest/page.tsx renders hardcoded English webshop copy ('An online " +
    "store powered by AI', 'the catalog') with no locale context and no site " +
    "chrome. Un-shadowing it would publish an indexable shop-language page on " +
    "Teloz, which is website-mode (ecommerceEnabled:false) and Danish-default. " +
    "It needs locale-aware copy or a mode gate before it should answer; that is " +
    "a content decision, not a routing fix. (/manifest.webmanifest is a " +
    "different route and is reachable — it has a dot.)",
};

/** Files Next treats as a routable endpoint. `*.static.*` are scaffold variants, not routes. */
const ROUTE_FILES = new Set([
  "page.tsx",
  "page.ts",
  "page.jsx",
  "page.js",
  "page.mdx",
  "page.md",
  "route.ts",
  "route.tsx",
  "route.js",
  "route.jsx",
]);

/**
 * Next's file-convention metadata routes and the URL each is served at. These
 * are extension-less (`/icon`) or re-extensioned (`sitemap.ts` → `/sitemap.xml`),
 * so neither the folder name nor the file name is the path — which is exactly
 * why `/icon` hid from a folder-only walk.
 */
const METADATA_ROUTES: Record<string, string> = {
  "icon.tsx": "/icon",
  "icon.ts": "/icon",
  "apple-icon.tsx": "/apple-icon",
  "apple-icon.ts": "/apple-icon",
  "opengraph-image.tsx": "/opengraph-image",
  "opengraph-image.ts": "/opengraph-image",
  "twitter-image.tsx": "/twitter-image",
  "twitter-image.ts": "/twitter-image",
  "sitemap.ts": "/sitemap.xml",
  "robots.ts": "/robots.txt",
  "manifest.ts": "/manifest.webmanifest",
};

/**
 * Every route path Next serves from `app/`, excluding the `[locale]` subtree.
 * Route groups `(name)` contribute no URL segment; parallel slots `@name` are
 * skipped outright.
 */
function localelessRoutePaths(): string[] {
  const found: string[] = [];

  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (entry === "[locale]" && segments.length === 0) continue;
        if (entry.startsWith("_")) continue;
        // Route groups `(name)` and parallel slots `@name` contribute no URL
        // segment, but their CHILDREN are routable — `app/@modal/login/page.tsx`
        // serves `/login`. Descend without recording the folder name; skipping
        // the subtree outright would hide a locale-less route inside a slot.
        const isTransparent =
          (entry.startsWith("(") && entry.endsWith(")")) || entry.startsWith("@");
        walk(abs, isTransparent ? segments : [...segments, entry]);
      } else if (ROUTE_FILES.has(entry)) {
        found.push(`/${segments.join("/")}`);
      } else if (METADATA_ROUTES[entry]) {
        const prefix = segments.length ? `/${segments.join("/")}` : "";
        found.push(`${prefix}${METADATA_ROUTES[entry]}`);
      }
    }
  };

  walk(APP, []);
  return [...new Set(found)].sort();
}

/**
 * The middleware `matcher` from `proxy.ts`, read from the file rather than
 * copied, so a change to the exclusion list is reflected here instead of
 * quietly diverging.
 *
 * The pattern arrives as source text, so backslashes are in their escaped
 * JS-literal form (`.*\\..*`); handing that straight to `RegExp` builds
 * "backslash followed by any char" and the dot clause stops matching. That
 * mis-parse is not loud — in one direction it reports paths the matcher
 * excludes as "middleware runs", in the other it would report everything as
 * excluded and make the shadow assertion pass while testing nothing. Hence the
 * unescape, the two-way self-check, and the single-entry assertion: this reads
 * matcher[0], so a second entry would be modelled as if it did not exist.
 */
const MATCHER_RE = (() => {
  const source = readFileSync(join(ROOT, "proxy.ts"), "utf8");
  const block = source.match(/matcher:\s*\[([\s\S]*?)\]/)?.[1];
  if (!block) throw new Error("could not read the matcher array from proxy.ts");
  const entries = block.match(/['"`]/g)?.length ?? 0;
  if (entries !== 2) {
    throw new Error(
      `expected exactly one matcher entry, found ${entries / 2} — this test models only the first`,
    );
  }
  const raw = block.match(/['"`]([^'"`]+)['"`]/)?.[1];
  if (!raw) throw new Error("could not read the matcher pattern from proxy.ts");
  // Next matchers may use path-to-regexp syntax (`/api/:path*`). A native
  // RegExp reads `:path*` as literal text and silently stops matching the
  // routes it is meant to cover, with both self-checks below still passing.
  if (/:[A-Za-z_]/.test(raw)) {
    throw new Error(
      "matcher uses path-to-regexp parameter syntax; this test models it as a native RegExp",
    );
  }
  const re = new RegExp(`^${raw.replace(/\\\\/g, "\\")}$`);
  if (!re.test("/da/produkter")) {
    throw new Error("matcher parse is wrong: it excludes an ordinary storefront path");
  }
  if (re.test("/llms.txt")) {
    throw new Error("matcher parse is wrong: the dot-exclusion clause did not survive");
  }
  return re;
})();

/**
 * A dynamic segment stands in for a concrete one before the matcher sees it.
 *
 * The matcher excludes anything containing a dot, which is how Next keeps
 * middleware off files. A catch-all folder is written `[...rest]`, so the
 * recorded path carries literal dots and the matcher classifies the route as
 * excluded — the shadow assertion then passes while testing nothing. Verified:
 * adding `app/zzzcatch/[...rest]/page.tsx` left all 21 tests green, while a
 * plain `app/zzzprobe/page.tsx` correctly failed. Harmless today, since the
 * only such paths sit under `/api` and are exempt anyway, but it is a silent
 * miss in exactly the drift class this file exists to catch.
 */
function concretePath(pathname: string): string {
  return pathname
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, "seg")
    .replace(/\[\.\.\.[^\]]+\]/g, "seg")
    .replace(/\[[^\]]+\]/g, "seg");
}

/** True when the proxy actually runs for a path. */
function middlewareRuns(pathname: string): boolean {
  return MATCHER_RE.test(concretePath(pathname));
}

/**
 * The prefixes `proxy.ts` returns on before next-intl sees the request. The
 * `/api` and `/admin` shapes are asserted against the source below rather than
 * trusted, since hand-copying them here is the same drift this file exists to
 * prevent.
 */
function proxyReturnsEarly(pathname: string): boolean {
  // Modelled exactly as proxy.ts writes them — `/api` is a LOOSE startsWith
  // there, so it also covers `/api-docs`. Tightening it here to `/api/` would
  // make this test flag a working route as shadowed.
  const isApi = pathname.startsWith("/api");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return isApi || isAdmin || isLocaleExempt(pathname);
}

describe("locale-less routes are reachable", () => {
  it("finds the locale-less route paths it is supposed to be guarding", () => {
    const paths = localelessRoutePaths();
    // Guards the derivation itself: a walk that silently returned [] — a renamed
    // app dir, a changed route-file name — would make every assertion below pass
    // while checking nothing.
    expect(paths.length).toBeGreaterThan(10);
    // /oauth ships in full, is pruned in light. Assert whichever is true for
    // THIS profile rather than skipping, so the profile that KEEPS the route
    // still has to prove the walk finds it.
    //
    // Honest about the other branch: when the module is pruned the walk reads
    // app/, so it CANNOT emit /oauth/token and the negative assertion cannot
    // fail — it pins the shape, it does not catch a regression. The real
    // /oauth coverage in light is the `it.each([...])` block below, which drives
    // the exemption through the actual proxy in BOTH profiles.
    if (HAS_OAUTH_ROUTES) {
      expect(paths).toContain("/oauth/token");
    } else {
      expect(paths).not.toContain("/oauth/token");
    }
    expect(paths).toContain("/og");
    expect(paths).toContain("/manifest");
    // The metadata conventions the folder-only walk could not see.
    expect(paths).toContain("/icon");
    expect(paths).toContain("/sitemap.xml");
    expect(paths).toContain("/manifest.webmanifest");
    expect(paths.some((p) => p.startsWith("/[locale]"))).toBe(false);
  });

  it("shadows exactly the routes recorded as deliberate — no others", () => {
    const shadowed = localelessRoutePaths().filter(
      (p) => middlewareRuns(p) && !proxyReturnsEarly(p),
    );
    expect(shadowed.sort()).toEqual(Object.keys(KNOWN_SHADOWED).sort());
  });

  it("names the escape actually carrying each covered path", () => {
    const carriedByProxy = localelessRoutePaths().filter(
      (p) => middlewareRuns(p) && proxyReturnsEarly(p),
    );
    const carriedByMatcher = localelessRoutePaths().filter((p) => !middlewareRuns(p));

    // Dots and matcher names carry the feeds, documents and image conventions.
    expect(carriedByMatcher).toContain("/llms.txt");
    expect(carriedByMatcher).toContain("/blog/feed.xml");
    expect(carriedByMatcher).toContain("/opengraph-image");
    // The proxy branch carries these — and nothing else does, so this fails if
    // a prefix is dropped from lib/locale-exempt.ts.
    if (HAS_OAUTH_ROUTES) {
      expect(carriedByProxy).toContain("/oauth/authorize");
    } else {
      expect(carriedByProxy).not.toContain("/oauth/authorize");
    }
    expect(carriedByProxy).toContain("/og");
    expect(carriedByProxy).toContain("/icon");
  });

  it("only has app/ to derive from — a pages/ router would be uncovered", () => {
    // The walk starts at app/. proxy.ts's matcher applies to the whole app, so
    // a legacy pages/ route would be locale-shadowed the same way and invisible
    // here. Fail loudly if one appears rather than quietly under-reporting.
    expect(existsSync(join(ROOT, "pages"))).toBe(false);
  });

  it("keeps the /api and /admin branch shapes this file assumes", () => {
    // proxyReturnsEarly() hand-models these two; if their shape in proxy.ts
    // changes, the model is stale and the shadow assertion above silently
    // weakens. Pin the source rather than the behaviour.
    const source = readFileSync(join(ROOT, "proxy.ts"), "utf8");
    expect(source).toContain('pathname.startsWith("/api")');
    expect(source).toContain('pathname === "/admin" || pathname.startsWith("/admin/")');
  });
});

/**
 * `app/oauth` and `lib/ucp` are pruned by `create-cartwright --profile light`,
 * the DEFAULT scaffold. This file ships to every profile, so it must not
 * statically reference either: doing so red-gated the 2026-08-15 release with
 * TS2307 before a single assertion ran. Presence is read from the scaffold's own
 * prune record (cross-checked against disk), NOT inferred from disk.
 *
 * Honest scope: where the module IS pruned this block is skipped outright, so it
 * asserts nothing there. The routing coverage that survives in every profile is
 * the `it.each([...])` block further down, which drives /oauth through the real
 * proxy whether or not the route modules ship.
 */
describe.skipIf(!HAS_UCP_OAUTH)("published OAuth endpoints resolve to reachable paths", () => {
  it("every endpoint in the RFC 8414 document escapes the locale rewrite", async () => {
    const issuer = "https://shop.example";
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- pruned in the light profile; guarded by HAS_UCP_OAUTH above
    const { buildAuthorizationServerMetadata } = await import("@/lib/ucp/oauth");
    const meta = buildAuthorizationServerMetadata(issuer);
    const endpoints = [
      meta.authorization_endpoint,
      meta.token_endpoint,
      meta.revocation_endpoint,
      meta.registration_endpoint,
    ];
    expect(endpoints).toHaveLength(4);
    for (const url of endpoints) {
      const { pathname } = new URL(url);
      // Discovery hands these URLs to a client verbatim. If one is not exempt,
      // the client follows a 307 into a locale prefix and gets a 404 — which is
      // what happened to all four before lib/locale-exempt.ts existed.
      expect(isLocaleExempt(pathname), `${pathname} is locale-shadowed`).toBe(true);
      // And they must be PROTOCOL-exempt specifically, so a merchant redirect
      // cannot retarget them off-origin with the client's query attached.
      expect(isProtocolExempt(pathname), `${pathname} is redirect-eligible`).toBe(true);
    }
  });
});

describe("proxy.ts hands the exempt prefixes past the locale rewrite", () => {
  /**
   * The assertions above pin the LISTS. These pin the WIRING: delete a branch
   * from proxy.ts and every other test in this file still passes while the bug
   * is fully back. `intlSpy` is the witness — reaching it is exactly what
   * produced the 307 into a locale prefix.
   */
  const req = (pathname: string) =>
    ({
      nextUrl: Object.assign(new URL(`https://shop.example${pathname}`), { search: "" }),
      headers: new Headers(),
      auth: null,
    }) as never;

  let proxy: (req: never) => Promise<Response>;

  beforeEach(async () => {
    intlSpy.mockClear();
    redirectHit = null;
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Through `unknown`: the real signature is next-auth's AppRouteHandlerFn,
    // whose second (context) argument the proxy never reads.
    proxy = (await import("@/proxy")).default as unknown as typeof proxy;
  });

  it.each(["/oauth/token", "/oauth/authorize", "/og", "/icon"])(
    "%s never reaches the locale rewrite",
    async (pathname) => {
      const res = await proxy(req(pathname));
      expect(intlSpy).not.toHaveBeenCalled();
      // NextResponse.next() — the request continues to the route as written.
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    },
  );

  it.each(["/", "/produkter", "/da/produkter", "/manifesto"])(
    "%s still goes through the locale rewrite",
    async (pathname) => {
      await proxy(req(pathname));
      expect(intlSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("a merchant redirect cannot retarget an OAuth protocol endpoint", async () => {
    redirectHit = { to: "https://evil.example/x", status: 301 };
    // .well-known/oauth-authorization-server publishes this URL verbatim, and
    // the proxy appends the caller's query to a redirect destination — so a
    // redirect firing here would forward client_id/state/redirect_uri/
    // code_challenge to another origin. The branch above the lookup is what
    // prevents it; /api and /admin are excluded from the map for the same
    // reason.
    const res = await proxy(req("/oauth/authorize"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes /oauth through its own rate-limit bucket, not /api's", async () => {
    // /oauth/register is unauthenticated RFC 7591 registration that writes a
    // row, so it gets the sliding window /api has. Separate bucket key: sharing
    // /api's would let ordinary storefront API traffic exhaust the budget an
    // OAuth client needs, and vice versa.
    //
    // This asserts the identifier the limiter is actually called with, not the
    // text of proxy.ts. The source-matching version passed even when the helper
    // body was mutated to hardcode `global_api_ratelimit_${ip}` — merging the
    // two windows, which is the precise failure the split exists to prevent.
    // The suite otherwise runs with no UPSTASH_* env, so the limiter is null
    // and nothing is observable; here it is stubbed into existence.
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");

    const limit = vi.fn(async () => ({ success: true }));
    vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({}) } }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(
        class {
          limit = limit;
        },
        { slidingWindow: () => ({}) },
      ),
    }));

    try {
      const limited = (await import("@/proxy")).default as unknown as typeof proxy;

      await limited(req("/oauth/register"));
      await limited(req("/api/products"));

      const keys = limit.mock.calls.map((c) => String((c as unknown[])[0]));
      expect(keys).toHaveLength(2);
      expect(keys[0]).toMatch(/^oauth_ratelimit_/);
      expect(keys[1]).toMatch(/^global_api_ratelimit_/);
      // The point of the split, stated as an assertion rather than a comment.
      expect(keys[0]).not.toBe(keys[1]);
    } finally {
      vi.doUnmock("@upstash/ratelimit");
      vi.doUnmock("@upstash/redis");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("a merchant redirect still works on the asset routes", async () => {
    // The other half of the split: /icon and /og stay redirect-eligible, which
    // is their behaviour today. If this ever goes green-by-accident because the
    // asset branch drifted above the lookup, the retarget test above stops
    // meaning anything.
    redirectHit = { to: "/somewhere-else", status: 301 };
    const res = await proxy(req("/icon"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toContain("/somewhere-else");
  });
});

describe("isLocaleExempt", () => {
  it("matches a prefix exactly or on a path boundary", () => {
    for (const prefix of LOCALE_EXEMPT_PREFIXES) {
      expect(isLocaleExempt(prefix)).toBe(true);
      expect(isLocaleExempt(`${prefix}/child`)).toBe(true);
    }
  });

  it("does not swallow sibling names that merely share the prefix", () => {
    // A plain startsWith would claim all of these.
    expect(isLocaleExempt("/manifesto")).toBe(false);
    expect(isLocaleExempt("/ogle")).toBe(false);
    expect(isLocaleExempt("/iconography")).toBe(false);
    expect(isLocaleExempt("/oauthorize")).toBe(false);
  });

  it("does not match an already-localised path", () => {
    // /da/oauth/token has no route; it must keep falling through so it 404s
    // rather than being handed back to the root handler under a locale.
    expect(isLocaleExempt("/da/oauth/token")).toBe(false);
    expect(isLocaleExempt("/en/og")).toBe(false);
  });

  it("splits protocol from asset exemptions without overlap", () => {
    // The split is what keeps /oauth out of the merchant-redirect map while
    // leaving /icon and /og in it. A prefix in both lists would make the two
    // proxy branches ambiguous.
    for (const p of PROTOCOL_EXEMPT_PREFIXES) {
      expect(isProtocolExempt(p)).toBe(true);
      expect(isAssetExempt(p)).toBe(false);
    }
    for (const a of ASSET_EXEMPT_PREFIXES) {
      expect(isAssetExempt(a)).toBe(true);
      expect(isProtocolExempt(a)).toBe(false);
    }
  });
});
