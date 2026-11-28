import {
  NOW,
  ORDER,
  RECEIVED,
  deliver,
  failing,
  openTheShop,
  orderIn,
  outcome,
  paidIntent,
  postWebhook,
  record,
  remembered,
  sqlite,
  stripeNotConfigured,
  world,
} from "./shop";

import { describe, expect, it } from "vitest";

import * as route from "@/app/api/webhook/stripe/route";

/** PAY-F1-0 (./shop.ts): what stands before every event the Stripe webhook handles. */

openTheShop();

describe.skipIf(!sqlite)("the Stripe webhook's gate", () => {
  it("the route: a POST, on Node, never cached", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic", "runtime"]);
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("Stripe not configured: 503, and no event is looked at", async () => {
    await orderIn();
    stripeNotConfigured();

    const seen = await record(() => deliver("evt_1", "payment_intent.succeeded", paidIntent()));

    expect(seen).toEqual(outcome({ result: { status: 503, body: { error: "Stripe not configured" } } }));
  });

  it("no signature header: 400", async () => {
    await orderIn();

    const seen = await record(() => postWebhook(JSON.stringify({ id: "evt_1" })));

    expect(seen).toEqual(outcome({ result: { status: 400, body: { error: "Missing stripe-signature header" } } }));
  });

  it("a signature from another secret: 400, nothing remembered, the reason logged", async () => {
    await orderIn();

    const seen = await record(() =>
      deliver("evt_forged", "payment_intent.succeeded", paidIntent(), { secret: "whsec_someone_else" }),
    );

    expect(seen).toEqual(
      outcome({
        result: { status: 400, body: { error: "Invalid signature" } },
        logs: [["error", "[stripe-webhook] signature-verify failed:", expect.any(String)]],
      }),
    );
  });

  it("a signature older than the SDK's own tolerance: 400", async () => {
    await orderIn();
    const sixMinutesAgo = Math.floor(Date.parse(NOW) / 1000) - 360;

    const seen = await record(() =>
      deliver("evt_old", "payment_intent.succeeded", paidIntent(), { timestamp: sixMinutesAgo }),
    );

    expect(seen).toEqual(
      outcome({
        result: { status: 400, body: { error: "Invalid signature" } },
        logs: [["error", "[stripe-webhook] signature-verify failed:", expect.any(String)]],
      }),
    );
  });

  it("an event type nobody handles: taken in, remembered, nothing else", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", "customer.created", { id: "cus_1" }));

    expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", "customer.created") }));
  });

  it("the same event id again: answered idempotent, whatever it now says", async () => {
    await orderIn();
    await deliver("evt_1", "customer.created", { id: "cus_1" });

    const seen = await record(() => deliver("evt_1", "payment_intent.succeeded", paidIntent()));

    expect(seen).toEqual(outcome({ result: { status: 200, body: { received: true, idempotent: true } } }));
  });

  it("the event cannot be remembered: 500, so Stripe delivers it again, and nothing runs", async () => {
    await orderIn();
    failing("processedWebhookEvent.create");

    const seen = await record(() => deliver("evt_1", "payment_intent.succeeded", paidIntent()));

    expect(seen).toEqual(
      outcome({
        result: { status: 500, body: { error: "DB error" } },
        logs: [["error", "[stripe-webhook] DB insert failed:", "Error: db down"]],
      }),
    );
  });

  it("any other failure with a code is not taken for a repeat", async () => {
    await orderIn();
    world.before.set("processedWebhookEvent.create", () => {
      throw Object.assign(new Error("db down"), { code: "P1001" });
    });

    const seen = await record(() => deliver("evt_1", "payment_intent.succeeded", paidIntent()));

    expect(seen.result).toEqual({ status: 500, body: { error: "DB error" } });
    expect(seen.rows).toEqual({});
  });

  it("a handler that throws: 500 and Sentry, with the event's id and type and none of its payload", async () => {
    await orderIn();
    failing("order.findUnique");

    const seen = await record(() => deliver("evt_1", "payment_intent.succeeded", paidIntent()));

    expect(seen).toEqual(
      outcome({
        result: { status: 500, body: { error: "Handler failed" } },
        rows: remembered("evt_1", "payment_intent.succeeded"),
        sentry: [
          [
            new Error("db down"),
            { tags: { source: "stripe-webhook", eventType: "payment_intent.succeeded" }, extra: { eventId: "evt_1" } },
          ],
        ],
        logs: [["error", "[stripe-webhook] handler for payment_intent.succeeded failed:", "Error: db down"]],
      }),
    );
  });

  it("known: the retry of that event finds it remembered and does nothing, until a person deletes the row", async () => {
    await orderIn();
    failing("order.findUnique");
    await deliver("evt_1", "payment_intent.succeeded", paidIntent());

    const retry = await record(() => deliver("evt_1", "payment_intent.succeeded", paidIntent()));

    expect(retry).toEqual(outcome({ result: { status: 200, body: { received: true, idempotent: true } } }));

    await world.prisma.processedWebhookEvent.delete({ where: { id: "evt_1" } });
    const afterTheFix = await record(() => deliver("evt_1", "payment_intent.succeeded", paidIntent()));

    expect(afterTheFix.rows.Order).toEqual({
      updated: {
        [ORDER]: { status: "paid", paymentMethod: "stripe_card", paidAt: NOW, confirmationEmailSentAt: NOW },
      },
    });
  });
});
