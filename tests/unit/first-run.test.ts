import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIRST IMPRESSION Part 1 — shouldShowWelcomeCanvas() truth table.
 *
 * The welcome canvas may ONLY render on a truly untouched scaffold. Every leg
 * of the predicate is asserted to flip it off independently, and the flag
 * check is asserted to short-circuit BEFORE any DB access (the canary-safety
 * invariant: engine default `firstRunWelcome: false` ⇒ zero behavior change).
 */

const mocks = vi.hoisted(() => ({
  features: { firstRunWelcome: true },
  runtime: { value: { firstRunWelcome: true } as { firstRunWelcome: boolean } | null },
  prisma: {
    brandingSettings: { findUnique: vi.fn() },
    product: { count: vi.fn() },
  },
  getFeatures: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/brand.config", () => ({ brand: { features: mocks.features } }));
vi.mock("@/lib/brand", () => ({ getFeatures: mocks.getFeatures }));

import { shouldShowWelcomeCanvas } from "@/lib/first-run";

/** A fully untouched site (every leg green). */
const FRESH_SETTINGS = {
  setupComplete: false,
  designSlug: null,
  websiteHeadline: null,
  tagline: null,
  heroCta: null,
};

beforeEach(() => {
  mocks.features.firstRunWelcome = true;
  mocks.runtime.value = { firstRunWelcome: true };
  mocks.getFeatures.mockReset();
  mocks.getFeatures.mockImplementation(async () => {
    if (!mocks.runtime.value) throw new Error("db unreachable");
    return mocks.runtime.value;
  });
  mocks.prisma.brandingSettings.findUnique.mockReset();
  mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ setupComplete: false });
  mocks.prisma.product.count.mockReset();
  mocks.prisma.product.count.mockResolvedValue(0);
});

describe("shouldShowWelcomeCanvas — truth table", () => {
  it("untouched scaffold → true", async () => {
    await expect(shouldShowWelcomeCanvas(FRESH_SETTINGS, null)).resolves.toBe(true);
  });

  it("null settings + null homePage (no DB row yet) → true", async () => {
    await expect(shouldShowWelcomeCanvas(null, null)).resolves.toBe(true);
  });

  it("flag off → false, and short-circuits BEFORE any DB call", async () => {
    mocks.features.firstRunWelcome = false;
    await expect(shouldShowWelcomeCanvas(FRESH_SETTINGS, null)).resolves.toBe(false);
    expect(mocks.getFeatures).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.product.count).not.toHaveBeenCalled();
  });

  it("published vibe homepage → false", async () => {
    await expect(
      shouldShowWelcomeCanvas(FRESH_SETTINGS, { vibeHtml: "<h1>custom</h1>" }),
    ).resolves.toBe(false);
  });

  it("setup completed (passed settings) → false", async () => {
    await expect(
      shouldShowWelcomeCanvas({ ...FRESH_SETTINGS, setupComplete: true }, null),
    ).resolves.toBe(false);
  });

  it("design explicitly chosen → false", async () => {
    await expect(
      shouldShowWelcomeCanvas({ ...FRESH_SETTINGS, designSlug: "apex" }, null),
    ).resolves.toBe(false);
  });

  it.each(["websiteHeadline", "tagline", "heroCta"] as const)(
    "hero copy set (%s) → false",
    async (field) => {
      await expect(
        shouldShowWelcomeCanvas({ ...FRESH_SETTINGS, [field]: "Mine!" }, null),
      ).resolves.toBe(false);
    },
  );

  it("runtime override off (/admin/features) → false", async () => {
    mocks.runtime.value = { firstRunWelcome: false };
    await expect(shouldShowWelcomeCanvas(FRESH_SETTINGS, null)).resolves.toBe(false);
    expect(mocks.prisma.product.count).not.toHaveBeenCalled();
  });

  it("setup completed in DB (stale caller data) → false", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ setupComplete: true });
    await expect(shouldShowWelcomeCanvas(FRESH_SETTINGS, null)).resolves.toBe(false);
  });

  it("products exist → false", async () => {
    mocks.prisma.product.count.mockResolvedValue(3);
    await expect(shouldShowWelcomeCanvas(FRESH_SETTINGS, null)).resolves.toBe(false);
  });

  it("DB error on product count → false (fail-soft: don't show)", async () => {
    mocks.prisma.product.count.mockRejectedValue(new Error("db down"));
    await expect(shouldShowWelcomeCanvas(FRESH_SETTINGS, null)).resolves.toBe(false);
  });

  it("getFeatures() failure falls back to the compile-time flag → true", async () => {
    mocks.runtime.value = null; // getFeatures throws
    await expect(shouldShowWelcomeCanvas(FRESH_SETTINGS, null)).resolves.toBe(true);
  });
});

describe("welcome canvas messages — locale parity", () => {
  const root = join(__dirname, "..", "..");
  const en = JSON.parse(readFileSync(join(root, "messages", "en.json"), "utf8"));
  const da = JSON.parse(readFileSync(join(root, "messages", "da.json"), "utf8"));

  it("Welcome namespace exists with identical keys in en + da", () => {
    expect(en.Welcome).toBeDefined();
    expect(da.Welcome).toBeDefined();
    expect(Object.keys(da.Welcome).sort()).toEqual(Object.keys(en.Welcome).sort());
  });

  it("core welcome copy is present (English-first wording)", () => {
    expect(en.Welcome.eyebrow).toBe("Powered by Cartwright");
    expect(en.Welcome.headline).toBe("Your site was just born.");
    expect(en.Welcome.setupHint).toContain("{email}");
    expect(da.Welcome.setupHint).toContain("{email}");
  });

  it("Footer.ownedBy exists in both locales — da value reproduces the previous hardcoded render", () => {
    // Canary safety: with engine defaults the da footer line must stay
    // character-identical to the old hardcoded "Ejet og drevet af".
    expect(da.Footer.ownedBy).toBe("Ejet og drevet af");
    expect(en.Footer.ownedBy).toBe("Owned and operated by");
  });
});
