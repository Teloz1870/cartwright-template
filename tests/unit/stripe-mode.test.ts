import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, decryptSecret } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  decryptSecret: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { integrationSettings: { findUnique } } }));
vi.mock("@/lib/secret-encryption", () => ({ decryptSecret }));

const stored = {
  stripeSecretKey: "enc-s",
  stripePublishableKey: "enc-p",
  stripeWebhookSecret: "enc-w",
};

async function freshStripe() {
  vi.resetModules();
  return import("@/lib/stripe");
}

beforeEach(() => {
  findUnique.mockReset();
  decryptSecret.mockReset();
  decryptSecret.mockImplementation((value: string) => `plain-${value}`);
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
});

describe("getStripeMode: only a shop with provably no keys may use mock payment", () => {
  it("no row and no env keys is none", async () => {
    findUnique.mockResolvedValue(null);
    const { getStripeMode, isStripeReady } = await freshStripe();
    expect(await getStripeMode()).toBe("none");
    expect(await isStripeReady()).toBe(false);
  });

  it("a row with empty columns is none", async () => {
    findUnique.mockResolvedValue({
      stripeSecretKey: null,
      stripePublishableKey: "",
      stripeWebhookSecret: null,
    });
    const { getStripeMode } = await freshStripe();
    expect(await getStripeMode()).toBe("none");
  });

  it("three readable keys is stripe", async () => {
    findUnique.mockResolvedValue(stored);
    const { getStripeKeys, getStripeMode } = await freshStripe();
    expect(await getStripeMode()).toBe("stripe");
    expect((await getStripeKeys())?.secretKey).toBe("plain-enc-s");
  });

  it("stored keys that cannot be decrypted are unavailable", async () => {
    findUnique.mockResolvedValue(stored);
    decryptSecret.mockReturnValue(null);
    const { getStripeMode, isStripeReady } = await freshStripe();
    expect(await getStripeMode()).toBe("unavailable");
    expect(await isStripeReady()).toBe(false);
  });

  it("one key of three that cannot be decrypted is unavailable", async () => {
    findUnique.mockResolvedValue(stored);
    decryptSecret.mockImplementation((value: string) => (value === "enc-w" ? null : value));
    const { getStripeMode } = await freshStripe();
    expect(await getStripeMode()).toBe("unavailable");
  });

  it("a database that cannot be read is unavailable", async () => {
    findUnique.mockRejectedValue(new Error("connection refused"));
    const { getStripeMode } = await freshStripe();
    expect(await getStripeMode()).toBe("unavailable");
  });

  it("a database that cannot be read still uses three env keys", async () => {
    findUnique.mockRejectedValue(new Error("connection refused"));
    vi.stubEnv("STRIPE_SECRET_KEY", "sk");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "wh");
    const { getStripeMode } = await freshStripe();
    expect(await getStripeMode()).toBe("stripe");
  });

  it("only some env keys is unavailable", async () => {
    findUnique.mockResolvedValue(null);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk");
    const { getStripeMode } = await freshStripe();
    expect(await getStripeMode()).toBe("unavailable");
  });

  it("a failure is not cached, so the next read can recover", async () => {
    findUnique.mockRejectedValueOnce(new Error("blip")).mockResolvedValue(stored);
    const { getStripeMode } = await freshStripe();
    expect(await getStripeMode()).toBe("unavailable");
    expect(await getStripeMode()).toBe("stripe");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("a good answer is cached", async () => {
    findUnique.mockResolvedValue(null);
    const { getStripeMode } = await freshStripe();
    await getStripeMode();
    await getStripeMode();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
