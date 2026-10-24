import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { NextRequest } from "next/server";
import {
  _resetUntrustedProxyWarningForTest,
  trustedClientIp,
} from "@/lib/trusted-client-ip";

/**
 * INQ-IP-TRUST — the contact form and password reset key their per-IP limits
 * on `trustedClientIp`, not on the raw first hop of `x-forwarded-for`. For the
 * contact form that is every route the shipped form posts to: the AI answer
 * (`/api/support/triage`, a paid model call, asked before the message is
 * sent), the optional attachments (`/api/contact/upload`) and the message
 * itself (`/api/inquiries`, both the database and the site-profile variant).
 *
 * The raw header was the client's own word wherever no proxy overwrites it
 * (self-hosted): Next's Node server fills `x-forwarded-for` with the socket
 * address only when the request has none (`??=`), so a client's own value was
 * kept, and a script could send a fresh one per request and get a fresh bucket
 * each time. Now Vercel keys on its own forwarded header, and self-hosted the
 * header is believed only with CARTWRIGHT_TRUST_PROXY_IP_HEADERS=true (or 1).
 * The price, self-hosted without the variable: every visitor shares the
 * "unknown" bucket — with or without a proxy in front — five messages and then
 * one a minute for the whole shop. That shared bucket is kept on purpose: the
 * contact form has no honeypot, and in the site profile every request is a mail
 * to the owner, so "no limit" would be a mail flood on a self-hosted shop
 * without proxy trust or Upstash. The reset checks the IP bucket before the
 * per-address one, so a throttled client can no longer use up other people's
 * per-address buckets.
 *
 * R2/R3: trustedClientIp logs a warning once per server process whenever it
 * takes the untrusted self-hosted path. The header cannot be the trigger: Next
 * sets it on every request, so its presence does not reveal a proxy. The trust
 * variable accepts only "true" or "1" (trimmed, any case); everything else is
 * refused.
 *
 * R4: a production build evaluates this module more than once in one process
 * (the proxy chunk, route-handler chunks, the SSR/server-action runtime), so the
 * once-flag lives on globalThis under Symbol.for(...) — a module-level `let`
 * gave every copy its own warning. The tests below load separate copies with
 * vi.resetModules() to stand in for those chunks.
 */

const mocks = vi.hoisted(() => ({
  inquiryKeys: [] as string[],
  triageKeys: [] as string[],
  uploadKeys: [] as string[],
  resetIpKeys: [] as string[],
  resetEmailKeys: [] as string[],
  allowed: true,
  emailAllowed: true,
  leadCreate: vi.fn(),
  sendContactMail: vi.fn(),
  requestPasswordReset: vi.fn(),
  getAnthropicApiKey: vi.fn(),
  blobPut: vi.fn(),
  features: {} as Record<string, boolean>,
  headers: new Headers(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb };
});
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/brand.config", () => ({
  brand: { storeName: "Test Shop", features: {} },
}));
vi.mock("@/lib/db", () => ({
  prisma: { lead: { create: (a: unknown) => mocks.leadCreate(a), update: vi.fn() } },
}));
vi.mock("@/lib/ai/settings", () => ({
  getAiSettings: async () => ({ anthropicConfigured: false, localConfigured: false }),
}));
vi.mock("@/lib/ai/client", () => ({
  chatModelResolved: vi.fn(),
  getAnthropicApiKey: () => mocks.getAnthropicApiKey(),
}));
vi.mock("ai", () => ({ generateObject: vi.fn(), generateText: vi.fn() }));
vi.mock("@/lib/brand", () => ({ getFeatures: async () => mocks.features }));
vi.mock("@vercel/blob", () => ({ put: (...a: unknown[]) => mocks.blobPut(...a) }));
vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_c: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/contact-mail", () => ({
  sendContactMail: (m: unknown) => mocks.sendContactMail(m),
}));
vi.mock("@/lib/auth/password-reset", () => ({
  requestPasswordReset: (e: string) => mocks.requestPasswordReset(e),
  // The action schedules the reset after the response (AUTH-FORGOT-TIMING);
  // forwarding keeps "which address was reset" observable here.
  schedulePasswordReset: (e: string) => {
    void mocks.requestPasswordReset(e);
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  inquiryPerIpLimiter: {
    check: (key: string) => {
      mocks.inquiryKeys.push(key);
      return { allowed: mocks.allowed, retryAfter: 60 };
    },
  },
  supportTriagePerIpLimiter: {
    check: (key: string) => {
      mocks.triageKeys.push(key);
      return { allowed: mocks.allowed, retryAfter: 60 };
    },
  },
  contactUploadPerIpLimiter: {
    check: (key: string) => {
      mocks.uploadKeys.push(key);
      return { allowed: mocks.allowed, retryAfter: 60 };
    },
  },
  passwordResetPerIpLimiter: {
    check: (key: string) => {
      mocks.resetIpKeys.push(key);
      return { allowed: mocks.allowed, retryAfter: 60 };
    },
  },
  passwordResetPerEmailLimiter: {
    check: (key: string) => {
      mocks.resetEmailKeys.push(key);
      return { allowed: mocks.emailAllowed, retryAfter: 60 };
    },
  },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

const BODY = JSON.stringify({
  name: "Test Testesen",
  email: "t@example.test",
  message: "Hello",
});

const ROUTES = [
  ["database route", "@/app/api/inquiries/route"],
  ["site-profile route", "@/app/api/inquiries/route.static"],
] as const;

async function postInquiry(modulePath: string, headers: Record<string, string>) {
  const mod =
    modulePath === "@/app/api/inquiries/route"
      ? await import("@/app/api/inquiries/route")
      : await import("@/app/api/inquiries/route.static");
  return mod.POST(
    new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: BODY,
    }),
  );
}

/** The two routes the contact form posts to before (and beside) /api/inquiries. */
const CONTACT_FLOW_ROUTES = [
  ["/api/support/triage (the AI answer, a paid model call)", "triage"],
  ["/api/contact/upload (attachments)", "upload"],
] as const;
type ContactFlowRoute = (typeof CONTACT_FLOW_ROUTES)[number][1];

function contactFlowKeys(route: ContactFlowRoute): string[] {
  return route === "triage" ? mocks.triageKeys : mocks.uploadKeys;
}

async function postContactFlow(route: ContactFlowRoute, headers: Record<string, string>) {
  if (route === "triage") {
    const { POST } = await import("@/app/api/support/triage/route");
    return POST(
      new Request("http://localhost:3000/api/support/triage", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ message: "When do you ship to Aarhus?" }),
      }),
    );
  }
  const { POST } = await import("@/app/api/contact/upload/route");
  // No file in the form: an allowed request ends in a 400 before any upload.
  return POST(
    new NextRequest("http://localhost:3000/api/contact/upload", {
      method: "POST",
      headers,
      body: new FormData(),
    }),
  );
}

async function requestReset(headers: Record<string, string>) {
  mocks.headers = new Headers(headers);
  const { requestPasswordResetAction } = await import(
    "@/app/[locale]/account/forgot-password/actions"
  );
  const form = new FormData();
  form.set("email", "Kunde@Example.test");
  return requestPasswordResetAction({ status: "idle" }, form);
}

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  // The untrusted-header warning is once per process; keep the run quiet and
  // start every test with the flag down.
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  _resetUntrustedProxyWarningForTest();
  mocks.inquiryKeys = [];
  mocks.triageKeys = [];
  mocks.uploadKeys = [];
  mocks.features = { contactAttachments: true };
  mocks.getAnthropicApiKey.mockResolvedValue(null);
  mocks.resetIpKeys = [];
  mocks.resetEmailKeys = [];
  mocks.allowed = true;
  mocks.emailAllowed = true;
  mocks.leadCreate.mockResolvedValue({ id: "lead_1" });
  mocks.sendContactMail.mockResolvedValue(true);
  mocks.requestPasswordReset.mockResolvedValue(undefined);
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "");
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllEnvs();
});

describe.each(ROUTES)("/api/inquiries (%s) — per-IP key", (_label, path) => {
  it("on Vercel, keys on Vercel's own forwarded-for, not the client's x-forwarded-for", async () => {
    vi.stubEnv("VERCEL", "1");
    await postInquiry(path, {
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99",
    });
    expect(mocks.inquiryKeys).toEqual(["203.0.113.7"]);
  });

  it("self-hosted without the trust variable: a spoofed header is not believed — the client counts as unknown", async () => {
    await postInquiry(path, { "x-forwarded-for": "198.51.100.1" });
    await postInquiry(path, { "x-forwarded-for": "198.51.100.2" });
    expect(mocks.inquiryKeys).toEqual(["unknown", "unknown"]);
  });

  it("an unidentified client is still throttled through the shared unknown bucket", async () => {
    mocks.allowed = false;
    const res = await postInquiry(path, {});
    expect(res.status).toBe(429);
    expect(mocks.inquiryKeys).toEqual(["unknown"]);
    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.sendContactMail).not.toHaveBeenCalled();
  });

  it("self-hosted behind a trusted proxy keys on the normalised first hop and still refuses when throttled", async () => {
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "1");
    mocks.allowed = false;
    const res = await postInquiry(path, { "x-forwarded-for": " 192.0.2.4 , 10.0.0.1" });
    expect(res.status).toBe(429);
    expect(mocks.inquiryKeys).toEqual(["192.0.2.4"]);
  });

  it("a garbage forwarded value is not a bucket of its own", async () => {
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "1");
    await postInquiry(path, { "x-forwarded-for": "not-an-ip-123" });
    expect(mocks.inquiryKeys).toEqual(["unknown"]);
  });
});

describe.each(CONTACT_FLOW_ROUTES)("%s — per-IP key", (_label, route) => {
  it("on Vercel, keys on Vercel's own forwarded-for, not the client's x-forwarded-for", async () => {
    vi.stubEnv("VERCEL", "1");
    await postContactFlow(route, {
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99",
    });
    expect(contactFlowKeys(route)).toEqual(["203.0.113.7"]);
  });

  it("self-hosted without the trust variable: a spoofed header is not believed — the client counts as unknown", async () => {
    await postContactFlow(route, { "x-forwarded-for": "198.51.100.1" });
    await postContactFlow(route, { "x-forwarded-for": "198.51.100.2" });
    expect(contactFlowKeys(route)).toEqual(["unknown", "unknown"]);
  });

  it("self-hosted behind a trusted proxy keys on the proxy's normalised first hop", async () => {
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "true");
    await postContactFlow(route, { "x-forwarded-for": " 192.0.2.4 , 10.0.0.1" });
    expect(contactFlowKeys(route)).toEqual(["192.0.2.4"]);
  });

  it("a throttled client gets 429 before the paid work: no model key read, no upload", async () => {
    mocks.allowed = false;
    const res = await postContactFlow(route, { "x-forwarded-for": "198.51.100.1" });
    expect(res.status).toBe(429);
    expect(contactFlowKeys(route)).toEqual(["unknown"]);
    expect(mocks.getAnthropicApiKey).not.toHaveBeenCalled();
    expect(mocks.blobPut).not.toHaveBeenCalled();
  });
});

describe("forgot-password — per-IP key", () => {
  it("on Vercel, checks both the address and the trusted IP", async () => {
    vi.stubEnv("VERCEL", "1");
    const state = await requestReset({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99",
    });
    expect(state.status).toBe("sent");
    expect(mocks.resetEmailKeys).toEqual(["kunde@example.test"]);
    expect(mocks.resetIpKeys).toEqual(["203.0.113.7"]);
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith("kunde@example.test");
  });

  it("self-hosted without the trust variable: a spoofed header is not believed — the client counts as unknown", async () => {
    await requestReset({ "x-forwarded-for": "198.51.100.1" });
    expect(mocks.resetIpKeys).toEqual(["unknown"]);
    expect(mocks.resetEmailKeys).toEqual(["kunde@example.test"]);
  });

  it("behind a trusted proxy, keys on the proxy's first hop", async () => {
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "true");
    await requestReset({ "x-forwarded-for": "192.0.2.4, 10.0.0.1" });
    expect(mocks.resetIpKeys).toEqual(["192.0.2.4"]);
  });

  it("an IP-throttled client gets the same answer, no mail, and does not touch the address's bucket", async () => {
    vi.stubEnv("VERCEL", "1");
    mocks.allowed = false;
    const state = await requestReset({ "x-vercel-forwarded-for": "203.0.113.7" });
    expect(state.status).toBe("sent");
    expect(mocks.resetIpKeys).toEqual(["203.0.113.7"]);
    expect(mocks.resetEmailKeys).toEqual([]);
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("an address-throttled request gets the same answer and no mail", async () => {
    vi.stubEnv("VERCEL", "1");
    mocks.emailAllowed = false;
    const state = await requestReset({ "x-vercel-forwarded-for": "203.0.113.7" });
    expect(state.status).toBe("sent");
    expect(mocks.resetEmailKeys).toEqual(["kunde@example.test"]);
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe("trustedClientIp — the untrusted self-hosted warning (R2/R3)", () => {
  const SELF_HOSTED = { vercel: "", trustProxyIpHeaders: "" };
  const xff = (value: string) => new Headers({ "x-forwarded-for": value });

  // The warning is production-only (a dev server takes this path on every machine).
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("outside production (pnpm dev, tests): no warning, and the once-flag stays armed for production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(trustedClientIp(xff("192.0.2.4"), SELF_HOSTED)).toBe("unknown");
    vi.stubEnv("NODE_ENV", "test");
    expect(trustedClientIp(new Headers(), SELF_HOSTED)).toBe("unknown");
    expect(warnSpy).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "production");
    trustedClientIp(xff("192.0.2.4"), SELF_HOSTED);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("self-hosted, untrusted: warns once, naming the variable, its values and the no-proxy advice, and still answers unknown", () => {
    expect(trustedClientIp(xff("192.0.2.4"), SELF_HOSTED)).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain("Self-hosted without CARTWRIGHT_TRUST_PROXY_IP_HEADERS");
    expect(message).toContain('"true" or "1"');
    expect(message).toContain("every visitor counts as one client");
    expect(message).toContain("put such a proxy in front rather than setting the variable");
  });

  it("fires once on the untrusted path even without the header — Next sets it on every request, so it says nothing about a proxy", () => {
    expect(trustedClientIp(new Headers(), SELF_HOSTED)).toBe("unknown");
    expect(trustedClientIp(new Headers(), { vercel: undefined })).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("separate copies of the module in one process share the once-flag — globalThis, not a module-level let", async () => {
    vi.resetModules();
    const first = await import("@/lib/trusted-client-ip");
    vi.resetModules();
    const second = await import("@/lib/trusted-client-ip");
    expect(second.trustedClientIp).not.toBe(first.trustedClientIp);
    expect(first.trustedClientIp(xff("192.0.2.4"), SELF_HOSTED)).toBe("unknown");
    expect(second.trustedClientIp(xff("198.51.100.7"), SELF_HOSTED)).toBe("unknown");
    expect(trustedClientIp(xff("198.51.100.8"), SELF_HOSTED)).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // …and the test reset reaches every copy, because they share the flag.
    _resetUntrustedProxyWarningForTest();
    second.trustedClientIp(xff("198.51.100.7"), SELF_HOSTED);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("a second request in the same process does not warn again", () => {
    trustedClientIp(xff("192.0.2.4"), SELF_HOSTED);
    expect(trustedClientIp(xff("198.51.100.7"), SELF_HOSTED)).toBe("unknown");
    expect(trustedClientIp(xff("198.51.100.8"), { vercel: undefined })).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("the test reset lets it fire again", () => {
    trustedClientIp(xff("192.0.2.4"), SELF_HOSTED);
    _resetUntrustedProxyWarningForTest();
    trustedClientIp(xff("192.0.2.4"), SELF_HOSTED);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("on Vercel: no warning, with or without the trust variable", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99",
    });
    expect(trustedClientIp(headers, { vercel: "1" })).toBe("203.0.113.7");
    expect(trustedClientIp(xff("198.51.100.99"), { vercel: "1", trustProxyIpHeaders: "" })).toBe(
      "198.51.100.99",
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each(["true", "1", " TRUE "])("trusted (%j): no warning", (value) => {
    expect(trustedClientIp(xff("192.0.2.4"), { vercel: "", trustProxyIpHeaders: value })).toBe(
      "192.0.2.4",
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each(["false", "0", "yes", "", " ", " \t "])(
    "refused (%j): the header is not believed, the client counts as unknown, and the warning fires",
    (value) => {
      expect(trustedClientIp(xff("192.0.2.4"), { vercel: "", trustProxyIpHeaders: value })).toBe(
        "unknown",
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("refused through the contact form too: a value other than true or 1 keeps every visitor on unknown", async () => {
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "yes");
    await postInquiry("@/app/api/inquiries/route", { "x-forwarded-for": "198.51.100.1" });
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "0");
    await postInquiry("@/app/api/inquiries/route", { "x-forwarded-for": "198.51.100.2" });
    expect(mocks.inquiryKeys).toEqual(["unknown", "unknown"]);
  });

  it("the contact form's routes, each in its own module copy as in a production build, warn once together", async () => {
    await postContactFlow("triage", { "x-forwarded-for": "198.51.100.1" });
    vi.resetModules();
    await postContactFlow("upload", { "x-forwarded-for": "198.51.100.2" });
    vi.resetModules();
    await postInquiry("@/app/api/inquiries/route", { "x-forwarded-for": "198.51.100.3" });
    vi.resetModules();
    await requestReset({ "x-forwarded-for": "198.51.100.4" });
    expect(mocks.triageKeys).toEqual(["unknown"]);
    expect(mocks.uploadKeys).toEqual(["unknown"]);
    expect(mocks.inquiryKeys).toEqual(["unknown"]);
    expect(mocks.resetIpKeys).toEqual(["unknown"]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("reads the environment by default: self-hosted with the header warns, through the contact form too", async () => {
    await postInquiry("@/app/api/inquiries/route", { "x-forwarded-for": "198.51.100.1" });
    await postInquiry("@/app/api/inquiries/route", { "x-forwarded-for": "198.51.100.2" });
    expect(mocks.inquiryKeys).toEqual(["unknown", "unknown"]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("CARTWRIGHT_TRUST_PROXY_IP_HEADERS");
  });
});
