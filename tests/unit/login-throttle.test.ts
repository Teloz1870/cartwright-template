import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLoginAttempt,
  normalizeIp,
  ipFromRequest,
} from "@/lib/auth/login-throttle";
import { loginPerEmailLimiter, loginPerIpLimiter } from "@/lib/rate-limit";

/**
 * Login brute-force throttle (parity-audit gap #3). Verifies that repeated
 * attempts against one account (or from one IP) eventually get blocked, that
 * the two axes are independent, and that key normalization holds.
 */
describe("login brute-force throttle", () => {
  beforeEach(() => {
    loginPerEmailLimiter.reset();
    loginPerIpLimiter.reset();
  });

  it("allows the first burst then blocks once the per-email bucket drains", () => {
    const attempt = () =>
      checkLoginAttempt({ email: "victim@example.com", ip: "10.0.0.1" });

    // per-email capacity is 5; per-IP is 10 — email is the tighter axis here.
    const results = Array.from({ length: 6 }, attempt);
    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBe(5);
    expect(results[5].allowed).toBe(false);
    expect(results[5].retryAfterSec).toBeGreaterThan(0);
  });

  it("blocks a single noisy IP spreading across many accounts (per-IP axis)", () => {
    // Different email each time so the per-email bucket never drains; only the
    // per-IP bucket (capacity 10) can stop this credential-stuffing pattern.
    const results = Array.from({ length: 11 }, (_, i) =>
      checkLoginAttempt({ email: `user${i}@example.com`, ip: "203.0.113.9" }),
    );
    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBe(10);
    expect(results[10].allowed).toBe(false);
  });

  it("keeps the two axes independent (a blocked email doesn't block other IPs)", () => {
    // Drain victim@'s email bucket from one IP.
    for (let i = 0; i < 5; i++) {
      checkLoginAttempt({ email: "victim@example.com", ip: "10.0.0.1" });
    }
    const blocked = checkLoginAttempt({
      email: "victim@example.com",
      ip: "10.0.0.1",
    });
    expect(blocked.allowed).toBe(false);

    // A DIFFERENT account from a DIFFERENT IP is unaffected.
    const other = checkLoginAttempt({
      email: "someone@example.com",
      ip: "10.0.0.2",
    });
    expect(other.allowed).toBe(true);
  });

  it("normalizes email case/whitespace into the same bucket", () => {
    for (let i = 0; i < 5; i++) {
      checkLoginAttempt({ email: "Admin@Example.com", ip: "1.1.1.1" });
    }
    // Same account, different casing + trailing space → must hit same bucket.
    const blocked = checkLoginAttempt({
      email: "  admin@example.com ",
      ip: "9.9.9.9", // fresh IP so only the email axis can block
    });
    expect(blocked.allowed).toBe(false);
  });

  it("normalizeIp takes the first hop of an x-forwarded-for chain", () => {
    expect(normalizeIp("203.0.113.1, 70.41.3.18, 150.172.238.178")).toBe(
      "203.0.113.1",
    );
    expect(normalizeIp(" 198.51.100.7 ")).toBe("198.51.100.7");
    expect(normalizeIp(null)).toBe("");
    expect(normalizeIp(undefined)).toBe("");
  });

  it("ipFromRequest reads x-forwarded-for off the Request headers", () => {
    const req = new Request("https://shop.example/api/auth", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    expect(ipFromRequest(req)).toBe("203.0.113.5");
    expect(ipFromRequest(undefined)).toBeNull();
    expect(ipFromRequest({})).toBeNull();
  });
});
