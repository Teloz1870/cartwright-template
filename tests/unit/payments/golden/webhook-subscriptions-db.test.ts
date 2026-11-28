import {
  NOW,
  RECEIVED,
  deliver,
  network,
  openTheShop,
  outcome,
  record,
  remembered,
  sqlite,
  stripeNotConfigured,
  world,
} from "./shop";

import { beforeEach, describe, expect, it } from "vitest";

import { syncStripeSubscription, syncStripeSubscriptionById } from "@/lib/subscriptions";

/** PAY-F1-0 (./shop.ts): the events that only mean something with subscriptions on. */

openTheShop();

const CHECKOUT = "checkout.session.completed";
const PERIOD_END = Math.floor(Date.parse(NOW) / 1000) + 86_400;
const PERIOD_END_ISO = new Date(PERIOD_END * 1000).toISOString();

const stripeSub = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  object: "subscription",
  status: "active",
  customer: "cus_1",
  metadata: { userId: "user-1" },
  current_period_end: PERIOD_END,
  cancel_at_period_end: false,
  pause_collection: null,
  items: { data: [{ price: { id: "price_1" } }] },
  ...over,
});

const SUB_ROW = {
  userId: "user-1",
  stripeCustomerId: "cus_1",
  stripeSubId: "sub_1",
  stripePriceId: "price_1",
  status: "active",
  currentPeriodEnd: PERIOD_END_ISO,
  cancelAtPeriodEnd: false,
};

const session = (over: Record<string, unknown> = {}) => ({
  id: "cs_1",
  object: "checkout.session",
  mode: "subscription",
  subscription: "sub_1",
  customer: "cus_1",
  metadata: { userId: "user-1" },
  ...over,
});

const subscriptionEvents = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;
const invoiceEvents = ["invoice.paid", "invoice.payment_failed"] as const;

describe.skipIf(!sqlite)("with subscriptions off", () => {
  it.each([...subscriptionEvents, ...invoiceEvents])("%s: answered, not remembered, nothing read", async (type) => {
    const seen = await record(() => deliver("evt_1", type, stripeSub()));

    expect(seen).toEqual(outcome({ result: { status: 200, body: { received: true, disabled: "subscriptions" } } }));
  });

  it("a subscription checkout: the same", async () => {
    const seen = await record(() => deliver("evt_1", CHECKOUT, session()));

    expect(seen).toEqual(outcome({ result: { status: 200, body: { received: true, disabled: "subscriptions" } } }));
  });

  it("a one-off checkout: taken in and remembered, nothing else", async () => {
    const seen = await record(() => deliver("evt_1", CHECKOUT, session({ mode: "payment", subscription: null })));

    expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", CHECKOUT) }));
  });
});

describe.skipIf(!sqlite)("with subscriptions on", () => {
  beforeEach(() => {
    world.subscriptionsOn = true;
    network("subscriptions.retrieve").mockResolvedValue(stripeSub());
  });

  describe("checkout.session.completed", () => {
    it("a subscription checkout: Stripe asked, the subscription written", async () => {
      const seen = await record(() => deliver("evt_1", CHECKOUT, session()));

      expect(seen).toEqual(
        outcome({
          result: RECEIVED,
          rows: { ...remembered("evt_1", CHECKOUT), Subscription: { inserted: [SUB_ROW] } },
          sdk: [["subscriptions.retrieve", "sub_1"]],
        }),
      );
    });

    it("a subscription given as an object, its customer as an object: read the same", async () => {
      network("subscriptions.retrieve").mockResolvedValue(stripeSub({ customer: null, metadata: {} }));

      const seen = await record(() =>
        deliver("evt_1", CHECKOUT, session({ subscription: { id: "sub_1" }, customer: { id: "cus_2" } })),
      );

      expect(seen.sdk).toEqual([["subscriptions.retrieve", "sub_1"]]);
      // Stripe's subscription names neither: the session's own values fill in.
      expect(seen.rows.Subscription).toEqual({ inserted: [{ ...SUB_ROW, stripeCustomerId: "cus_2" }] });
    });

    it("a customer the subscription does not name: the session's", async () => {
      network("subscriptions.retrieve").mockResolvedValue(stripeSub({ customer: null }));

      const seen = await record(() => deliver("evt_1", CHECKOUT, session({ customer: "cus_2" })));

      expect(seen.rows.Subscription).toEqual({ inserted: [{ ...SUB_ROW, stripeCustomerId: "cus_2" }] });
    });

    it("no customer anywhere: written as unknown", async () => {
      network("subscriptions.retrieve").mockResolvedValue(stripeSub({ customer: null }));

      const seen = await record(() => deliver("evt_1", CHECKOUT, session({ customer: null })));

      expect(seen.rows.Subscription).toEqual({ inserted: [{ ...SUB_ROW, stripeCustomerId: "unknown" }] });
    });

    it("no user on the session: a warning, Stripe not asked", async () => {
      const seen = await record(() => deliver("evt_1", CHECKOUT, session({ metadata: {} })));

      expect(seen).toEqual(
        outcome({
          result: RECEIVED,
          rows: remembered("evt_1", CHECKOUT),
          logs: [["warn", "[stripe-webhook] checkout.session.completed uden userId metadata: cs_1"]],
        }),
      );
    });

    it.each([
      ["a one-off checkout", { mode: "payment" }],
      ["no subscription on it", { subscription: null }],
    ])("%s: nothing", async (_case, over) => {
      const seen = await record(() => deliver("evt_1", CHECKOUT, session(over)));

      expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", CHECKOUT) }));
    });

    it("Stripe refuses: 500 and Sentry", async () => {
      network("subscriptions.retrieve").mockRejectedValue(new Error("stripe down"));

      const seen = await record(() => deliver("evt_1", CHECKOUT, session()));

      expect(seen).toEqual(
        outcome({
          result: { status: 500, body: { error: "Handler failed" } },
          rows: remembered("evt_1", CHECKOUT),
          sdk: [["subscriptions.retrieve", "sub_1"]],
          sentry: [
            [new Error("stripe down"), { tags: { source: "stripe-webhook", eventType: CHECKOUT }, extra: { eventId: "evt_1" } }],
          ],
          logs: [["error", `[stripe-webhook] handler for ${CHECKOUT} failed:`, "Error: stripe down"]],
        }),
      );
    });
  });

  describe("customer.subscription.*", () => {
    it.each(subscriptionEvents)("%s, one the shop has not seen: written from the event, Stripe not asked", async (type) => {
      const seen = await record(() => deliver("evt_1", type, stripeSub()));

      expect(seen).toEqual(
        outcome({
          result: RECEIVED,
          rows: { ...remembered("evt_1", type), Subscription: { inserted: [SUB_ROW] } },
        }),
      );
    });

    it("one the shop has: updated in place, keeping its user", async () => {
      await deliver("evt_1", "customer.subscription.created", stripeSub());
      const row = await world.prisma.subscription.findUniqueOrThrow({ where: { stripeSubId: "sub_1" } });

      const seen = await record(() =>
        deliver("evt_2", "customer.subscription.updated", stripeSub({ status: "past_due", cancel_at_period_end: true, metadata: {} })),
      );

      expect(seen.rows.Subscription).toEqual({
        updated: { [row.id]: { status: "past_due", cancelAtPeriodEnd: true } },
      });
    });

    it("a paused collection reads as paused", async () => {
      const seen = await record(() =>
        deliver("evt_1", "customer.subscription.updated", stripeSub({ pause_collection: { behavior: "void" } })),
      );

      expect(seen.rows.Subscription).toEqual({
        inserted: [{ ...SUB_ROW, status: "paused", pauseCollectionBehavior: "void" }],
      });
    });

    it("the period end from its first item, when it has none of its own", async () => {
      const seen = await record(() =>
        deliver(
          "evt_1",
          "customer.subscription.updated",
          stripeSub({ current_period_end: undefined, items: { data: [{ price: { id: "price_1" }, current_period_end: PERIOD_END + 60 }] } }),
        ),
      );

      expect(seen.rows.Subscription).toEqual({
        inserted: [{ ...SUB_ROW, currentPeriodEnd: new Date((PERIOD_END + 60) * 1000).toISOString() }],
      });
    });

    it.each(["canceled", "incomplete_expired"])("%s wins over a paused collection", async (status) => {
      const seen = await record(() =>
        deliver("evt_1", "customer.subscription.updated", stripeSub({ status, pause_collection: { behavior: "void" } })),
      );

      expect(seen.rows.Subscription).toEqual({
        inserted: [{ ...SUB_ROW, status, pauseCollectionBehavior: "void" }],
      });
    });

    it("no price on it and no period end anywhere: written as unknown, ending now", async () => {
      const seen = await record(() =>
        deliver("evt_1", "customer.subscription.updated", stripeSub({ current_period_end: undefined, items: { data: [] } })),
      );

      expect(seen.rows.Subscription).toEqual({
        inserted: [{ ...SUB_ROW, stripePriceId: "unknown", currentPeriodEnd: NOW }],
      });
    });

    it("no user on it and none on file: a warning, no row", async () => {
      const seen = await record(() => deliver("evt_1", "customer.subscription.created", stripeSub({ metadata: {} })));

      expect(seen).toEqual(
        outcome({
          result: RECEIVED,
          rows: remembered("evt_1", "customer.subscription.created"),
          logs: [["warn", "[subscriptions] Stripe subscription sub_1 has no userId metadata; skipping local sync."]],
        }),
      );
    });
  });

  describe("invoice.*", () => {
    it.each(invoiceEvents)("%s: the subscription read back from Stripe", async (type) => {
      const seen = await record(() => deliver("evt_1", type, { id: "in_1", subscription: "sub_1" }));

      expect(seen).toEqual(
        outcome({
          result: RECEIVED,
          rows: { ...remembered("evt_1", type), Subscription: { inserted: [SUB_ROW] } },
          sdk: [["subscriptions.retrieve", "sub_1"]],
        }),
      );
    });

    it("a subscription given as an object: read the same", async () => {
      const seen = await record(() => deliver("evt_1", "invoice.paid", { id: "in_1", subscription: { id: "sub_1" } }));

      expect(seen.sdk).toEqual([["subscriptions.retrieve", "sub_1"]]);
    });

    it("an invoice with no subscription: nothing, Stripe not asked", async () => {
      const seen = await record(() => deliver("evt_1", "invoice.paid", { id: "in_1", subscription: null }));

      expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", "invoice.paid") }));
    });
  });
});

// The webhook's own checks stand before these, so no event reaches them: they are held
// because PAY-F1 keeps this file as it is, and the next caller may not check first.
describe.skipIf(!sqlite)("the sync, called directly", () => {
  it("with subscriptions off: both refuse, Stripe not asked", async () => {
    await expect(syncStripeSubscription(stripeSub() as never)).rejects.toThrow("Subscriptions feature is disabled.");
    await expect(syncStripeSubscriptionById("sub_1")).rejects.toThrow("Subscriptions feature is disabled.");
    expect(world.sdk).toEqual([]);
  });

  it("with no keys: the one that must ask Stripe refuses", async () => {
    world.subscriptionsOn = true;
    stripeNotConfigured();

    await expect(syncStripeSubscriptionById("sub_1")).rejects.toThrow("Stripe is not configured.");
  });

  it("with no user: null, for the caller to see", async () => {
    world.subscriptionsOn = true;

    expect(await syncStripeSubscription(stripeSub({ metadata: {} }) as never)).toBeNull();
  });
});
