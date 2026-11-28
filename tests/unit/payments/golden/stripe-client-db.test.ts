import {
  NOW,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  WEBHOOK_SECRET,
  failing,
  network,
  openTheShop,
  outcome,
  record,
  sqlite,
  stripeNotConfigured,
  world,
} from "./shop";

import { describe, expect, it, vi } from "vitest";

import { encryptSecret } from "@/lib/secret-encryption";
import {
  createPaymentIntent,
  createRefund,
  getStripeClient,
  getStripeKeys,
  getStripeMode,
  invalidateStripeKeysCache,
  isStripeReady,
} from "@/lib/stripe";

/**
 * PAY-F1-0 (./shop.ts): lib/stripe.ts itself, where the keys come from, and what its two
 * calls ask Stripe for and give back. Every path in this directory runs through it. PAY-F1 keeps it as it
 * is, and this holds that it stays so.
 */

openTheShop();

const FROM_ENV = { secretKey: SECRET_KEY, publishableKey: PUBLISHABLE_KEY, webhookSecret: WEBHOOK_SECRET };

const settings = (data: Record<string, string>) =>
  world.prisma.integrationSettings.create({
    data: {
      id: 1,
      ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encryptSecret(value)])),
    },
  });

describe.skipIf(!sqlite)("the Stripe keys", () => {
  it("from the environment, when the database holds none", async () => {
    expect(await getStripeKeys()).toEqual(FROM_ENV);
    expect(await isStripeReady()).toBe(true);
    expect(await getStripeMode()).toBe("stripe");
  });

  it("from the database first, decrypted", async () => {
    await settings({
      stripeSecretKey: "sk_test_saved",
      stripePublishableKey: "pk_test_saved",
      stripeWebhookSecret: "whsec_saved",
    });

    expect(await getStripeKeys()).toEqual({
      secretKey: "sk_test_saved",
      publishableKey: "pk_test_saved",
      webhookSecret: "whsec_saved",
    });
  });

  it.each([
    ["stripeSecretKey", "secretKey"],
    ["stripePublishableKey", "publishableKey"],
    ["stripeWebhookSecret", "webhookSecret"],
  ])("%s saved alone: the other two from the environment", async (column, key) => {
    await settings({ [column]: "saved" });

    expect(await getStripeKeys()).toEqual({ ...FROM_ENV, [key]: "saved" });
  });

  it("a database that cannot answer: the environment, without a word", async () => {
    failing("integrationSettings.findUnique");

    expect(await getStripeKeys()).toEqual(FROM_ENV);
    expect(await getStripeMode()).toBe("stripe");
  });

  it("a database that cannot answer, and no environment: no keys, and the mode unavailable", async () => {
    stripeNotConfigured();
    failing("integrationSettings.findUnique");

    expect(await getStripeMode()).toBe("unavailable");
  });

  it("a saved key that cannot be decrypted, and no environment: no keys, and the mode unavailable", async () => {
    stripeNotConfigured();
    await world.prisma.integrationSettings.create({ data: { id: 1, stripeSecretKey: "not-a-ciphertext" } });

    expect(await getStripeKeys()).toBeNull();
    expect(await getStripeMode()).toBe("unavailable");
  });

  it.each(["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"])(
    "%s missing: no keys at all, not ready, no client, and the mode unavailable",
    async (name) => {
      vi.stubEnv(name, "");

      expect(await getStripeKeys()).toBeNull();
      expect(await isStripeReady()).toBe(false);
      expect(await getStripeClient()).toBeNull();
      expect(await getStripeMode()).toBe("unavailable");
    },
  );

  it("read once for 30 seconds, then read again; invalidated, read at once", async () => {
    await getStripeKeys();
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_changed");
    const after = (ms: number) => vi.setSystemTime(new Date(Date.parse(NOW) + ms));

    after(29_999);
    expect((await getStripeKeys())?.publishableKey).toBe(PUBLISHABLE_KEY);

    after(30_000);
    expect((await getStripeKeys())?.publishableKey).toBe("pk_test_changed");

    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_changed_again");
    expect((await getStripeKeys())?.publishableKey).toBe("pk_test_changed");
    invalidateStripeKeysCache();
    expect((await getStripeKeys())?.publishableKey).toBe("pk_test_changed_again");
  });

  it("no keys anywhere is cached as well", async () => {
    stripeNotConfigured();
    expect(await getStripeKeys()).toBeNull();
    expect(await getStripeMode()).toBe("none");

    vi.stubEnv("STRIPE_SECRET_KEY", SECRET_KEY);
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    expect(await getStripeKeys()).toBeNull();
    expect(await getStripeMode()).toBe("none");
  });

  it("some keys but not all are not cached: the next read reads again", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    invalidateStripeKeysCache();
    expect(await getStripeKeys()).toBeNull();

    vi.stubEnv("STRIPE_SECRET_KEY", SECRET_KEY);
    expect(await getStripeKeys()).toEqual(FROM_ENV);
    expect(await getStripeMode()).toBe("stripe");
  });

  it("one client per secret key, built with a pinned API version", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_a_new_key");
    invalidateStripeKeysCache();

    const first = await getStripeClient();
    const again = await getStripeClient();

    expect(again).toBe(first);
    // stripe-pin.test.ts holds which version; this holds that one is sent.
    expect(world.clients).toEqual([
      ["sk_test_a_new_key", { apiVersion: expect.stringMatching(/^\d{4}-\d{2}-\d{2}\.[a-z]+$/), typescript: true }],
    ]);

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_a_newer_key");
    invalidateStripeKeysCache();
    expect(await getStripeClient()).not.toBe(first);
    expect(world.clients).toHaveLength(2);
  });
});

describe.skipIf(!sqlite)("what its two calls ask Stripe for, and give back", () => {
  it("a payment intent: the amount and currency as given, keyed by the order; its id and client secret back, no more", async () => {
    network("paymentIntents.create").mockResolvedValue({ id: "pi_1", client_secret: "secret", status: "created" });

    expect(
      await record(() =>
        createPaymentIntent({ orderId: "o1", amountMinor: 100, email: "a@shop.example.test", currency: "XTS" }),
      ),
    ).toEqual(
      outcome({
        result: { clientSecret: "secret", paymentIntentId: "pi_1" },
        sdk: [
          [
            "paymentIntents.create",
            {
              amount: 100,
              currency: "xts",
              receipt_email: "a@shop.example.test",
              metadata: { orderId: "o1", currency: "xts" },
              automatic_payment_methods: { enabled: true },
            },
            { idempotencyKey: "order_o1" },
          ],
        ],
      }),
    );
  });

  // The refund's idempotency key is one a later PAY4 slice changes on purpose: these
  // two literals are the lines it updates.
  it("a part refund: that amount, keyed by the order and the amount; its id, amount and status back, no more", async () => {
    network("refunds.create").mockResolvedValue({ id: "re_1", amount: 100, status: "pending", charge: "ch_1" });

    expect(
      await record(() => createRefund({ orderId: "o1", paymentIntentId: "pi_1", amountOere: 100, reason: "damaged" })),
    ).toEqual(
      outcome({
        result: { refundId: "re_1", amount: 100, status: "pending" },
        sdk: [
          [
            "refunds.create",
            { payment_intent: "pi_1", amount: 100, metadata: { orderId: "o1", reason: "damaged" } },
            { idempotencyKey: "refund_o1_100" },
          ],
        ],
      }),
    );
  });

  it("a full refund: no amount sent, keyed by the order and \"full\"", async () => {
    network("refunds.create").mockResolvedValue({ id: "re_2", amount: 136120, status: "succeeded", charge: "ch_1" });

    expect(await record(() => createRefund({ orderId: "o1", paymentIntentId: "pi_1" }))).toEqual(
      outcome({
        result: { refundId: "re_2", amount: 136120, status: "succeeded" },
        sdk: [
          ["refunds.create", { payment_intent: "pi_1", metadata: { orderId: "o1" } }, { idempotencyKey: "refund_o1_full" }],
        ],
      }),
    );
  });

  it("neither, with no keys: null, and Stripe not asked", async () => {
    stripeNotConfigured();

    expect(await createPaymentIntent({ orderId: "o1", amountMinor: 100, email: "a@shop.example.test", currency: "XTS" })).toBeNull();
    expect(await createRefund({ orderId: "o1", paymentIntentId: "pi_1" })).toBeNull();
    expect(world.sdk).toEqual([]);
  });
});
