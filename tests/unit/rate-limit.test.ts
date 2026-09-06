import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const upstashMocks = vi.hoisted(() => ({
  redisConstructor: vi.fn(),
  ratelimitConstructor: vi.fn(),
  tokenBucket: vi.fn((..._args: unknown[]) => ({ kind: "token-bucket" })),
  limit: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(config: unknown) {
      upstashMocks.redisConstructor(config);
    }
  },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static tokenBucket(...args: unknown[]) {
      return upstashMocks.tokenBucket(...args);
    }

    constructor(config: unknown) {
      upstashMocks.ratelimitConstructor(config);
    }

    limit(identifier: string) {
      return upstashMocks.limit(identifier);
    }
  },
}));

import {
  PUBLIC_AGENT_RATE_LIMIT,
  createPublicAgentRateLimiter,
  publicAgentIp,
  publicAgentPerIpLimiter,
  rateLimitHeaders,
} from "@/lib/public-agent-rate-limit";
import { createRateLimiter } from "@/lib/rate-limit";

const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  publicAgentPerIpLimiter.reset();
});

afterAll(() => {
  if (originalUpstashUrl === undefined) {
    delete process.env.UPSTASH_REDIS_REST_URL;
  } else {
    process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
  }
  if (originalUpstashToken === undefined) {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  } else {
    process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
  }
  publicAgentPerIpLimiter.reset();
});

describe("rate-limiter — token bucket", () => {
  it("tillader requests under capacity", () => {
    const lim = createRateLimiter("test", { capacity: 3, refillRate: 1 });
    expect(lim.check("ip1").allowed).toBe(true);
    expect(lim.check("ip1").allowed).toBe(true);
    expect(lim.check("ip1").allowed).toBe(true);
  });

  it("blokerer når capacity er opbrugt", () => {
    const lim = createRateLimiter("test", { capacity: 2, refillRate: 0.1 });
    expect(lim.check("ip1").allowed).toBe(true);
    expect(lim.check("ip1").allowed).toBe(true);
    const r = lim.check("ip1");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("buckets per key er uafhængige", () => {
    const lim = createRateLimiter("test", { capacity: 1, refillRate: 0.1 });
    expect(lim.check("ip1").allowed).toBe(true);
    expect(lim.check("ip1").allowed).toBe(false);
    // ip2 har stadig sin capacity
    expect(lim.check("ip2").allowed).toBe(true);
  });

  it("retryAfterSec er ca proportional med refillRate", () => {
    const lim = createRateLimiter("test", { capacity: 1, refillRate: 0.5 });
    lim.check("ip1"); // bruger op
    const r = lim.check("ip1");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBe(2); // 1 token / 0.5 per sec = 2 sek
  });

  it("reset() rydder buckets", () => {
    const lim = createRateLimiter("test", { capacity: 1, refillRate: 0.01 });
    lim.check("ip1");
    expect(lim.check("ip1").allowed).toBe(false);
    lim.reset("ip1");
    expect(lim.check("ip1").allowed).toBe(true);
  });

  it("remaining-count falder med hver request", () => {
    const lim = createRateLimiter("test", { capacity: 5, refillRate: 0.1 });
    const r1 = lim.check("ip1");
    const r2 = lim.check("ip1");
    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(3);
  });

  it("reports reset time independently from Retry-After", () => {
    const lim = createRateLimiter("test", { capacity: 3, refillRate: 1 });
    const allowed = lim.check("ip1");
    expect(allowed.retryAfterSec).toBe(0);
    expect(allowed.resetAfterSec).toBe(1);

    lim.check("ip1");
    lim.check("ip1");
    const blocked = lim.check("ip1");
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.resetAfterSec).toBeGreaterThanOrEqual(blocked.retryAfterSec);
  });
});

describe("public-agent limiter — shared async backend", () => {
  it("uses Vercel's ingress-owned header and canonicalizes valid IPs", () => {
    expect(
      publicAgentIp(
        new Headers({
          "x-vercel-forwarded-for": " 203.0.113.4 ",
          "x-forwarded-for": "198.51.100.200",
          "x-real-ip": "198.51.100.9",
        }),
        { vercel: "1" },
      ),
    ).toBe("203.0.113.4");
    expect(
      publicAgentIp(
        new Headers({
          "x-vercel-forwarded-for":
            "2001:0DB8:0000:0000:0000:ff00:0042:8329",
        }),
        { vercel: "1" },
      ),
    ).toBe("2001:db8::ff00:42:8329");
  });

  it("does not trust client-supplied forwarding headers when self-hosted by default", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.4",
      "x-forwarded-for": "198.51.100.9, 10.0.0.2",
      "x-real-ip": "192.0.2.7",
    });

    expect(publicAgentIp(headers, {})).toBe("unknown");
    expect(
      publicAgentIp(headers, { trustProxyIpHeaders: "true" }),
    ).toBe("198.51.100.9");
  });

  it("collapses malformed or oversized proxy values into one bounded bucket", () => {
    const trusted = { trustProxyIpHeaders: "1" };

    expect(
      publicAgentIp(
        new Headers({ "x-forwarded-for": "attacker-controlled" }),
        trusted,
      ),
    ).toBe("unknown");
    expect(
      publicAgentIp(
        new Headers({ "x-forwarded-for": `${"9".repeat(300)}, 203.0.113.4` }),
        trusted,
      ),
    ).toBe("unknown");
    expect(publicAgentIp(new Headers(), trusted)).toBe("unknown");
  });

  it("uses the in-memory token bucket when Upstash is not fully configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://stub.upstash.test";

    const first = await publicAgentPerIpLimiter.check("203.0.113.10");
    const second = await publicAgentPerIpLimiter.check("203.0.113.10");

    expect(first).toMatchObject({ allowed: true, remaining: 59 });
    expect(second).toMatchObject({ allowed: true, remaining: 58 });
    expect(upstashMocks.redisConstructor).not.toHaveBeenCalled();
    expect(upstashMocks.limit).not.toHaveBeenCalled();
  });

  it("uses the matching distributed token bucket when both Upstash values exist", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://stub.upstash.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "stub-token";
    publicAgentPerIpLimiter.reset();
    upstashMocks.limit.mockResolvedValue({
      success: true,
      limit: PUBLIC_AGENT_RATE_LIMIT,
      remaining: 41,
      reset: Date.now() + 15_000,
    });

    const result = await publicAgentPerIpLimiter.check("203.0.113.11");

    expect(upstashMocks.redisConstructor).toHaveBeenCalledWith({
      url: "https://stub.upstash.test",
      token: "stub-token",
    });
    expect(upstashMocks.tokenBucket).toHaveBeenCalledWith(
      1,
      "1 s",
      PUBLIC_AGENT_RATE_LIMIT,
    );
    expect(upstashMocks.ratelimitConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "cartwright:public-agent-api",
        analytics: false,
        timeout: 1_500,
      }),
    );
    expect(upstashMocks.limit).toHaveBeenCalledWith("203.0.113.11");
    expect(result).toMatchObject({
      allowed: true,
      remaining: 41,
      retryAfterSec: 0,
    });
    expect(result.resetAfterSec).toBeGreaterThan(0);
  });

  it("uses the consumed local shadow during a distributed failure and cools down retries", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://stub.upstash.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "stub-token";
    publicAgentPerIpLimiter.reset();
    upstashMocks.limit.mockRejectedValue(new Error("redis unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await publicAgentPerIpLimiter.check("203.0.113.12");
    const second = await publicAgentPerIpLimiter.check("203.0.113.12");

    expect(first).toMatchObject({ allowed: true, remaining: 59 });
    expect(second).toMatchObject({ allowed: true, remaining: 58 });
    expect(upstashMocks.limit).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).not.toContain("stub-token");
    errorSpy.mockRestore();
  });

  it("treats the SDK's fail-open timeout response as a backend failure", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://stub.upstash.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "stub-token";
    publicAgentPerIpLimiter.reset();
    upstashMocks.limit.mockResolvedValue({
      success: true,
      limit: PUBLIC_AGENT_RATE_LIMIT,
      remaining: PUBLIC_AGENT_RATE_LIMIT,
      reset: Date.now() + 1_000,
      reason: "timeout",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await publicAgentPerIpLimiter.check("203.0.113.13");

    expect(result).toMatchObject({ allowed: true, remaining: 59 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("normalizes a distributed rejection into retry and reset metadata", async () => {
    const distributed = {
      limit: vi.fn(async () => ({
        success: false,
        limit: PUBLIC_AGENT_RATE_LIMIT,
        remaining: 0,
        reset: Date.now() + 5_000,
      })),
    };
    const limiter = createPublicAgentRateLimiter(() => distributed);

    const result = await limiter.check("203.0.113.16");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(4);
    expect(result.resetAfterSec).toBe(PUBLIC_AGENT_RATE_LIMIT);
    expect(result.resetAfterSec).toBeGreaterThanOrEqual(result.retryAfterSec);
  });

  it("keeps a stricter exhausted local shadow if distributed state was reset", async () => {
    const distributed = {
      limit: vi.fn(async () => ({
        success: true,
        limit: PUBLIC_AGENT_RATE_LIMIT,
        remaining: PUBLIC_AGENT_RATE_LIMIT - 1,
        reset: Date.now() + 1_000,
      })),
    };
    const limiter = createPublicAgentRateLimiter(() => distributed);

    for (
      let requestNumber = 0;
      requestNumber < PUBLIC_AGENT_RATE_LIMIT;
      requestNumber += 1
    ) {
      expect((await limiter.check("203.0.113.14")).allowed).toBe(true);
    }
    const blocked = await limiter.check("203.0.113.14");

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("emits the complete public-agent header contract", async () => {
    const result = await publicAgentPerIpLimiter.check("203.0.113.15");

    expect(rateLimitHeaders(result)).toEqual({
      "RateLimit-Policy": '"public-agent";q=60;w=60',
      "RateLimit": '"public-agent";r=59;t=1',
      "RateLimit-Limit": "60",
      "RateLimit-Remaining": "59",
      "RateLimit-Reset": "1",
    });
  });
});
