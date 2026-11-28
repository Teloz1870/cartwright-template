import { openTheShop, sqlite } from "./shop";

import { describe, expect, it } from "vitest";

import { buildToolManifest } from "@/lib/tools/registry";

/**
 * PAY-F1-0 (./shop.ts): the two tools on the money path, as an agent discovers them.
 * PAY-F2 changes their output and wording with its flag on only, so with the flag off
 * what tools/list prints must stay byte for byte this.
 */

openTheShop();

const ORDERS_CREATE = {
  name: "orders.create",
  description: "Create an order from the customer's current cart with shipping details. Call only after confirming all fields with the customer in one combined summary. The server always returns requiresConfirmation first; the customer clicks 'Buy now' in the PlanCard. You must never self-confirm. Set rememberAddress: true only if the customer explicitly asked to remember the address for next time; default is false.",
  scope: "orders:write",
  revertible: false,
  inputJsonSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      shippingName: {
        type: "string",
        minLength: 2,
      },
      email: {
        type: "string",
        format: "email",
        pattern: "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
      },
      shippingAddress: {
        type: "string",
        minLength: 3,
      },
      shippingZip: {
        type: "string",
        pattern: "^\\d{4}$",
      },
      shippingCity: {
        type: "string",
        minLength: 2,
      },
      phoneNumber: {
        type: "string",
        pattern: "^(\\+?\\d{1,3})?[\\s\\-()]*\\d{8,12}[\\s\\-()]*$",
      },
      discountCode: {
        type: "string",
      },
      // Re-recorded for #782 (5a727722, SHIP0-b part 2a): checkout's delivery step
      // sends the chosen rate (lib/validation.ts checkoutSchema.shippingRateId).
      shippingRateId: {
        anyOf: [
          {
            type: "string",
            minLength: 1,
            maxLength: 64,
          },
          {
            type: "null",
          },
        ],
      },
      rememberAddress: {
        default: false,
        type: "boolean",
      },
    },
    required: ["shippingName", "email", "shippingAddress", "shippingZip", "shippingCity"],
  },
  outputJsonSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    anyOf: [
      {
        type: "object",
        properties: {
          ok: {
            type: "boolean",
            const: false,
          },
          error: {
            type: "string",
          },
          code: {
            type: "string",
            enum: [
              "VALIDATION",
              "EMPTY_CART",
              "OUT_OF_STOCK",
              "PRODUCT_UNAVAILABLE",
              "INVALID_DISCOUNT",
              "PAYMENT_INIT_FAILED",
              // Re-recorded for #782 (5a727722): a delivery choice checkout cannot honour.
              "SHIPPING_CHOICE",
              "INTERNAL",
            ],
          },
        },
        required: ["ok", "error", "code"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          ok: {
            type: "boolean",
            const: true,
          },
          orderId: {
            type: "string",
          },
          totalDkk: {
            type: "integer",
            minimum: -9007199254740991,
            maximum: 9007199254740991,
          },
          paymentMode: {
            type: "string",
            const: "mock",
          },
          rememberAddress: {
            type: "boolean",
          },
          shippingSnapshot: {
            anyOf: [
              {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                  },
                  address: {
                    type: "string",
                  },
                  zip: {
                    type: "string",
                  },
                  city: {
                    type: "string",
                  },
                },
                required: ["name", "address", "zip", "city"],
                additionalProperties: false,
              },
              {
                type: "null",
              },
            ],
          },
        },
        required: ["ok", "orderId", "totalDkk", "paymentMode", "rememberAddress", "shippingSnapshot"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          ok: {
            type: "boolean",
            const: true,
          },
          orderId: {
            type: "string",
          },
          totalDkk: {
            type: "integer",
            minimum: -9007199254740991,
            maximum: 9007199254740991,
          },
          paymentMode: {
            type: "string",
            const: "stripe",
          },
          rememberAddress: {
            type: "boolean",
          },
          shippingSnapshot: {
            anyOf: [
              {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                  },
                  address: {
                    type: "string",
                  },
                  zip: {
                    type: "string",
                  },
                  city: {
                    type: "string",
                  },
                },
                required: ["name", "address", "zip", "city"],
                additionalProperties: false,
              },
              {
                type: "null",
              },
            ],
          },
          paymentIntentClientSecret: {
            type: "string",
          },
          publishableKey: {
            type: "string",
          },
        },
        required: [
          "ok",
          "orderId",
          "totalDkk",
          "paymentMode",
          "rememberAddress",
          "shippingSnapshot",
          "paymentIntentClientSecret",
          "publishableKey",
        ],
        additionalProperties: false,
      },
    ],
  },
  examples: [
    {
      name: "Create a checkout session",
      body: {
        email: "test@example.com",
        phoneNumber: "+4512345678",
        shippingName: "Test Person",
        shippingAddress: "Testvej 1",
        shippingZip: "1000",
        shippingCity: "København",
        rememberAddress: false,
      },
    },
  ],
};

const ORDERS_UPDATE_STATUS = {
  name: "orders.update_status",
  description: "Changes the status of an order. Valid statuses: pending_payment, pending, paid, processing, shipped, delivered, completed, cancelled, refunded, partial_refund, flagged_review, disputed. The move must be a legal transition from the order's current status (operator state machine). This tool moves no money: refunded/partial_refund are refused unless you are recording a refund made outside the shop (manual: true + confirm: true, plus refundDkk for partial_refund); the order then gets a note saying no money moved and the result carries moneyMoved: false. Refund a card payment from the admin order page instead. Every non-refund move writes the same order-timeline note as the admin status form, and is refused without writing anything if the order's status changed after this call read it (another cancel, a payment, another operator) — re-read the order and decide again. Cancelling an order that is still pending_payment returns its items to stock (the result carries restocked: true, and the timeline note says so). Cancelling an order with a Stripe payment also cancels that payment if it is still unpaid; one the customer already paid is left alone and must be refunded from the admin order page — the result's paymentIntent says which. Logs before state to audit.",
  scope: "orders:write",
  revertible: false,
  inputJsonSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      orderId: {
        type: "string",
        minLength: 1,
      },
      status: {
        type: "string",
        enum: [
          "pending_payment",
          "pending",
          "paid",
          "flagged_review",
          "shipped",
          "cancelled",
          "refunded",
          "partial_refund",
          "disputed",
          "processing",
          "delivered",
          "completed",
        ],
      },
      manual: {
        description: "Required (true) for refunded/partial_refund: records a refund made outside the shop. No money is moved.",
        type: "boolean",
      },
      confirm: {
        description: "Required (true) together with manual for refunded/partial_refund.",
        type: "boolean",
      },
      refundDkk: {
        description: "Amount refunded outside the shop, in øre. Required for a manual partial_refund.",
        type: "integer",
        exclusiveMinimum: 0,
        maximum: 9007199254740991,
      },
    },
    required: ["orderId", "status"],
  },
  outputJsonSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      id: {
        type: "string",
      },
      status: {
        type: "string",
        enum: [
          "pending_payment",
          "pending",
          "paid",
          "flagged_review",
          "shipped",
          "cancelled",
          "refunded",
          "partial_refund",
          "disputed",
          "processing",
          "delivered",
          "completed",
        ],
      },
      moneyMoved: {
        type: "boolean",
        const: false,
      },
      restocked: {
        type: "boolean",
        const: true,
      },
      paymentIntent: {
        type: "object",
        properties: {
          outcome: {
            type: "string",
            enum: ["canceled", "already_canceled", "succeeded", "failed"],
          },
          note: {
            type: "string",
          },
        },
        required: ["outcome", "note"],
        additionalProperties: false,
      },
    },
    required: ["id", "status"],
    additionalProperties: false,
  },
  examples: [
    {
      name: "Mark order as shipped",
      body: {
        orderId: "cuid-12345",
        status: "shipped",
      },
    },
    {
      name: "Record a refund made by bank transfer",
      body: {
        orderId: "cuid-12345",
        status: "refunded",
        manual: true,
        confirm: true,
      },
    },
  ],
};

describe.skipIf(!sqlite)("what tools/list says", () => {
  it.each([
    ["orders.create", ORDERS_CREATE],
    ["orders.update_status", ORDERS_UPDATE_STATUS],
  ])("%s", (name, printed) => {
    const tool = buildToolManifest().find((entry) => entry.name === name);

    // A readable difference first, then the bytes, key order included.
    expect(tool).toEqual(printed);
    expect(JSON.stringify(tool)).toBe(JSON.stringify(printed));
  });
});
