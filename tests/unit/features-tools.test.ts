import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Feature-flag tools (`lib/tools/features.ts`) — the admin/agent surface that
 * reads and flips runtime feature flags. `features.get` is a read-only projection
 * of the resolved feature view; `features.set` is the ONLY sanctioned live-toggle
 * path (used in onboarding — "Your first 10 minutes" calls it to turn on
 * `genomeResolve`). Both scopes live in ADMIN_CHAT_SCOPES but NOT
 * CUSTOMER_CHAT_SCOPES, so a storefront shopper can never reach them.
 *
 * `features.set` is a THIN wrapper: it delegates the write + audit + allowlist +
 * dependency validation to the shared `applyFeatureOverride` (one code-path with
 * the /admin/features server action), and only adds the zod input contract on top:
 *   - `key` is a `z.enum` built from the REAL `RUNTIME_TOGGLEABLE_KEYS` manifest
 *     allowlist, so a compile-time / identity flag is rejected at the schema,
 *   - `enabled` must be a boolean, `confirm` must be the literal `true`,
 *   - a `{ ok:false, error }` from the shared core is re-thrown as an `Error` so the
 *     AI gets a clear message (rejected toggles are NOT silently swallowed),
 *   - a `{ ok:true, ... }` is returned verbatim.
 *
 * This suite pins that wiring. The manifest is kept REAL (the enum IS the live
 * runtime allowlist); only the shared core (`applyFeatureOverride`) and the read
 * view (`getFeatureView`) are mocked, so no DB / real toggle runs.
 *
 * Runtime keys used: `reviews`, `wishlist`, `blog` (tier "runtime"). Compile-time
 * keys used for the enum-rejection cases: `webshop`, `motionEffects`,
 * `consentBanner` (tier "compile-time" — valid FeatureKeys, but NOT in the
 * runtime allowlist).
 */

const mocks = vi.hoisted(() => ({
  applyFeatureOverride: vi.fn(),
  getFeatureView: vi.fn(),
}));

vi.mock("@/lib/feature-flags/apply", () => ({
  applyFeatureOverride: mocks.applyFeatureOverride,
}));
vi.mock("@/lib/feature-flags/status", () => ({
  getFeatureView: mocks.getFeatureView,
}));

const ctx = {
  actor: "apikey:k1",
  ip: "10.0.0.9",
  userAgent: "agent/1.0",
} as never;

beforeEach(() => {
  vi.resetModules();
  mocks.applyFeatureOverride.mockReset();
  mocks.getFeatureView.mockReset();
});

describe("features.set — live feature toggle", () => {
  it("threads key + enabled + ctx.actor verbatim into applyFeatureOverride and returns its ok result", async () => {
    const okResult = { ok: true, key: "reviews", enabled: true, reset: false };
    mocks.applyFeatureOverride.mockResolvedValue(okResult);
    const { setFeatureTool } = await import("@/lib/tools/features");

    const r = await setFeatureTool.handler(
      { key: "reviews", enabled: true, confirm: true },
      ctx,
    );

    // returned verbatim — the tool adds nothing to a successful ApplyResult
    expect(r).toBe(okResult);
    expect(mocks.applyFeatureOverride).toHaveBeenCalledTimes(1);
    // exact positional threading: (key, enabled, actor) — NOT the ctx object, NOT confirm
    expect(mocks.applyFeatureOverride).toHaveBeenCalledWith("reviews", true, "apikey:k1");
  });

  it("threads a disable (enabled:false) through unchanged", async () => {
    const okResult = { ok: true, key: "wishlist", enabled: false, reset: true };
    mocks.applyFeatureOverride.mockResolvedValue(okResult);
    const { setFeatureTool } = await import("@/lib/tools/features");

    const r = await setFeatureTool.handler(
      { key: "wishlist", enabled: false, confirm: true },
      ctx,
    );

    expect(r).toBe(okResult);
    expect(mocks.applyFeatureOverride).toHaveBeenCalledWith("wishlist", false, "apikey:k1");
  });

  it("re-throws the shared core's error message when the toggle is rejected (dependency/precondition) and does not swallow it", async () => {
    // The exact message the shared core would return for THIS key's rejection —
    // key-consistent so the assertion reads as a real `blog` rejection, not a
    // cross-feature copy. The tool must surface the core's message verbatim.
    const coreError = "'Blog' kan ikke aktiveres endnu (precondition ikke opfyldt).";
    mocks.applyFeatureOverride.mockResolvedValue({ ok: false, error: coreError });
    const { setFeatureTool } = await import("@/lib/tools/features");

    await expect(
      setFeatureTool.handler({ key: "blog", enabled: true, confirm: true }, ctx),
    ).rejects.toThrow(coreError);
    // the write path WAS attempted (the rejection came from the shared core, not the schema)
    expect(mocks.applyFeatureOverride).toHaveBeenCalledTimes(1);
  });

  it("declares the write scope + revertible, and does NOT skipAudit (the shared core owns the audit)", async () => {
    const { setFeatureTool } = await import("@/lib/tools/features");
    expect(setFeatureTool.name).toBe("features.set");
    expect(setFeatureTool.scope).toBe("features:write");
    expect(setFeatureTool.revertible).toBe(true);
    // audit is written INSIDE applyFeatureOverride's withAudit, so the tool must
    // not carry skipAudit (which would read as "read-only" to the framework).
    expect(setFeatureTool.skipAudit).toBeFalsy();
  });
});

describe("features.set — input schema (the zod contract the tool adds)", () => {
  it("accepts a real runtime-toggleable key with confirm:true", async () => {
    const { setFeatureTool } = await import("@/lib/tools/features");
    for (const key of ["reviews", "wishlist", "blog"]) {
      expect(
        setFeatureTool.input.safeParse({ key, enabled: true, confirm: true }).success,
      ).toBe(true);
    }
  });

  it("rejects compile-time / identity flags — the enum IS the runtime allowlist, not all features", async () => {
    const { setFeatureTool } = await import("@/lib/tools/features");
    // valid FeatureKeys, but tier "compile-time" ⇒ absent from RUNTIME_TOGGLEABLE_KEYS
    for (const key of ["webshop", "motionEffects", "consentBanner"]) {
      expect(
        setFeatureTool.input.safeParse({ key, enabled: true, confirm: true }).success,
      ).toBe(false);
    }
  });

  it("rejects an entirely unknown key", async () => {
    const { setFeatureTool } = await import("@/lib/tools/features");
    expect(
      setFeatureTool.input.safeParse({ key: "definitely-not-a-flag", enabled: true, confirm: true })
        .success,
    ).toBe(false);
  });

  it("requires confirm to be the literal true (false and absent are rejected)", async () => {
    const { setFeatureTool } = await import("@/lib/tools/features");
    expect(
      setFeatureTool.input.safeParse({ key: "reviews", enabled: true, confirm: false }).success,
    ).toBe(false);
    expect(
      setFeatureTool.input.safeParse({ key: "reviews", enabled: true }).success,
    ).toBe(false);
  });

  it("requires enabled to be a boolean", async () => {
    const { setFeatureTool } = await import("@/lib/tools/features");
    expect(
      setFeatureTool.input.safeParse({ key: "reviews", enabled: "yes", confirm: true }).success,
    ).toBe(false);
    expect(
      setFeatureTool.input.safeParse({ key: "reviews", confirm: true }).success,
    ).toBe(false);
  });
});

describe("features.get — read-only feature view", () => {
  it("returns getFeatureView() output verbatim and is a read tool (skipAudit)", async () => {
    const view = {
      identity: { storeName: "Cartwright", mode: "website" },
      features: [{ key: "reviews", enabled: false, tier: "runtime", toggleable: true }],
    };
    mocks.getFeatureView.mockResolvedValue(view);
    const { getFeaturesTool } = await import("@/lib/tools/features");

    const r = await getFeaturesTool.handler({}, ctx);

    expect(r).toBe(view);
    expect(mocks.getFeatureView).toHaveBeenCalledTimes(1);
    // read tool: never toggles, never writes audit noise
    expect(getFeaturesTool.name).toBe("features.get");
    expect(getFeaturesTool.scope).toBe("features:read");
    expect(getFeaturesTool.skipAudit).toBe(true);
    // the read tool must NOT reach the write path
    expect(mocks.applyFeatureOverride).not.toHaveBeenCalled();
  });

  it("takes an empty input object", async () => {
    const { getFeaturesTool } = await import("@/lib/tools/features");
    expect(getFeaturesTool.input.safeParse({}).success).toBe(true);
  });
});
