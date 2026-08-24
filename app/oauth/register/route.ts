import { OAuthError, registerPublicClient } from "@/lib/ucp/oauth";
import { ucpDisabledResponse, ucpIdentityLinkingEnabled } from "@/lib/ucp/gate";
import { allowResponse } from "@/lib/http/allow";
import { withAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST` is the only exported verb — no `GET`, so no framework `HEAD`. */
const ALLOWED_METHODS = "OPTIONS, POST";

const TRUNCATED = "…[truncated]";

/**
 * Truncate a caller-supplied string, marking that it was cut so a reader never
 * mistakes a truncated value for the whole one.
 *
 * EVERY value this endpoint audits is caller-controlled, so every one of them
 * goes through here. `safeStringify` is not a substitute: it caps the finished
 * JSON at 64 KB by slicing the string, which yields a row that no longer
 * parses — and it does not apply to `ip`/`userAgent` at all, since those go
 * straight to their own columns.
 *
 * The result is at most `max` characters INCLUDING the marker, so "capped to
 * `max`" is true of what is stored rather than of an intermediate value. A
 * trailing lone surrogate is dropped: slicing counts UTF-16 code units, so a
 * cut landing inside an astral character (an emoji) would otherwise leave an
 * unpaired surrogate, which is not valid UTF-8 for a Postgres deployment.
 */
function cap(value: string | null, max: number): string | null {
  if (value === null || value.length <= max) return value;
  let head = value.slice(0, Math.max(0, max - TRUNCATED.length));
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1);
  return `${head}${TRUNCATED}`;
}

/** Cap a caller-supplied list in both dimensions — the count is theirs too. */
function capList(values: string[], maxItems: number, maxChars: number): string[] {
  return values.slice(0, maxItems).map((v) => cap(v, maxChars) as string);
}

/**
 * The client as the edge saw it: the first NON-EMPTY hop of the forwarding
 * chain. Storing the raw header would put the whole proxy chain (or arbitrary
 * caller text) in a column named `ip`.
 *
 * The first hop is skipped when empty rather than treated as "unknown",
 * because a caller can send `X-Forwarded-For: , 1.2.3.4` and have the proxy
 * append its observation after theirs — taking `[0]` literally would let them
 * blank their own address out of the record.
 *
 * `x-real-ip` is the fallback for deployments fronted by something that sets
 * only that, mirroring `ipFromRequest` in `lib/auth/login-throttle.ts`.
 */
function callerIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  for (const hop of forwarded.split(",")) {
    const trimmed = hop.trim();
    if (trimmed) return trimmed;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

/**
 * RFC 7591 — Dynamic Client Registration (public clients, PKCE, ingen secret).
 * En agentic-platform registrerer sine redirect_uris + ønskede scopes og får et
 * client_id retur. Gated bag ucpIdentityLinking.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Body must be valid JSON." },
      { status: 400 },
    );
  }
  // `null`, `7`, `"x"` and `[]` are all valid JSON, so `req.json()` resolves
  // and the property reads below run against a non-object. Only `null` was
  // actually broken — reading `.client_name` off it threw OUTSIDE any try, so
  // that one body answered **500**; the primitives and the array just read
  // `undefined` and fell through to a 400 from the validator. Measured, not
  // assumed. Pre-existing; closed here because a 500 on an unauthenticated
  // endpoint is both the wrong contract and the loudest thing an abuse scanner
  // can find, and because RFC 7591 requires a JSON object anyway — so saying
  // so once beats four accidental paths to roughly the right answer.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Body must be a JSON object." },
      { status: 400 },
    );
  }

  const b = body as {
    client_name?: unknown;
    redirect_uris?: unknown;
    scope?: unknown;
  };
  const name = typeof b.client_name === "string" ? b.client_name : "";
  const redirectUris = Array.isArray(b.redirect_uris)
    ? b.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  // Udelades scope → undefined, så registerPublicClient anvender least-privilege
  // default (order:read) frem for at over-tildele order:manage.
  const scopes =
    typeof b.scope === "string" && b.scope.trim()
      ? b.scope.trim().split(/\s+/)
      : undefined;

  try {
    // The second half of the go-live protection this endpoint was shipped
    // without: `docs/HUL-D-UCP-IDENTITY-LINKING.md` lists "rate-limiting +
    // logging" against registration spam, and only the limiter landed (the
    // `/oauth/*` window in `proxy.ts`). RFC 7591 registration is the one
    // UNAUTHENTICATED write on the UCP surface, so a shop that enabled
    // identity-linking gained rows in `OAuthClient` with no record of who
    // asked for them.
    //
    // SCOPE — only a SUCCEEDED registration is recorded, and that boundary is
    // the whole design, not an oversight:
    //
    //  · Auditing the rejection path as well was the first version of this,
    //    and it is a new unauthenticated write class. The two named bounds
    //    both fail open on a default shop: the `/oauth/*` limiter is inert
    //    without `UPSTASH_*` (`proxy.ts` sets `redis = null`), and
    //    `brand.policies.auditRetentionDays` defaults to `null`, which
    //    `pruneAuditLog` reads as keep-forever. An anonymous caller could
    //    therefore turn malformed POSTs into permanent rows.
    //  · Recording only successes keeps the audit trail a mirror of durable
    //    state: one row per `OAuthClient` row. That row was already an
    //    unauthenticated write this endpoint has always performed, so this
    //    adds a constant factor to an existing bound rather than a new
    //    unbounded one.
    //
    // Rejected attempts are consequently NOT recorded — a real gap in the
    // spam signal, and the honest price of not shipping the growth vector.
    // Closing it needs an always-on bound (limiter or capped failure budget)
    // rather than a logging call, so it is filed rather than half-built.
    //
    // EVERY audited value is capped, in both dimensions where it is a list.
    // Two reasons, and the second is the one that bites:
    //
    //  · `ip`/`userAgent` never pass through `safeStringify` — they go
    //    straight to their own columns — so nothing else bounds them.
    //  · `scope` is the raw REQUESTED list. `registerPublicClient` filters
    //    unsupported scopes away, so without a cap here the audit row would
    //    persist input the endpoint otherwise discards: a caller could send
    //    one valid scope plus thousands of junk ones and turn a ~127-byte
    //    `OAuthClient` row into a 64 KB audit payload. That is not a constant
    //    factor on an existing write, it is a new store.
    //
    // `safeStringify`'s 64 KB cap is not the backstop it looks like: it slices
    // the finished JSON, so a row that hits it no longer parses.
    // Registration runs OUTSIDE the audit wrapper: `withAudit` records the
    // throw as `ok:false` and rethrows, which is the behaviour being avoided
    // here. Wrapping the settled value records the completed registration and
    // nothing else.
    const reg = await registerPublicClient({ name, redirectUris, scopes });
    await withAudit(
      {
        actor: "oauth-register:anonymous",
        tool: "ucp.register_client",
        args: {
          client_name: cap(name, 200),
          redirect_uris: capList(redirectUris, 10, 500),
          // Explicit rather than omitted, so "the caller asked for nothing and
          // got the least-privilege default" is readable in the row itself.
          scope: scopes ? capList(scopes, 20, 100) : null,
        },
        ip: cap(callerIp(req), 100),
        userAgent: cap(req.headers.get("user-agent"), 200),
      },
      // A capped PROJECTION, not `reg` itself: `afterJson` runs through the
      // same `safeStringify`, and `registerPublicClient` caps neither the
      // count nor the length of the accepted `redirect_uris`. The response
      // above still sends the full, uncapped values.
      async () => ({
        client_id: reg.client_id,
        redirect_uris: capList(reg.redirect_uris, 10, 500),
        scopes: capList(reg.scopes, 20, 100),
      }),
    );
    return Response.json(
      {
        client_id: reg.client_id,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        redirect_uris: reg.redirect_uris,
        scope: reg.scopes.join(" "),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json(
        { error: err.code, error_description: err.message },
        { status: err.status },
      );
    }
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Registration failed." },
      { status: 400 },
    );
  }
}

/**
 * Same gate as the handler above: a shop that does not link identities must
 * answer this verb the way an absent path does, rather than let the
 * framework's substitute advertise the endpoint's method list.
 */
export async function OPTIONS(): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();
  return allowResponse(ALLOWED_METHODS);
}
