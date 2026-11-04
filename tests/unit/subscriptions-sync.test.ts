import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * State-machine regression for syncStripeSubscription (lib/subscriptions.ts) —
 * kører på HVERT live subscription-webhook og havde nul tests.
 *
 * Dækker: create-vs-update, userId-resolution (existing > metadata > fallback),
 * pause_collection → 'paused', terminal statuser, customer/periode-fallbacks
 * og feature-gaten.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
  // Flippes af feature-gate-testen; getter i brand-mocken læser den live.
  subscriptionsEnabled: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/brand.config", () => ({
  brand: {
    ecommerceEnabled: true,
    get features() {
      return { subscriptions: mocks.subscriptionsEnabled, webshop: true };
    },
  },
}));

import { syncStripeSubscription } from "@/lib/subscriptions";

import type Stripe from "stripe";

/** Minimal Stripe.Subscription-shape med fornuftige defaults. */
function makeSub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_test_1",
    status: "active",
    metadata: { userId: "user_meta" },
    customer: "cus_123",
    cancel_at_period_end: false,
    current_period_end: 1_750_000_000,
    pause_collection: null,
    items: {
      data: [
        { price: { id: "price_basic" }, current_period_end: 1_749_000_000 },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("syncStripeSubscription state-machine", () => {
  beforeEach(() => {
    mocks.prisma.subscription.findUnique.mockReset();
    mocks.prisma.subscription.update.mockReset();
    mocks.prisma.subscription.create.mockReset();
    mocks.subscriptionsEnabled = true;
    mocks.prisma.subscription.findUnique.mockResolvedValue(null);
    mocks.prisma.subscription.create.mockImplementation(async (args) => args.data);
    mocks.prisma.subscription.update.mockImplementation(async (args) => args.data);
  });

  it("opretter ny række når ingen lokal subscription findes", async () => {
    await syncStripeSubscription(makeSub());

    expect(mocks.prisma.subscription.update).not.toHaveBeenCalled();
    expect(mocks.prisma.subscription.create).toHaveBeenCalledWith({
      data: {
        userId: "user_meta",
        stripeSubId: "sub_test_1",
        stripeCustomerId: "cus_123",
        stripePriceId: "price_basic",
        status: "active",
        currentPeriodEnd: new Date(1_750_000_000 * 1000),
        cancelAtPeriodEnd: false,
        pauseCollectionBehavior: null,
      },
    });
  });

  it("opdaterer eksisterende række — og bevarer den eksisterende userId", async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      id: "local_1",
      userId: "user_existing",
    });

    await syncStripeSubscription(
      makeSub({ metadata: { userId: "user_attacker" } }),
    );

    expect(mocks.prisma.subscription.create).not.toHaveBeenCalled();
    expect(mocks.prisma.subscription.update).toHaveBeenCalledTimes(1);
    const updateArgs = mocks.prisma.subscription.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ stripeSubId: "sub_test_1" });
    // update-payloaden må ikke kunne re-assigne ejerskab
    expect(updateArgs.data).not.toHaveProperty("userId");
  });

  it("bruger fallbackUserId når metadata.userId mangler", async () => {
    await syncStripeSubscription(makeSub({ metadata: {} }), {
      fallbackUserId: "user_fallback",
    });

    expect(mocks.prisma.subscription.create).toHaveBeenCalledTimes(1);
    expect(
      mocks.prisma.subscription.create.mock.calls[0][0].data.userId,
    ).toBe("user_fallback");
  });

  it("returnerer null og skriver INTET når userId ikke kan afgøres", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await syncStripeSubscription(makeSub({ metadata: {} }));

    expect(result).toBeNull();
    expect(mocks.prisma.subscription.create).not.toHaveBeenCalled();
    expect(mocks.prisma.subscription.update).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("pause_collection mapper status → 'paused' og persisterer behavior", async () => {
    await syncStripeSubscription(
      makeSub({ pause_collection: { behavior: "keep_as_draft" } }),
    );

    const data = mocks.prisma.subscription.create.mock.calls[0][0].data;
    expect(data.status).toBe("paused");
    expect(data.pauseCollectionBehavior).toBe("keep_as_draft");
  });

  it.each(["canceled", "incomplete_expired"])(
    "terminal status '%s' bevares — også med pause_collection sat",
    async (status) => {
      await syncStripeSubscription(
        makeSub({ status, pause_collection: { behavior: "void" } }),
      );

      const data = mocks.prisma.subscription.create.mock.calls[0][0].data;
      expect(data.status).toBe(status);
    },
  );

  it("expanded customer-objekt → bruger .id; manglende customer → fallback → 'unknown'", async () => {
    await syncStripeSubscription(makeSub({ customer: { id: "cus_expanded" } }));
    expect(
      mocks.prisma.subscription.create.mock.calls[0][0].data.stripeCustomerId,
    ).toBe("cus_expanded");

    await syncStripeSubscription(makeSub({ customer: null }), {
      fallbackCustomerId: "cus_fallback",
    });
    expect(
      mocks.prisma.subscription.create.mock.calls[1][0].data.stripeCustomerId,
    ).toBe("cus_fallback");

    await syncStripeSubscription(makeSub({ customer: null }));
    expect(
      mocks.prisma.subscription.create.mock.calls[2][0].data.stripeCustomerId,
    ).toBe("unknown");
  });

  it("currentPeriodEnd falder tilbage til item-niveau når toplevel mangler", async () => {
    await syncStripeSubscription(makeSub({ current_period_end: undefined }));

    expect(
      mocks.prisma.subscription.create.mock.calls[0][0].data.currentPeriodEnd,
    ).toEqual(new Date(1_749_000_000 * 1000));
  });

  it("stripePriceId falder tilbage til 'unknown' uden items", async () => {
    await syncStripeSubscription(makeSub({ items: { data: [] } }));

    const data = mocks.prisma.subscription.create.mock.calls[0][0].data;
    expect(data.stripePriceId).toBe("unknown");
    // toplevel current_period_end er stadig sat — den må ikke vælte på tomme items
    expect(data.currentPeriodEnd).toEqual(new Date(1_750_000_000 * 1000));
  });

  it("kaster når subscriptions-featuren er slået fra", async () => {
    mocks.subscriptionsEnabled = false;

    await expect(syncStripeSubscription(makeSub())).rejects.toThrow(
      "Subscriptions feature is disabled.",
    );
    expect(mocks.prisma.subscription.findUnique).not.toHaveBeenCalled();
  });
});
