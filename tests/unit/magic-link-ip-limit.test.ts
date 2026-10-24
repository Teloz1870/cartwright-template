import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * MAGICLINK-IP-DEAD: magic-link requests are capped per client IP as well as
 * per address. The IP is the one trustedClientIp resolves, under the AUTH-REG1
 * rule: an "unknown" client (self-hosted without
 * CARTWRIGHT_TRUST_PROXY_IP_HEADERS) skips the per-IP limit rather than share
 * one bucket with every customer. A throttled client is sent nothing, and its
 * request resolves exactly like a sent one, so Auth.js answers "check your
 * inbox" either way; the drop is logged without the address or the IP.
 *
 * The real lib/auth.ts provider runs; NextAuth is a stub that hands back the
 * config, the mailer is a spy, the limiters and trustedClientIp are real.
 */

const mocks = vi.hoisted(() => ({
  config: null as null | { providers: Array<Record<string, unknown>> },
  sent: [] as string[],
}));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/mailer", () => ({
  sendMagicLinkEmail: async ({ email }: { email: string }) => {
    mocks.sent.push(email);
  },
}));
vi.mock("next-auth", () => ({
  default: (config: { providers: Array<Record<string, unknown>> }) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

import "@/lib/auth";
import { magicLinkPerEmailLimiter, magicLinkPerIpLimiter } from "@/lib/rate-limit";

/** magicLinkPerIpLimiter's burst (lib/rate-limit.ts). */
const IP_BURST = 10;

let clientHeaders: Record<string, string> = {};

function onVercelFrom(ip: string) {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "");
  clientHeaders = { "x-vercel-forwarded-for": ip };
}

/** What Auth.js calls for one "email me a link" request. */
function requestLink(email: string): Promise<void> {
  const provider = mocks.config!.providers.find((p) => p.id === "email") as {
    sendVerificationRequest: (params: {
      identifier: string;
      url: string;
      request: Request;
    }) => Promise<void>;
  };
  return provider.sendVerificationRequest({
    identifier: email,
    url: "https://shop.test/api/auth/callback/email?token=t",
    request: new Request("https://shop.test/api/auth/signin/email", {
      method: "POST",
      headers: clientHeaders,
    }),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  magicLinkPerIpLimiter.reset();
  magicLinkPerEmailLimiter.reset();
  mocks.sent.length = 0;
  onVercelFrom("203.0.113.7");
});

describe("magic link — per client IP", () => {
  it("past the burst one client is sent nothing, and its request resolves like a sent one", async () => {
    for (let i = 0; i < IP_BURST; i++) await requestLink(`c${i}@example.com`);
    expect(mocks.sent).toHaveLength(IP_BURST);

    await expect(requestLink("one-more@example.com")).resolves.toBeUndefined();
    expect(mocks.sent).toHaveLength(IP_BURST);
    expect(mocks.sent).not.toContain("one-more@example.com");
  });

  it("a dropped send is logged for the operator, without the address or the IP", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (let i = 0; i < IP_BURST; i++) await requestLink(`c${i}@example.com`);
      expect(warn).not.toHaveBeenCalled();

      await requestLink("one-more@example.com");
      expect(warn).toHaveBeenCalledTimes(1);
      const line = warn.mock.calls[0].map(String).join(" ");
      expect(line).toMatch(/magic link not sent/i);
      expect(line).not.toContain("one-more@example.com");
      expect(line).not.toContain("203.0.113.7");
    } finally {
      warn.mockRestore();
    }
  });

  it("another client still gets its link", async () => {
    for (let i = 0; i < IP_BURST + 2; i++) await requestLink(`c${i}@example.com`);
    onVercelFrom("198.51.100.9");
    await requestLink("someone@example.com");
    expect(mocks.sent).toContain("someone@example.com");
  });

  it("a throttled client does not use up the address's own budget", async () => {
    for (let i = 0; i < IP_BURST; i++) await requestLink(`c${i}@example.com`);
    for (let i = 0; i < 5; i++) await requestLink("victim@example.com");
    expect(mocks.sent).not.toContain("victim@example.com");

    onVercelFrom("198.51.100.9");
    await requestLink("victim@example.com");
    expect(mocks.sent).toContain("victim@example.com");
  });

  it("self-hosted without a trusted proxy: no per-IP limit, so customers are not throttled shop-wide", async () => {
    vi.stubEnv("VERCEL", "");
    // One forwarded address throughout: the header is not trusted here, so it
    // must not become a bucket of its own, and neither may "unknown".
    clientHeaders = { "x-forwarded-for": "198.51.100.1" };
    const many = IP_BURST + 5;
    for (let i = 0; i < many; i++) await requestLink(`s${i}@example.com`);
    expect(mocks.sent).toHaveLength(many);
  });

  it("self-hosted behind a proxy the operator trusts: the limit applies", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "1");
    clientHeaders = { "x-forwarded-for": "192.0.2.44" };
    for (let i = 0; i < IP_BURST + 1; i++) await requestLink(`t${i}@example.com`);
    expect(mocks.sent).toHaveLength(IP_BURST);
  });

  it("the per-address limit still applies on its own", async () => {
    for (let i = 0; i < 3; i++) {
      onVercelFrom(`192.0.2.${i}`);
      await requestLink("ada@example.com");
    }
    onVercelFrom("192.0.2.99");
    await expect(requestLink("ada@example.com")).rejects.toThrow(/too many/i);
    expect(mocks.sent).toHaveLength(3);
  });
});
