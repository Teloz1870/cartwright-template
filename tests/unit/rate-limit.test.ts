import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

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

});
