import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moat regression — `OPTIONS` on every flag-gated agent-facing surface.
 *
 * Next installs its own `OPTIONS` handler for any route module that does not
 * export one, and that substitute never reaches the route's gate. Measured on
 * a website-mode production build of `main`, every route in this file replied
 * `404` (or `405`) to its real verbs while answering
 * `204 Allow: …` to `OPTIONS` — and an absent path answers `404` to `OPTIONS`
 * too, so both the status and the header were tells.
 *
 * `/api/mcp` closed this on the `mcpPublic` surface (#429, on `main`). The
 * `mcpPublic` REST siblings — `/api/v1/tools*` and `/.well-known/mcp.json` —
 * are covered by PR #431, which is still OPEN at the time of writing: until it
 * lands they leak, and `app/api/mcp/route.ts` says so. Everything else is here.
 *
 * The list below is derived by grepping for the four gates
 * (`acpDisabledResponse` / `brand.acp.enabled`, `ucpIdentityLinkingEnabled`,
 * `a2aDisabledResponse`, and the `ecommerceEnabled`/`merchantFeed` conjunct on
 * the two product feeds) rather than by memory. That method has now been wrong
 * twice, in the same direction: the first cut covered seven of eleven and two
 * reviewers caught the `/oauth/*` + `/api/ucp/orders` endpoints; the second
 * pass named three leaking a2a-family routes and missed `/api/agent-card`,
 * which is the third `a2aDisabledResponse` caller. Grep the gate helpers, not
 * the prose, when adding to this file.
 *
 * The invariant per route, both directions:
 *   gate SHUT → `OPTIONS` returns exactly what that route's own verbs return
 *               (same status, same body) — never a `204`, never an `Allow`.
 *   gate OPEN → `204` + an `Allow` naming precisely the verbs the module
 *               serves, and NOTHING else (no CORS, no cache directive).
 *
 * The expected `Allow` value is DERIVED from each module's own exports (plus
 * `HEAD`, which Next fills in from `GET`), so a later-added verb cannot leave
 * a hand-written string stale — it fails here instead.
 *
 * One caveat found while measuring, and NOT fixed here because it is a routing
 * bug of its own: `/oauth/token`, `/oauth/register` and `/oauth/revoke` never
 * reach their route module at all on a default build. They sit outside `/api`
 * and contain no dot, so `proxy.ts`'s matcher hands them to next-intl, which
 * answers `307 → /da/oauth/…` — a path with no page — for EVERY verb,
 * `POST` included. Their gate is therefore correct and currently unreachable;
 * this file pins the module contract so the fix to the routing does not have
 * to re-derive it. `/api/ucp/orders` is unaffected (measured: `OPTIONS` → 404).
 */

const mocks = vi.hoisted(() => ({
  acp: { enabled: true } as { enabled: boolean },
  // `a2aDisabledResponse()` reads `brand.features.a2a` off the compile-time
  // config, so the mock needs a `features` object or the a2a routes throw on
  // import rather than answering their gate.
  features: { a2a: false } as { a2a: boolean },
  getBrand: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({
  brand: {
    acp: mocks.acp,
    features: mocks.features,
    // Read by /feed/google.xml's GET only; present so the module's imports
    // resolve without dragging the real 1000-line brand config in.
    storeName: "Test Shop",
    metadata: { description: "Test" },
  },
}));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));

// Downstream work the gate must short-circuit before reaching. Mocked as
// spies so "the gate ran first" is assertable, and so the route modules do not
// drag Prisma/Stripe into a unit test.
const downstream = vi.hoisted(() => ({
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
  updateSession: vi.fn(),
  cancelSession: vi.fn(),
  completeAcpSession: vi.fn(),
  getCatalogFeed: vi.fn(),
  buildAcpFeed: vi.fn(() => ""),
  buildAuthorizationServerMetadata: vi.fn(() => ({})),
  buildProtectedResourceMetadata: vi.fn(() => ({})),
  getClient: vi.fn(),
  issueTokenPair: vi.fn(),
  redeemAuthCode: vi.fn(),
  refreshTokenGrant: vi.fn(),
  registerPublicClient: vi.fn(),
  revokeToken: vi.fn(),
  requireUcpIdentity: vi.fn(),
  orderFindMany: vi.fn(),
  buildGoogleMerchantXml: vi.fn(() => ""),
  authenticateApiKey: vi.fn(),
  guardianCheck: vi.fn(),
  decideNegotiation: vi.fn(),
  agentCardFindFirst: vi.fn(),
  escrowFindUnique: vi.fn(),
  poTEProofCreate: vi.fn(),
}));

vi.mock("@/lib/acp", () => ({
  AcpError: class AcpError extends Error {},
  createSession: downstream.createSession,
  retrieveSession: downstream.retrieveSession,
  updateSession: downstream.updateSession,
  cancelSession: downstream.cancelSession,
  createSessionInputSchema: { safeParse: () => ({ success: true, data: {} }) },
  updateSessionInputSchema: { safeParse: () => ({ success: true, data: {} }) },
}));
vi.mock("@/lib/acp/complete", () => ({
  completeAcpSession: downstream.completeAcpSession,
  completeSessionInputSchema: { safeParse: () => ({ success: true, data: {} }) },
  isAcpCompletionEnabled: () => false,
}));
vi.mock("@/lib/feeds/catalog-feed", () => ({
  getCatalogFeed: downstream.getCatalogFeed,
}));
vi.mock("@/lib/feeds/acp-feed", () => ({ buildAcpFeed: downstream.buildAcpFeed }));
vi.mock("@/lib/ucp/oauth", () => ({
  OAuthError: class OAuthError extends Error {},
  buildAuthorizationServerMetadata: downstream.buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata: downstream.buildProtectedResourceMetadata,
  getClient: downstream.getClient,
  issueTokenPair: downstream.issueTokenPair,
  redeemAuthCode: downstream.redeemAuthCode,
  refreshTokenGrant: downstream.refreshTokenGrant,
  registerPublicClient: downstream.registerPublicClient,
  revokeToken: downstream.revokeToken,
}));
vi.mock("@/lib/ucp/identity", () => ({
  requireUcpIdentity: downstream.requireUcpIdentity,
}));
vi.mock("@/lib/feeds/google-merchant", () => ({
  buildGoogleMerchantXml: downstream.buildGoogleMerchantXml,
}));
vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: downstream.authenticateApiKey,
}));
vi.mock("@/lib/guardian/middleware", () => ({
  guardianCheck: downstream.guardianCheck,
}));
vi.mock("@/lib/negotiation/anchor-resume", () => ({
  decideNegotiation: downstream.decideNegotiation,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findMany: downstream.orderFindMany },
    agentCard: { findFirst: downstream.agentCardFindFirst },
    escrowTransaction: { findUnique: downstream.escrowFindUnique },
    poTEProof: { create: downstream.poTEProofCreate },
  },
}));

type RouteModule = Record<string, unknown>;

const HTTP_VERBS = [
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
] as const;

/**
 * What `Allow` must say: every verb the module exports, plus `HEAD` when it
 * exports `GET` without one (Next implements that from `GET`, so the route
 * really does serve it — through the same gate). Sorted, comma-space joined:
 * the shape the framework's own substitute produced, so a caller that already
 * spoke to these routes sees no change.
 */
function expectedAllow(mod: RouteModule): string {
  const verbs = HTTP_VERBS.filter((verb) => typeof mod[verb] === "function");
  const withHead =
    verbs.includes("GET") && !verbs.includes("HEAD")
      ? [...verbs, "HEAD" as const]
      : verbs;
  return [...withHead].sort().join(", ");
}

/** Every gated route, with the gate it reads and the 404 it answers when shut. */
const ROUTES = [
  {
    path: "/api/acp/feed",
    src: "app/api/acp/feed/route.ts",
    load: () => import("@/app/api/acp/feed/route"),
    gate: "ecommerceEnabled" as const,
    shut: { status: 404, body: "Not found" },
  },
  {
    path: "/.well-known/oauth-authorization-server",
    src: "app/.well-known/oauth-authorization-server/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/.well-known/oauth-authorization-server/route"),
    gate: "ucpIdentityLinking" as const,
    shut: { status: 404, body: "Not found" },
  },
  {
    path: "/.well-known/oauth-protected-resource",
    src: "app/.well-known/oauth-protected-resource/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/.well-known/oauth-protected-resource/route"),
    gate: "ucpIdentityLinking" as const,
    shut: { status: 404, body: "Not found" },
  },
  {
    path: "/api/acp/v1/checkout_sessions",
    src: "app/api/acp/v1/checkout_sessions/route.ts",
    load: () => import("@/app/api/acp/v1/checkout_sessions/route"),
    gate: "acp" as const,
    shut: { status: 404, body: '{"error":"not_found"}' },
  },
  {
    path: "/api/acp/v1/checkout_sessions/[id]",
    src: "app/api/acp/v1/checkout_sessions/[id]/route.ts",
    load: () => import("@/app/api/acp/v1/checkout_sessions/[id]/route"),
    gate: "acp" as const,
    shut: { status: 404, body: '{"error":"not_found"}' },
  },
  {
    path: "/api/acp/v1/checkout_sessions/[id]/cancel",
    src: "app/api/acp/v1/checkout_sessions/[id]/cancel/route.ts",
    load: () => import("@/app/api/acp/v1/checkout_sessions/[id]/cancel/route"),
    gate: "acp" as const,
    shut: { status: 404, body: '{"error":"not_found"}' },
  },
  {
    path: "/api/acp/v1/checkout_sessions/[id]/complete",
    src: "app/api/acp/v1/checkout_sessions/[id]/complete/route.ts",
    load: () => import("@/app/api/acp/v1/checkout_sessions/[id]/complete/route"),
    gate: "acp" as const,
    shut: { status: 404, body: '{"error":"not_found"}' },
  },
  {
    path: "/oauth/token",
    src: "app/oauth/token/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/oauth/token/route"),
    gate: "ucpIdentityLinking" as const,
    shut: { status: 404, body: "Not found" },
  },
  {
    path: "/oauth/register",
    src: "app/oauth/register/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/oauth/register/route"),
    gate: "ucpIdentityLinking" as const,
    shut: { status: 404, body: "Not found" },
  },
  {
    path: "/oauth/revoke",
    src: "app/oauth/revoke/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/oauth/revoke/route"),
    gate: "ucpIdentityLinking" as const,
    shut: { status: 404, body: "Not found" },
  },
  {
    path: "/api/ucp/orders",
    src: "app/api/ucp/orders/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/api/ucp/orders/route"),
    gate: "ucpIdentityLinking" as const,
    shut: { status: 404, body: "Not found" },
  },
  {
    path: "/api/negotiate",
    src: "app/api/negotiate/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/api/negotiate/route"),
    gate: "a2a" as const,
    shut: { status: 404, body: '{"error":"not_found"}' },
  },
  {
    path: "/api/escrow/verify",
    src: "app/api/escrow/verify/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/api/escrow/verify/route"),
    gate: "a2a" as const,
    shut: { status: 404, body: '{"error":"not_found"}' },
  },
  {
    path: "/api/agent-card",
    src: "app/api/agent-card/route.ts",
    // Pruned in the light profile — the module is absent there, so the
    // specifier cannot resolve at typecheck time. `src` is what decides at
    // RUNTIME whether this route is exercised; see PRESENT below.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- profile-dependent module
    load: () => import("@/app/api/agent-card/route"),
    gate: "a2a" as const,
    shut: { status: 404, body: '{"error":"not_found"}' },
  },
  {
    path: "/feed/google.xml",
    src: "app/feed/google.xml/route.ts",
    load: () => import("@/app/feed/google.xml/route"),
    gate: "merchantFeed" as const,
    shut: { status: 404, body: "Not found" },
  },
];

/**
 * Which of those routes exist in THIS profile.
 *
 * The engine ships every route above, but `create-cartwright --profile light`
 * — the DEFAULT scaffold — prunes the UCP/OAuth and a2a modules. A shipped test
 * that statically imports a pruned module cannot typecheck (11x TS2307 red-gated
 * the 2026-08-15 release), and one that merely skips at runtime still cannot.
 * So the specifier carries a `@ts-ignore` and presence is decided here, from
 * disk, at runtime.
 *
 * Filtering is the kind of move that silently empties a suite, so the floor
 * below asserts the always-present core is still exercised. Anything absent is
 * NAMED in the console, because a skip that cannot be seen reads as a pass.
 */
// Anchored on the file, not the cwd, so a run from a subdirectory cannot
// silently empty the route list (its sibling locale-exempt test does the same).
const ROOT = join(__dirname, "..", "..");

/**
 * What this tree DECLARES it pruned — the authority for what may be absent.
 *
 * Inferring the profile from the disk is what made the first cut of this guard
 * useless: filtering by `existsSync` and then asserting `existsSync` over the
 * survivors is `true === true`, so a typo in a `src` moved a route into ABSENT
 * and retired its coverage in silence. A scaffold records its own prune list, so
 * read that and let the disk be the CROSS-CHECK rather than the source.
 *
 * Two writers, two field names — `profile-light.ts` writes `excludedPaths`,
 * `materializer.ts` (schemaVersion 2) writes `removedPaths`. The engine repo has
 * no marker at all, which correctly means "nothing pruned": every route must be
 * present here, so a typo fails immediately in our own CI.
 */
function declaredPrunedPaths(): string[] {
  const marker = join(ROOT, ".cartwright", "profile.json");
  if (!existsSync(marker)) return [];
  try {
    const m = JSON.parse(readFileSync(marker, "utf8")) as {
      excludedPaths?: string[];
      removedPaths?: string[];
    };
    // Explicit selection, not `??`: a marker carrying BOTH fields with an
    // empty `excludedPaths` would otherwise mask a populated `removedPaths`.
    const fields = [m.excludedPaths, m.removedPaths].filter(Array.isArray);
    return fields.flat() as string[];
  } catch {
    // A marker we cannot read is not permission to assume nothing was pruned.
    throw new Error(
      ".cartwright/profile.json exists but could not be parsed — refusing to " +
        "guess which routes may be absent.",
    );
  }
}

const PRUNED_PATHS = declaredPrunedPaths();
const isDeclaredPruned = (src: string) =>
  PRUNED_PATHS.some((p) => src === p || src.startsWith(p.endsWith("/") ? p : `${p}/`));

const PRESENT = ROUTES.filter((r) => existsSync(join(ROOT, r.src)));
const ABSENT = ROUTES.filter((r) => !existsSync(join(ROOT, r.src)));
if (ABSENT.length > 0) {
  // stderr, NOT console.info: vitest's DEFAULT reporter — the one
  // `pnpm test` and the release scaffold gate actually run — buffers stdout and
  // flushes it only for FAILING files, so a console.info here is visible in
  // exactly the runs where it does not matter. Measured on a green light run:
  // 0 occurrences under the default reporter, 1 under --reporter=verbose.
  process.stderr.write(
    `[agentic-options-gate] ${ABSENT.length} route(s) pruned in this profile, not exercised: ` +
      ABSENT.map((r) => r.path).join(", ") +
      "\n",
  );
}

/**
 * The subset the SHIPPING profiles (light, full) keep — ACP + the merchant feed.
 * Not "every profile": `scaffold/manifest.json` already declares `managed-site`
 * (aliased `light`), which excludes `acp` and `feeds` and would take all six
 * with it. That profile is not in PROFILES yet; when it ships, this floor and
 * the two hardcoded imports below must move behind isDeclaredPruned too.
 */
const CORE_PATHS = [
  "/api/acp/feed",
  "/api/acp/v1/checkout_sessions",
  "/api/acp/v1/checkout_sessions/[id]",
  "/api/acp/v1/checkout_sessions/[id]/cancel",
  "/api/acp/v1/checkout_sessions/[id]/complete",
  "/feed/google.xml",
];

/**
 * Every path this table is REQUIRED to carry. Hardcoded on purpose: both sides
 * of the "exercises every route" assertion derive from ROUTES, so deleting an
 * entry outright shrank both and stayed green (proved by mutation: 58 -> 56
 * tests passing, no failure).
 */
const ALL_ROUTE_PATHS = [
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/api/acp/feed",
  "/api/acp/v1/checkout_sessions",
  "/api/acp/v1/checkout_sessions/[id]",
  "/api/acp/v1/checkout_sessions/[id]/cancel",
  "/api/acp/v1/checkout_sessions/[id]/complete",
  "/api/agent-card",
  "/api/escrow/verify",
  "/api/negotiate",
  "/api/ucp/orders",
  "/feed/google.xml",
  "/oauth/register",
  "/oauth/revoke",
  "/oauth/token",
];

describe("the route list this file derives from", () => {
  it("still carries every route it is supposed to cover", () => {
    // Guards the TABLE, which nothing else does: ALL_ROUTE_PATHS is independent
    // of ROUTES, so removing an entry is red even when the profile prunes it.
    expect(ROUTES.map((r) => r.path).sort()).toEqual([...ALL_ROUTE_PATHS].sort());
  });

  it("points each load() at the module its src names", () => {
    // `src` is proven against disk+marker above, but nothing tied `load` to it —
    // and @ts-ignore blinds tsc AND eslint to the specifier. A mis-paired
    // specifier (pointing /oauth/token at the real revoke route) hid a genuine
    // gate regression with 58/58 green. Read this file's own source and require
    // the two strings to agree; the repo's convention when a property cannot be
    // observed at runtime is to pin the source (see the /api and /admin branch
    // shape test in locale-exempt-routes).
    const source = readFileSync(join(__dirname, "agentic-options-gate.test.ts"), "utf8");
    // Parse per ENTRY rather than with one big regex: the pruned entries carry a
    // comment block and an eslint directive between `src` and `load`, which a
    // single pattern silently under-matched (12 of 15) — and an under-match here
    // would be exactly the vacuous pass this test exists to prevent.
    const body = source.slice(
      source.indexOf("const ROUTES = ["),
      source.indexOf("\n];", source.indexOf("const ROUTES = [")),
    );
    const entries = body
      .split(/\n  \{/)
      .slice(1)
      .map((chunk) => ({
        path: /path:\s*"([^"]+)"/.exec(chunk)?.[1],
        src: /src:\s*"([^"]+)"/.exec(chunk)?.[1],
        specifier: /load:\s*\(\)\s*=>\s*import\("([^"]+)"\)/.exec(chunk)?.[1],
      }));

    // The parse must see all 15, each with all three fields.
    expect(entries).toHaveLength(ALL_ROUTE_PATHS.length);
    for (const e of entries) {
      expect(e.path).toBeTypeOf("string");
      expect(e.src).toBeTypeOf("string");
      expect(e.specifier).toBe(`@/${(e.src as string).replace(/\.ts$/, "")}`);
    }
  });

  it("still exercises every route the light profile keeps", () => {
    // Without this, pruning one path too many would quietly delete coverage of
    // the ACP surface and the Google merchant feed from the DEFAULT profile.
    const present = PRESENT.map((r) => r.path);
    for (const path of CORE_PATHS) expect(present).toContain(path);
  });

  it("only lets a route be absent when this tree DECLARES it pruned", () => {
    // The load-bearing guard. Disk and marker must agree, so:
    //   - a typo in any `src` makes a route absent that nothing pruned  → red
    //   - a real prune is expected and stays green
    //   - the engine repo declares nothing pruned, so all 15 must be present
    // Replaces a tautology that filtered on existsSync and then asserted it.
    const undeclared = ABSENT.filter((r) => !isDeclaredPruned(r.src)).map((r) => r.path);
    expect(undeclared).toEqual([]);
  });

  it("exercises every route this tree does NOT declare pruned", () => {
    // The other direction: a route the marker keeps must actually be loaded,
    // so a prune list that grows without the test list noticing goes red.
    const expected = ROUTES.filter((r) => !isDeclaredPruned(r.src)).map((r) => r.path);
    expect(PRESENT.map((r) => r.path).sort()).toEqual(expected.sort());
  });
});

type Gate =
  | "a2a"
  | "acp"
  | "ecommerceEnabled"
  | "merchantFeed"
  | "ucpIdentityLinking";

function setGate(gate: Gate, open: boolean) {
  mocks.acp.enabled = gate === "acp" ? open : false;
  mocks.features.a2a = gate === "a2a" ? open : false;
  mocks.getBrand.mockResolvedValue({
    // `/feed/google.xml` gates on `ecommerceEnabled && merchantFeed`. When
    // `merchantFeed` is the gate under test, `ecommerceEnabled` stays true in
    // BOTH directions, so the shut case exercises the flag itself rather than
    // passing for the unrelated reason that the shop is in website mode.
    ecommerceEnabled:
      gate === "ecommerceEnabled" ? open : gate === "merchantFeed",
    features: {
      merchantFeed: gate === "merchantFeed" ? open : false,
      ucpIdentityLinking: gate === "ucpIdentityLinking" ? open : false,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  downstream.buildAcpFeed.mockReturnValue("");
  downstream.buildAuthorizationServerMetadata.mockReturnValue({});
  downstream.buildProtectedResourceMetadata.mockReturnValue({});
});

describe.each(PRESENT)("OPTIONS $path", (route) => {
  it("gate SHUT → the route's own 404, no Allow header, no downstream work", async () => {
    setGate(route.gate, false);
    const mod = (await route.load()) as RouteModule;
    const handler = mod.OPTIONS as () => Response | Promise<Response>;

    expect(typeof handler).toBe("function"); // the export itself is the fix
    const res = await handler();

    expect(res.status).toBe(route.shut.status);
    expect(await res.text()).toBe(route.shut.body);
    expect(res.headers.get("allow")).toBeNull();
    // A shut gate answers before any work: nothing downstream may run.
    for (const spy of Object.values(downstream)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("gate OPEN → 204 + exactly the verbs this module serves, nothing else", async () => {
    setGate(route.gate, true);
    const mod = (await route.load()) as RouteModule;
    const handler = mod.OPTIONS as () => Response | Promise<Response>;
    const res = await handler();

    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe(expectedAllow(mod));
    expect(await res.text()).toBe("");

    // Not a CORS preflight, and not a cache-control statement: this reply is
    // the framework substitute's shape, only gated.
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-methods")).toBeNull();
    expect(res.headers.get("access-control-allow-headers")).toBeNull();
    expect(res.headers.get("vary")).toBeNull();
  });
});

describe("the derived Allow values", () => {
  it("name the verb sets measured on a production build", async () => {
    const allows: Record<string, string> = {};
    for (const route of PRESENT) {
      allows[route.path] = expectedAllow((await route.load()) as RouteModule);
    }

    // Measured against `pnpm start` on this branch's build — the same strings
    // Next's own substitute produced before the gate was applied. Compared
    // against the expected map NARROWED to the routes this profile ships, so a
    // pruned route does not read as a mismatch while every shipped verb set
    // stays pinned exactly.
    const EXPECTED: Record<string, string> = {
      "/api/acp/feed": "GET, HEAD, OPTIONS",
      "/.well-known/oauth-authorization-server": "GET, HEAD, OPTIONS",
      "/.well-known/oauth-protected-resource": "GET, HEAD, OPTIONS",
      "/api/acp/v1/checkout_sessions": "OPTIONS, POST",
      "/api/acp/v1/checkout_sessions/[id]": "GET, HEAD, OPTIONS, POST",
      "/api/acp/v1/checkout_sessions/[id]/cancel": "OPTIONS, POST",
      "/api/acp/v1/checkout_sessions/[id]/complete": "OPTIONS, POST",
      "/oauth/token": "OPTIONS, POST",
      "/oauth/register": "OPTIONS, POST",
      "/oauth/revoke": "OPTIONS, POST",
      "/api/ucp/orders": "GET, HEAD, OPTIONS",
      "/api/negotiate": "OPTIONS, POST",
      "/api/escrow/verify": "OPTIONS, POST",
      "/api/agent-card": "GET, HEAD, OPTIONS",
      "/feed/google.xml": "GET, HEAD, OPTIONS",
    };
    const expectedForProfile = Object.fromEntries(
      PRESENT.map((r) => [r.path, EXPECTED[r.path]]),
    );
    // Every present route must be named in EXPECTED — an unnamed one would
    // otherwise compare undefined-to-undefined and assert nothing.
    for (const route of PRESENT) expect(EXPECTED[route.path]).toBeTypeOf("string");
    expect(allows).toEqual(expectedForProfile);
  });
});

describe("/feed/google.xml — the one route whose gate is a conjunct", () => {
  it("OPTIONS shuts on either half, so neither flag alone can open it", async () => {
    const mod = (await import("@/app/feed/google.xml/route")) as RouteModule;
    const options = mod.OPTIONS as () => Promise<Response>;

    // Webshop on, feed flag off.
    mocks.getBrand.mockResolvedValue({
      ecommerceEnabled: true,
      features: { merchantFeed: false },
    });
    const flagOff = await options();
    expect(flagOff.status).toBe(404);
    expect(flagOff.headers.get("allow")).toBeNull();

    // Feed flag on, website mode — the case the framework substitute used to
    // advertise a product feed on a site that sells nothing.
    mocks.getBrand.mockResolvedValue({
      ecommerceEnabled: false,
      features: { merchantFeed: true },
    });
    const websiteMode = await options();
    expect(websiteMode.status).toBe(404);
    expect(websiteMode.headers.get("allow")).toBeNull();

    expect(downstream.buildGoogleMerchantXml).not.toHaveBeenCalled();
  });
});

describe.skipIf(isDeclaredPruned("app/api/ucp/orders/route.ts"))(
  "/api/ucp/orders — the one route whose GET gate is compound",
  () => {
  it("OPTIONS reads the feature flag only, never the bearer token", async () => {
    // GET runs requireUcpIdentity() on top of the flag. OPTIONS deliberately
    // does not: the method list belongs to the resource, not to a caller's
    // token. Flag on + no Authorization header ⇒ GET would 401, OPTIONS is 204.
    setGate("ucpIdentityLinking", true);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
    // @ts-ignore -- pruned in the light profile; this whole describe is
    // skipIf-guarded on the module being present, but the specifier still
    // has to typecheck in a scaffold that does not ship it.
    const mod = (await import("@/app/api/ucp/orders/route")) as RouteModule;
    const res = await (mod.OPTIONS as () => Promise<Response>)();

    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(downstream.requireUcpIdentity).not.toHaveBeenCalled();
    expect(downstream.orderFindMany).not.toHaveBeenCalled();
    });
  },
);

describe("the completion route's env flag", () => {
  it("does not gate OPTIONS — ACP off is 404, ACP on is 204 even with payments off", async () => {
    // isAcpCompletionEnabled() is mocked false throughout this file: POST
    // answers 501 there (mounted, not enabled), so OPTIONS must still say the
    // route exists rather than borrowing a second, stricter condition.
    setGate("acp", true);
    const mod = (await import(
      "@/app/api/acp/v1/checkout_sessions/[id]/complete/route"
    )) as RouteModule;
    const res = await (mod.OPTIONS as () => Response)();
    expect(res.status).toBe(204);
    expect(downstream.completeAcpSession).not.toHaveBeenCalled();
  });
});
