import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

/**
 * `/oauth/register` is the one UNAUTHENTICATED write on the UCP surface (RFC
 * 7591 dynamic client registration). `docs/HUL-D-UCP-IDENTITY-LINKING.md`
 * asked for "rate-limiting + logging" against registration spam; the limiter
 * landed in `proxy.ts`, the logging did not — so an enabled shop gained
 * `OAuthClient` rows with no record of who asked for them.
 *
 * What these tests pin is as much the SHAPE of the logging as its presence:
 * only a completed registration is recorded (one row per client row — logging
 * rejections would be a new unauthenticated write class, and both of its named
 * bounds fail open on a default shop), every audited field is truncated, a
 * failing audit write can never fail the request, and nothing at all is
 * written while the gate is closed.
 */

const mocks = vi.hoisted(() => ({
  clientCreate: vi.fn(),
  auditCreate: vi.fn(),
  gateEnabled: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    oAuthClient: { create: mocks.clientCreate },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/ucp/gate", () => ({
  ucpIdentityLinkingEnabled: mocks.gateEnabled,
  ucpDisabledResponse: () =>
    Response.json({ error: "not_found" }, { status: 404 }),
}));

/**
 * The route under test is PRUNED in the light profile, so neither the static
 * import nor the describe below can assume it exists.
 *
 * This is the same shape #439 gave `agentic-options-gate.test.ts`. It is here
 * again because #440 added this file afterwards with a plain top-level import,
 * which put the light profile's typecheck back where #439 found it:
 * `error TS2307: Cannot find module '@/app/oauth/register/route'`. The release
 * scaffold gate caught it before the tag existed.
 *
 * Two separate mechanisms, and they are not interchangeable:
 *   - `@ts-ignore` on the dynamic import handles TYPECHECK, where the specifier
 *     cannot resolve in a profile that pruned it. `@ts-expect-error` cannot be
 *     used: the module IS present in the full profile, where the directive
 *     would itself become an unused-directive error.
 *   - `PRESENT` handles RUNTIME, deciding whether the suite runs at all.
 */
const SRC = "app/oauth/register/route.ts";
const PRESENT = existsSync(join(__dirname, "..", "..", SRC));

if (!PRESENT) {
  // stderr, NOT console.info: vitest's default reporter buffers stdout and
  // flushes it only for FAILING files, so an info here would be visible in
  // exactly the runs where it does not matter.
  process.stderr.write(
    `[oauth-register-audit] ${SRC} is pruned in this profile — suite skipped\n`,
  );
}

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  if (!PRESENT) return;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- @ts-expect-error cannot be used: the module IS present in the full profile, where an expect-error would itself become an unused-directive error.
  // @ts-ignore -- profile-dependent module
  ({ POST } = await import("@/app/oauth/register/route"));
});

const VALID_BODY = {
  client_name: "Northbound Buyer Agent",
  redirect_uris: ["https://agent.example/callback"],
  scope: "dev.ucp.shopping.order:read",
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://shop.example/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** The single audit row written during a test, parsed back into fields. */
function auditRow() {
  expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  const data = mocks.auditCreate.mock.calls[0][0].data as {
    actor: string;
    tool: string;
    argsJson: string;
    afterJson: string | null;
    ok: boolean;
    errorMsg: string | null;
    ip: string | null;
    userAgent: string | null;
  };
  return {
    ...data,
    args: JSON.parse(data.argsJson) as {
      client_name: string;
      redirect_uris: string[];
      scope: string[] | null;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gateEnabled.mockResolvedValue(true);
  mocks.clientCreate.mockResolvedValue({ id: "client_abc123" });
  mocks.auditCreate.mockResolvedValue({ id: "audit_1" });
});

describe.skipIf(!PRESENT)("/oauth/register — audit logging", () => {
  it("records a completed registration, with the caller's ip and user-agent", async () => {
    const res = await POST(
      post(VALID_BODY, {
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "BuyerAgent/1.2",
      }),
    );

    expect(res.status).toBe(201);
    const row = auditRow();
    expect(row.ok).toBe(true);
    expect(row.tool).toBe("ucp.register_client");
    // The actor prefix is what /admin/audit filters and badges on; an
    // unauthenticated caller must not be filed under `system:` or `user:`.
    expect(row.actor.startsWith("oauth-register:")).toBe(true);
    expect(row.ip).toBe("203.0.113.7");
    expect(row.userAgent).toBe("BuyerAgent/1.2");
    // What was asked for, so an operator can tell a partner from a spam wave.
    expect(row.args.client_name).toBe("Northbound Buyer Agent");
    expect(row.args.redirect_uris).toEqual(["https://agent.example/callback"]);
    // And what was granted — the client_id ties the row to the OAuthClient row.
    expect(row.afterJson).toContain("client_abc123");
  });

  it("records the least-privilege default as an explicit null, not a missing key", async () => {
    // `scope` omitted → registerPublicClient applies order:read. If the audited
    // args simply dropped the key, "asked for nothing" and "field lost in
    // serialisation" would look identical in the row.
    const body = { ...VALID_BODY, scope: undefined };
    const res = await POST(post(body));

    expect(res.status).toBe(201);
    const row = auditRow();
    expect("scope" in row.args).toBe(true);
    expect(row.args.scope).toBeNull();
  });

  it("caps the REQUESTED scope list — the field the endpoint otherwise discards", async () => {
    // registerPublicClient filters unsupported scopes away, so junk scopes are
    // never stored anywhere else. Uncapped, one valid scope plus thousands of
    // junk ones turned a ~127-byte OAuthClient row into a 64 KB audit payload
    // — new storage, not a constant factor on an existing write.
    const junk = Array.from({ length: 30_000 }, (_, i) => `j${i}`).join(" ");
    const res = await POST(
      post({
        ...VALID_BODY,
        scope: `dev.ucp.shopping.order:read ${junk}`,
      }),
    );

    expect(res.status).toBe(201);
    const row = auditRow();
    expect(row.args.scope).not.toBeNull();
    expect(row.args.scope!.length).toBeLessThanOrEqual(20);
    for (const s of row.args.scope!) expect(s.length).toBeLessThanOrEqual(100);
    // The whole row stays comfortably small AND still machine-readable —
    // safeStringify's 64 KB cap slices the JSON, so hitting it is a defect.
    expect(row.argsJson.length).toBeLessThan(10_000);
    expect(() => JSON.parse(row.argsJson)).not.toThrow();
  });

  it("caps afterJson too — registerPublicClient bounds neither list", async () => {
    const many = Array.from(
      { length: 500 },
      (_, i) => `https://agent.example/${"q".repeat(400)}/${i}`,
    );
    mocks.clientCreate.mockResolvedValue({ id: "client_abc123" });

    const res = await POST(post({ ...VALID_BODY, redirect_uris: many }));

    expect(res.status).toBe(201);
    const row = auditRow();
    expect(row.afterJson).not.toBeNull();
    expect(row.afterJson!.length).toBeLessThan(10_000);
    expect(() => JSON.parse(row.afterJson!)).not.toThrow();
    // The RESPONSE still carries the full accepted list — only the audit
    // projection is capped.
    const payload = (await res.json()) as { redirect_uris: string[] };
    expect(payload.redirect_uris.length).toBe(500);
  });

  it("keeps a truncated value at or below its cap, and valid UTF-16", async () => {
    // The marker is part of the budget, not appended past it. And slicing
    // counts UTF-16 code units, so a cut landing inside an emoji would leave
    // a lone surrogate — not valid UTF-8 for a Postgres deployment.
    //
    // Sent through the JSON body, not a header: headers are ByteStrings, so
    // an emoji in `user-agent` cannot reach the server at all (`new Request`
    // rejects it). The body is where this vector is actually reachable.
    //
    // Sweep the padding instead of guessing one offset: exactly one alignment
    // puts the cut between an emoji's two code units, and hard-coding it would
    // silently stop testing anything the moment the marker's length changes.
    // (It did: a fixed 195-char pad left the cut 8 characters short of the
    // first emoji, and the assertion passed with the guard deleted.)
    for (let pad = 180; pad <= 200; pad++) {
      vi.clearAllMocks();
      mocks.gateEnabled.mockResolvedValue(true);
      mocks.clientCreate.mockResolvedValue({ id: "client_abc123" });
      mocks.auditCreate.mockResolvedValue({ id: "audit_1" });

      const res = await POST(
        post({ ...VALID_BODY, client_name: `${"a".repeat(pad)}${"🙂".repeat(20)}` }),
      );

      expect(res.status).toBe(201);
      const name = auditRow().args.client_name;
      expect(name.length).toBeLessThanOrEqual(200);
      expect(name).toContain("truncated");
      // No unpaired surrogate survived the cut, at any alignment.
      expect(name).toBe(name.toWellFormed());
    }
  });

  it("cannot be made to blank its own ip with a leading comma", async () => {
    // `X-Forwarded-For: , 1.2.3.4` — the caller sends an empty first hop and
    // the proxy appends its observation after it. Taking [0] literally would
    // record null and let them hide.
    const res = await POST(post(VALID_BODY, { "x-forwarded-for": ", 198.51.100.9" }));

    expect(res.status).toBe(201);
    expect(auditRow().ip).toBe("198.51.100.9");
  });

  it("falls back to x-real-ip when there is no forwarding chain", async () => {
    const res = await POST(post(VALID_BODY, { "x-real-ip": "198.51.100.22" }));

    expect(res.status).toBe(201);
    expect(auditRow().ip).toBe("198.51.100.22");
  });

  it("truncates every caller-controlled field it writes", async () => {
    // ip and userAgent go STRAIGHT to Prisma — they never pass through
    // safeStringify's 64 KB cap, which is what bounds the JSON columns. An
    // oversized header could otherwise fail the INSERT, and since audit
    // failures are swallowed by design that would be a silent way to register
    // a client and leave no trace.
    const res = await POST(
      post(
        {
          client_name: "N".repeat(5_000),
          redirect_uris: Array.from(
            { length: 50 },
            (_, i) => `https://agent.example/${"p".repeat(2_000)}/${i}`,
          ),
          // "every field" has to mean every field — an earlier version of this
          // test omitted `scope`, and `scope` was the one that was uncapped.
          scope: `dev.ucp.shopping.order:read ${"z".repeat(50_000)}`,
        },
        {
          "x-forwarded-for": `${"9".repeat(4_000)}, 10.0.0.1`,
          "user-agent": "U".repeat(9_000),
        },
      ),
    );

    expect(res.status).toBe(201);
    const row = auditRow();
    expect(row.args.client_name.length).toBeLessThan(300);
    expect(row.args.redirect_uris.length).toBeLessThanOrEqual(10);
    for (const uri of row.args.redirect_uris) {
      expect(uri.length).toBeLessThan(600);
    }
    expect((row.userAgent ?? "").length).toBeLessThan(300);
    expect((row.ip ?? "").length).toBeLessThan(200);
    // Truncation is marked, so a reader never mistakes a cut value for whole.
    expect(row.args.client_name).toContain("truncated");
  });

  it("stores only the first X-Forwarded-For hop, not the whole chain", async () => {
    const res = await POST(
      post(VALID_BODY, { "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }),
    );

    expect(res.status).toBe(201);
    expect(auditRow().ip).toBe("203.0.113.7");
  });

  it("does NOT record a rejected registration — the documented boundary", async () => {
    // http:// non-loopback redirect_uri → OAuthError("invalid_redirect_uri").
    // Deliberate: logging rejections is a new unauthenticated write class, and
    // both named bounds fail open on a default shop (the /oauth/* limiter is
    // inert without UPSTASH_*, and auditRetentionDays defaults to null =
    // keep forever). If this ever starts logging, it needs an always-on bound,
    // and docs/HUL-D-UCP-IDENTITY-LINKING.md has to change with it.
    const res = await POST(
      post({ ...VALID_BODY, redirect_uris: ["http://evil.example/cb"] }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_redirect_uri",
    });
    expect(mocks.clientCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("still registers when the audit write itself fails", async () => {
    mocks.auditCreate.mockRejectedValue(new Error("audit db down"));
    // writeAuditEntry logs to console.error on failure — silence it so a
    // deliberate failure does not look like a broken test run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(post(VALID_BODY));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ client_id: "client_abc123" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("writes nothing while the gate is closed", async () => {
    mocks.gateEnabled.mockResolvedValue(false);

    const res = await POST(post(VALID_BODY));

    expect(res.status).toBe(404);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.clientCreate).not.toHaveBeenCalled();
  });

  it("answers 400, not 500, for a non-object JSON body", async () => {
    // Of these four, only `null` actually answered 500 before the guard (the
    // property read threw outside any try); `7`, `"x"` and `[]` read
    // `undefined` and already fell through to a 400 from the validator. They
    // are kept anyway — the guard's contract is "a body must be a JSON
    // object", and pinning all four stops a later edit from reintroducing the
    // crash through a shape the single `null` case would not cover.
    for (const body of ["null", "7", '"x"', "[]"]) {
      vi.clearAllMocks();
      mocks.gateEnabled.mockResolvedValue(true);

      const res = await POST(post(body));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: "invalid_client_metadata",
      });
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    }
  });

  it("does NOT audit an unparseable body", async () => {
    const res = await POST(post("{not json"));

    expect(res.status).toBe(400);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
