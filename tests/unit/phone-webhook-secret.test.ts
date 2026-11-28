import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// DRØM26-b: the Phone.inc webhook answers only with the phoneWidget flag on,
// fails closed without a signing secret, and checks Phone.inc's signature
// (https://docs.phone.inc/api/webhooks) over the raw body before it parses it.
// The expected signatures here are computed with node:crypto from the
// documented recipe, not with the code under test.

const features = vi.hoisted(() => ({ phoneWidget: true as boolean }));
vi.mock("@/lib/brand", () => ({ getFeatures: async () => features }));

import { POST } from "@/plugins/phone-widget/api/webhook";
import { isValidPhoneIncSignature } from "@/plugins/phone-widget/lib/verify-webhook";

const SECRET = "whsec_phone_inc_test_0123456789abcdef";
const URL_BASE = "https://shop.example.com/api/phone/webhook";
const NOW = 1_793_016_000; // the timestamp in Phone.inc's own header example
const BODY = JSON.stringify({
  event: "call.ended",
  timestamp: "2026-11-28T10:00:00Z",
  data: { call_id: "call_1", duration: 42, note: "Kunden ringer om sin ordre fra i går" },
});

function sign(body: string | Uint8Array, ts: number | string, secret = SECRET): string {
  return "v1=" + createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");
}

function post(
  body: string,
  opts: { ts?: number | string | null; signature?: string | null; query?: string } = {},
): Request {
  const ts = opts.ts === undefined ? NOW : opts.ts;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ts !== null) headers["x-phone-inc-timestamp"] = String(ts);
  const signature = opts.signature === undefined ? sign(body, ts ?? NOW) : opts.signature;
  if (signature !== null) headers["x-phone-inc-signature"] = signature;
  const url = opts.query ? `${URL_BASE}?${opts.query}` : URL_BASE;
  return new Request(url, { method: "POST", headers, body });
}

const ORIGINAL = process.env.PHONE_INC_WEBHOOK_SECRET;
let spies: MockInstance[] = [];

beforeEach(() => {
  features.phoneWidget = true;
  process.env.PHONE_INC_WEBHOOK_SECRET = SECRET;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.useRealTimers();
  for (const s of spies) s.mockRestore();
  if (ORIGINAL === undefined) delete process.env.PHONE_INC_WEBHOOK_SECRET;
  else process.env.PHONE_INC_WEBHOOK_SECRET = ORIGINAL;
});

function logged(): string {
  return spies.flatMap((s) => s.mock.calls).flat().map(String).join("\n");
}

describe("phone webhook — flag and secret", () => {
  it("answers 404 with the phoneWidget flag off, before reading the body", async () => {
    features.phoneWidget = false;
    const req = post(BODY);
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(req.bodyUsed).toBe(false);
    expect(logged()).toBe("");
  });

  it("answers 404 with the flag off even for a correctly signed delivery", async () => {
    features.phoneWidget = false;
    expect((await POST(post(BODY))).status).toBe(404);
  });

  it.each([["unset", undefined], ["blank", "   "]])(
    "fails closed (503) when the signing secret is %s, body unread",
    async (_label, value) => {
      if (value === undefined) delete process.env.PHONE_INC_WEBHOOK_SECRET;
      else process.env.PHONE_INC_WEBHOOK_SECRET = value;
      const req = post(BODY, { signature: "v1=" + "0".repeat(64) });
      const res = await POST(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Webhook not configured" });
      expect(req.bodyUsed).toBe(false);
      expect(logged()).toBe("");
    },
  );
});

describe("phone webhook — Phone.inc signature", () => {
  it("accepts a delivery signed as Phone.inc documents it", async () => {
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logged()).toContain("call.ended");
  });

  it("signs the raw bytes: a body with non-ASCII text verifies", async () => {
    const body = JSON.stringify({ event: "voicemail.new", data: { text: "Hej, det er Søren — æøå" } });
    expect((await POST(post(body))).status).toBe(200);
  });

  it("refuses a body changed after it was signed, and logs nothing from it", async () => {
    const tampered = BODY.replace('"duration":42', '"duration":43');
    const res = await POST(post(tampered, { signature: sign(BODY, NOW) }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(logged()).toBe("");
  });

  it("accepts a timestamp exactly 300 s away, refuses 301 s old or 301 s ahead", async () => {
    expect((await POST(post(BODY, { ts: NOW - 300 }))).status).toBe(200);
    expect((await POST(post(BODY, { ts: NOW + 300 }))).status).toBe(200);
    expect((await POST(post(BODY, { ts: NOW - 301 }))).status).toBe(401);
    expect((await POST(post(BODY, { ts: NOW + 301 }))).status).toBe(401);
  });

  it("refuses a signature made with another secret", async () => {
    const res = await POST(post(BODY, { signature: sign(BODY, NOW, "another-secret") }));
    expect(res.status).toBe(401);
  });

  it("refuses the right HMAC in uppercase hex (Phone.inc sends lowercase; the full value is compared)", async () => {
    const lower = sign(BODY, NOW);
    const upper = "v1=" + lower.slice(3).toUpperCase();
    expect(upper).not.toBe(lower);
    expect((await POST(post(BODY, { signature: upper }))).status).toBe(401);
  });

  it.each([
    ["no signature header", { signature: null }],
    ["no timestamp header", { ts: null, signature: sign(BODY, NOW) }],
    ["a timestamp that is not Unix seconds", { ts: "2026-11-28T10:00:00Z" }],
    ["an unsupported version", { signature: "v0=" + sign(BODY, NOW).slice(3) }],
    ["a bare hex HMAC without v1=", { signature: sign(BODY, NOW).slice(3) }],
    ["the raw secret in the signature header (the old guard)", { signature: SECRET }],
  ] as const)("refuses %s", async (_label, opts) => {
    expect((await POST(post(BODY, opts))).status).toBe(401);
    expect(logged()).toBe("");
  });

  it("answers 400 (not retried) for a correctly signed body that is not a JSON object", async () => {
    for (const body of ["not json", "null", "[1,2]", '"call.ended"']) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid payload" });
    }
  });

  it("handles call.outside_business_hours and the older call.outside_opening_hours", async () => {
    for (const event of ["call.outside_business_hours", "call.outside_opening_hours"]) {
      const body = JSON.stringify({ event, data: {} });
      expect((await POST(post(body))).status).toBe(200);
    }
    const out = logged();
    expect(out).toContain("Received event: call.outside_business_hours");
    expect(out).not.toContain("Unhandled event type");
  });
});

describe("phone webhook — body size (1 MiB)", () => {
  const MIB = 1024 * 1024;

  /** An unsigned chunked request with no Content-Length; counts the bytes the handler pulls. */
  function streamed(totalBytes: number) {
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    const state = { pulled: 0 };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (state.pulled >= totalBytes) return controller.close();
        state.pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const init = { method: "POST", body, duplex: "half" } as RequestInit;
    return { req: new Request(URL_BASE, init), state };
  }

  it("stops reading a chunked body without Content-Length once it passes 1 MiB", async () => {
    const { req, state } = streamed(8 * MIB);
    expect(req.headers.get("content-length")).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(state.pulled).toBeLessThanOrEqual(MIB + 2 * 64 * 1024);
    expect(logged()).toBe("");
  });

  it("verifies a signed body of exactly 1 MiB and refuses one byte more", async () => {
    const pad = (n: number) => {
      const head = '{"event":"call.ended","pad":"';
      return head + "a".repeat(n - head.length - 2) + '"}';
    };
    expect((await POST(post(pad(MIB)))).status).toBe(200);
    expect((await POST(post(pad(MIB + 1)))).status).toBe(413);
  });

  it("answers 400 for a correctly signed body that is not UTF-8", async () => {
    // Valid JSON once a lenient decoder turns 0xFF into U+FFFD, so only the fatal decoder refuses it.
    const bytes = new Uint8Array([...new TextEncoder().encode('{"event":"call.ended","x":"'), 0xff, 0x22, 0x7d]);
    const headers = { "x-phone-inc-timestamp": String(NOW), "x-phone-inc-signature": sign(bytes, NOW) };
    const res = await POST(new Request(URL_BASE, { method: "POST", headers, body: bytes }));
    expect(res.status).toBe(400);
  });
});

describe("phone webhook — deprecated ?token= URL", () => {
  it("still accepts the secret in ?token= for one release, with a deprecation warning", async () => {
    const res = await POST(post(BODY, { signature: null, ts: null, query: `token=${SECRET}` }));
    expect(res.status).toBe(200);
    expect(logged()).toContain("deprecated ?token=");
  });

  it("refuses a wrong ?token=", async () => {
    const res = await POST(post(BODY, { signature: null, ts: null, query: "token=wrong" }));
    expect(res.status).toBe(401);
  });
});

describe("isValidPhoneIncSignature", () => {
  const raw = new TextEncoder().encode(BODY);

  it("matches an HMAC computed independently over `<ts>.<raw body>`", () => {
    expect(
      isValidPhoneIncSignature({ secret: SECRET, timestamp: String(NOW), signature: sign(raw, NOW), rawBody: raw, nowSeconds: NOW }),
    ).toBe(true);
  });

  it("refuses the HMAC of the body alone (the timestamp is part of the message)", () => {
    const bodyOnly = "v1=" + createHmac("sha256", SECRET).update(raw).digest("hex");
    expect(
      isValidPhoneIncSignature({ secret: SECRET, timestamp: String(NOW), signature: bodyOnly, rawBody: raw, nowSeconds: NOW }),
    ).toBe(false);
  });
});

// .env.example is what a merchant reads to set the secret up; it must describe
// the guard above, not the old "unset = accept anyone, send your own value" one.
describe(".env.example — PHONE_INC_WEBHOOK_SECRET", () => {
  const lines = readFileSync(join(process.cwd(), ".env.example"), "utf8").split("\n");
  const end = lines.findIndex((l) => l.includes('PHONE_INC_WEBHOOK_SECRET=""'));
  let start = end;
  while (start > 0 && lines[start - 1].startsWith("#")) start--;
  const block = lines.slice(start, end + 1).join("\n");

  it("says a missing secret is 503 and the header carries Phone.inc's v1= HMAC", () => {
    expect(end).toBeGreaterThan(-1);
    expect(block).toContain("503");
    expect(block).toContain("v1=");
    expect(block).toContain("<x-phone-inc-timestamp>.<raw body>");
  });

  it("no longer says an unset secret accepts any caller or that the header carries the secret itself", () => {
    expect(block).not.toMatch(/accepts any caller/i);
    expect(block).not.toContain("x-phone-inc-signature: <secret>");
  });
});
