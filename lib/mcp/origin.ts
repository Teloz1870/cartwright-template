import "server-only";

import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";

/**
 * DNS-rebinding protection for the MCP endpoint (`/api/mcp`).
 *
 * The Streamable HTTP transport specification requires an MCP server to validate
 * the `Origin` header on all incoming connections, and to answer `403 Forbidden`
 * when the header is present and not allowed. The SDK transport can do this
 * itself (`enableDnsRebindingProtection` + `allowedOrigins`), but that option is
 * marked deprecated in favour of validating outside the transport — and the
 * transport never sees this route's unauthenticated `GET` intro branch anyway,
 * so the check belongs here, in front of both branches.
 *
 * Why this is close to invisible in practice: `/api/mcp` sends no
 * `Access-Control-Allow-*` headers, so no cross-origin browser *page* can read
 * its response in the first place, and the ordinary clients (Claude Desktop,
 * curl, server-to-server) send no `Origin` header at all — an absent header is
 * allowed, since the specification rejects only a header that is *present and
 * invalid*.
 *
 * It is not literally nothing, though. A caller exempt from CORS that still
 * attaches an `Origin` — a browser extension with host permissions sends
 * `Origin: chrome-extension://…` — is rejected by the ordinary allowlist,
 * because such origins are opaque and a bare opaque entry is dropped on
 * purpose (one stored `"null"` would match every sandboxed document and every
 * local file at once). An operator who really has such a client names it
 * explicitly instead, with the `opaque:` prefix described on
 * `mcpAllowedOrigins` — a form that can only ever admit the one
 * `scheme://host` it spells out.
 *
 * The attack this closes: a page served from an attacker's origin whose hostname
 * re-resolves to the shop's address. Such a request carries the attacker's
 * `Origin` while its `Host` header matches the target — which is precisely why
 * the allowlist is anchored to configured values (`brand.url`,
 * `MCP_ALLOWED_ORIGINS`) and never to the request's own `Host`.
 */

/** Hostnames that only ever address the machine the server runs on. */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reduce a URL-ish string to its canonical origin (scheme + host + port,
 * lower-cased by the URL parser). Returns `null` for anything that is not a
 * usable origin: unparseable values, and values whose origin serializes to the
 * literal string "null" — `file:` URLs and other opaque origins. (Not every
 * exotic scheme lands there: `blob:https://host/…` inherits `https://host`. No
 * browser emits such a value as `Origin`; the allowlist path is why this
 * normalizes rather than comparing raw strings.)
 */
function normalizeOrigin(value: string): string | null {
  try {
    const { origin } = new URL(value.trim());
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/** The prefix that opts one allowlist entry into the opaque form. */
const OPAQUE_PREFIX = "opaque:";

/**
 * Reduce an *opaque*-origin URL to the canonical `scheme://host` a browser
 * would send for it. Returns `null` for everything else, and the two `null`
 * cases are the whole point of the function:
 *
 * - **An ordinary origin** (`https://admin.example`) → `null`. It belongs in
 *   the unprefixed list; accepting it here would give the same origin two
 *   spellings and no extra reach.
 * - **A hostless opaque URL** (`file:///Users/x/page.html`, `data:…`, and the
 *   literal `null` a sandboxed document sends, which does not parse at all) →
 *   `null`. This is the hole the bare-entry rule exists to keep shut: those
 *   values are indistinguishable from one another, so admitting one admits the
 *   whole class. An entry may only name a host it can be told apart by.
 *
 * The host of a non-special scheme is an *opaque host* — the URL parser
 * percent-encodes it but does NOT lower-case it (measured: `new
 * URL("chrome-extension://ABC").host === "ABC"`). Matching is therefore
 * case-sensitive, unlike the domain half of an ordinary origin. Both the entry
 * and the header run through this same function, so they agree by construction
 * rather than by convention.
 */
function normalizeOpaqueOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.origin !== "null") return null;
  if (url.host === "") return null;
  return `${url.protocol}//${url.host}`;
}

/**
 * The origins a browser page may carry when talking to this shop's MCP endpoint:
 * the shop's own public URL plus any extra origins the operator listed in
 * `MCP_ALLOWED_ORIGINS` (comma-separated). Unparseable entries are dropped rather
 * than silently widening the list.
 *
 * One entry may be written as `opaque:<scheme>://<host>` — for example
 * `opaque:chrome-extension://abcdefghijklmnopabcdefghijklmnop`. That is the only
 * way to admit an origin the URL specification serializes as the string
 * `"null"`, and it admits exactly the one `scheme://host` it names: the prefix
 * is stripped, the rest must parse to an opaque origin **with a host**, and the
 * canonical `scheme://host` is what lands in the list. `opaque:file:///x`,
 * `opaque:data:…` and `opaque:null` are hostless and therefore dropped, which is
 * what keeps a single entry from standing in for every sandboxed document. An
 * `opaque:` entry naming an *ordinary* origin is dropped too — list that one
 * without the prefix.
 *
 * The returned list mixes both kinds, which is safe because the two forms can
 * never collide: a value whose scheme makes it opaque is by definition not a
 * value any ordinary origin serializes to.
 */
export function mcpAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const candidates = [brand.url, ...(env.MCP_ALLOWED_ORIGINS ?? "").split(",")];
  const allowed: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    const origin = trimmed.startsWith(OPAQUE_PREFIX)
      ? normalizeOpaqueOrigin(trimmed.slice(OPAQUE_PREFIX.length))
      : normalizeOrigin(trimmed);
    if (origin && !allowed.includes(origin)) allowed.push(origin);
  }
  return allowed;
}

/**
 * The dev-only loopback escape hatch, restricted to the two web schemes.
 *
 * The scheme test is load-bearing now that an opaque origin can reach this
 * function: `chrome-extension://localhost` (or `app://localhost`) has hostname
 * `localhost`, so a hostname-only rule would hand every unlisted extension a
 * pass on every non-production build — the one class this hatch exists to keep
 * narrow.
 */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return LOOPBACK_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * `true` when a request carrying this `Origin` header value may proceed.
 *
 * - Header absent → allowed (the specification rejects only a *present* header,
 *   and every non-browser MCP client omits it).
 * - Header present but empty → allowed. No browser emits an empty `Origin`; an
 *   intermediary that strips the value does, and locking those out would break
 *   deployments without closing anything.
 * - Unparseable origin, and any opaque origin the operator has not named with
 *   an `opaque:` entry (`null`, `file://…`) → rejected.
 * - Loopback origins are allowed outside production so `pnpm dev` tooling works
 *   — `http`/`https` only, never an opaque scheme that happens to say
 *   `localhost`.
 */
export function isAllowedMcpOrigin(
  header: string | null | undefined,
  opts: { allowed?: string[]; allowLoopback?: boolean } = {},
): boolean {
  if (header == null) return true;
  const raw = header.trim();
  if (raw === "") return true;

  // An opaque header can only ever match an explicit `opaque:` entry; it can
  // never reach the loopback hatch, and it never matches an ordinary origin.
  const origin = normalizeOrigin(raw) ?? normalizeOpaqueOrigin(raw);
  if (!origin) return false;

  const allowed = opts.allowed ?? mcpAllowedOrigins();
  if (allowed.includes(origin)) return true;

  const allowLoopback = opts.allowLoopback ?? process.env.NODE_ENV !== "production";
  return allowLoopback && isLoopbackOrigin(origin);
}

/**
 * The `403` an invalid `Origin` earns: a JSON-RPC error response with no `id`,
 * which is the shape the transport specification permits for a connection
 * rejected before any message is read. The offending value is deliberately not
 * echoed back. `no-store` is what actually keeps this out of a shared cache;
 * `Vary: Origin` states the dependency for any intermediary that stores anyway.
 */
export function mcpForbiddenOriginResponse(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Invalid Origin header" } },
    { status: 403, headers: { "cache-control": "no-store", vary: "Origin" } },
  );
}

/**
 * The shop's origin as it actually resolves at runtime.
 *
 * `getBrand()` derives `url` from the `BrandingSettings.domain` the setup
 * wizard writes, precisely so sitemap/robots/canonical follow the operator's
 * real domain without a `brand.config.ts` edit. A shop configured that way
 * would otherwise have to repeat its own domain in `MCP_ALLOWED_ORIGINS` to be
 * allowed to talk to itself, so it is consulted here too.
 *
 * It is checked only after the static list misses, so the origin check adds no
 * brand read of its own on the ordinary path. Note this is not the same as
 * "no brand read happens": the `mcpPublic` gate ahead of it calls
 * `getFeatures()`, which is itself `(await getBrand()).features`. Both hit the
 * same TTL cache, so the saving here is a cache lookup, not a query.
 */
async function isRuntimeShopOrigin(origin: string): Promise<boolean> {
  try {
    return normalizeOrigin((await getBrand()).url) === origin;
  } catch {
    // fetchBrand() is fail-soft by contract; if that ever changes, an
    // unreachable database must not silently widen the allowlist.
    return false;
  }
}

/** `null` when the origin is acceptable, otherwise the `403` to return. */
export async function mcpOriginRejection(
  header: string | null | undefined,
): Promise<Response | null> {
  if (isAllowedMcpOrigin(header)) return null;

  const origin = normalizeOrigin((header ?? "").trim());
  if (origin && (await isRuntimeShopOrigin(origin))) return null;

  return mcpForbiddenOriginResponse();
}
