import "server-only";

import { brand } from "@/brand.config";
import { vatBreakdown } from "@/lib/tax";
import type { SalesOrderRequest } from "./client";

/**
 * A Cartwright order as a Shipmondo sales order — what the WooCommerce plugin
 * sends, so the shop picks, packs and books the label in Shipmondo as it does
 * today. Pure: the caller loads the order; nothing here touches the database.
 *
 * Amounts: the order's `*Dkk` fields are minor units of the shop's BASE
 * currency (`brand.policies.currency` — øre for DKK, cents for USD/EUR; the
 * names predate multi-currency), and `totalDkk` is what was charged, so that
 * total is sent as the amount including VAT, with the order's own VAT when it
 * has one. Line prices go through lib/tax.ts, which knows whether the shop's
 * prices include VAT.
 *
 * The order has no shipping country of its own yet (checkout ships within the
 * shop's country, `brand.policies.country`), so ship_to uses that.
 *
 * `order_id` is the order number the shop sees (`#1042`), else the order's id;
 * `orderRefOf` / ./webhook.ts read it back the same way.
 */
export type ShippableOrderRow = {
  id: string;
  orderNumber: number | null;
  createdAt: Date;
  paidAt: Date | null;
  email: string;
  phoneNumber: string | null;
  shippingName: string;
  shippingAddress: string;
  shippingZip: string;
  shippingCity: string;
  billingName: string | null;
  billingAddress: string | null;
  billingZip: string | null;
  billingCity: string | null;
  billingCountry: string | null;
  shippingDkk: number;
  discountDkk: number;
  discountCode: string | null;
  totalDkk: number;
  vatOere: number | null;
  paymentMethod: string | null;
  paymentRef?: string | null;
  /** Stripe checkouts keep their reference here, not in paymentRef. */
  stripePaymentIntentId?: string | null;
  items: {
    productName: string;
    sku: string | null;
    variantSku: string | null;
    quantity: number;
    unitPriceDkk: number;
    /** The product's own SKU: a line bought without a variant may have no snapshot of it. */
    product?: { sku: string | null } | null;
  }[];
};

/** Øre as Shipmondo's decimal string: 12345 → "123.45", -500 → "-5.00". */
export function amount(oere: number): string {
  const sign = oere < 0 ? "-" : "";
  const abs = Math.abs(Math.round(oere));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Shipmondo writes a VAT rate as a fraction ("0.25" for 25 %, per its own
 * schema examples), not as a percentage: 25 → "0.25", 12.5 → "0.125".
 */
export function vatFraction(ratePct: number): string {
  return String(Number((ratePct / 100).toFixed(6)));
}

/**
 * The tag that says a sales order is this shop's copy of this order. The order
 * id is a cuid, unique across shops, so a shared Shipmondo account can hold any
 * number of #1042s and only this one carries it.
 */
export function orderTag(orderId: string): string {
  return `cartwright:${orderId}`;
}

/** The reference Shipmondo shows and sends back on the order's shipments. */
export function orderRefOf(order: Pick<ShippableOrderRow, "id" | "orderNumber">): string {
  return order.orderNumber !== null ? String(order.orderNumber) : order.id;
}

function skuOf(item: ShippableOrderRow["items"][number]): { item_sku?: string } {
  const sku = item.variantSku ?? item.sku ?? item.product?.sku;
  return sku ? { item_sku: sku } : {};
}

export function toSalesOrder(order: ShippableOrderRow): SalesOrderRequest {
  const CURRENCY = brand.policies.currency.toUpperCase();
  const country = brand.policies.country.toUpperCase();
  // What was charged decides the VAT. A shop whose prices include VAT charged it
  // inside the total; one whose prices exclude it charged none on top unless
  // the order recorded it (vatOere) — checkout adds no VAT there yet (MOMS1).
  // Lines and payment details then tell Shipmondo the same story.
  const vat =
    order.vatOere ??
    (brand.policies.pricesIncludeVat ? vatBreakdown(order.totalDkk, { pricesIncludeVat: true }).vat : 0);
  const vatPercent = vat === 0 ? "0" : vatFraction(brand.policies.vatRatePct);
  // No VAT charged (a zero-rated order, or none added on top): a line's price is all of it.
  const net = (oere: number) => amount(vat === 0 ? oere : vatBreakdown(oere).net);

  const lines: SalesOrderRequest["order_lines"] = order.items.map((item) => ({
    line_type: "item",
    item_name: item.productName,
    ...skuOf(item),
    quantity: item.quantity,
    unit_price_excluding_vat: net(item.unitPriceDkk),
    vat_percent: vatPercent,
    currency_code: CURRENCY,
  }));
  if (order.shippingDkk > 0) {
    lines.push({
      line_type: "shipping",
      item_name: "Shipping",
      quantity: 1,
      unit_price_excluding_vat: net(order.shippingDkk),
      vat_percent: vatPercent,
      currency_code: CURRENCY,
    });
  }
  if (order.discountDkk > 0) {
    lines.push({
      line_type: "discount",
      item_name: order.discountCode ? `Discount ${order.discountCode}` : "Discount",
      quantity: 1,
      unit_price_excluding_vat: net(-order.discountDkk),
      vat_percent: vatPercent,
      currency_code: CURRENCY,
    });
  }

  return {
    order_id: orderRefOf(order),
    ordered_at: (order.paidAt ?? order.createdAt).toISOString(),
    source_name: brand.storeName,
    ship_to: {
      name: order.shippingName,
      address1: order.shippingAddress,
      zipcode: order.shippingZip,
      city: order.shippingCity,
      country_code: country,
      email: order.email,
      ...(order.phoneNumber ? { mobile: order.phoneNumber } : {}),
    },
    bill_to: {
      name: order.billingName ?? order.shippingName,
      address1: order.billingAddress ?? order.shippingAddress,
      zipcode: order.billingZip ?? order.shippingZip,
      city: order.billingCity ?? order.shippingCity,
      country_code: (order.billingCountry ?? country).toUpperCase(),
      email: order.email,
      ...(order.phoneNumber ? { mobile: order.phoneNumber } : {}),
    },
    payment_details: {
      amount_including_vat: amount(order.totalDkk),
      amount_excluding_vat: amount(order.totalDkk - vat),
      vat_amount: amount(vat),
      vat_percent: vatPercent,
      currency_code: CURRENCY,
      ...(order.paymentMethod ? { payment_method: order.paymentMethod } : {}),
      ...((order.paymentRef ?? order.stripePaymentIntentId)
        ? { transaction_id: (order.paymentRef ?? order.stripePaymentIntentId) as string }
        : {}),
    },
    order_lines: lines,
    tags: [orderTag(order.id)],
  };
}
