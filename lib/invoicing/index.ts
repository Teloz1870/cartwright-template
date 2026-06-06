import "server-only";

import { brand } from "@/brand.config";
import type {
  InvoiceProvider,
  InvoiceProviderName,
  InvoiceInput,
  InvoiceResult,
} from "./types";
import { StripeInvoiceProvider } from "./stripe";
import { EconomicInvoiceProvider } from "./economic";
import { DineroInvoiceProvider } from "./dinero";

export type { InvoiceProvider, InvoiceInput, InvoiceResult, InvoiceProviderName } from "./types";

/** Default provider. Fremtid: læs fra IntegrationSettings.invoiceProvider. */
function defaultProviderName(): InvoiceProviderName {
  return "stripe";
}

export function getInvoiceProvider(name?: InvoiceProviderName): InvoiceProvider {
  switch (name ?? defaultProviderName()) {
    case "economic":
      return new EconomicInvoiceProvider();
    case "dinero":
      return new DineroInvoiceProvider();
    case "stripe":
    default:
      return new StripeInvoiceProvider();
  }
}

export type OrderLikeForInvoice = {
  id: string;
  email: string;
  shippingName?: string | null;
  items: { productName: string; unitPriceDkk: number; quantity: number }[];
};

/** Byg et provider-agnostisk InvoiceInput fra en ordre. */
export function buildInvoiceInput(order: OrderLikeForInvoice): InvoiceInput {
  return {
    orderId: order.id,
    customer: { email: order.email, name: order.shippingName },
    currency: brand.policies.currency.toLowerCase(),
    lines: order.items.map((it) => ({
      description: it.productName,
      quantity: it.quantity,
      unitAmountOere: it.unitPriceDkk,
    })),
    vatRatePct: brand.policies.vatRatePct,
    pricesIncludeVat: brand.policies.pricesIncludeVat,
    automaticTax: Boolean((brand.features as { stripeTax?: boolean }).stripeTax),
    metadata: { orderId: order.id },
  };
}

/** Opret en faktura for en ordre via den valgte provider. */
export async function createInvoiceForOrder(
  order: OrderLikeForInvoice,
  providerName?: InvoiceProviderName,
): Promise<InvoiceResult> {
  return getInvoiceProvider(providerName).createInvoice(buildInvoiceInput(order));
}
