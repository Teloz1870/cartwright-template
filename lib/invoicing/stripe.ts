import "server-only";

import { getStripeClient } from "@/lib/stripe";
import type { InvoiceProvider, InvoiceInput, InvoiceResult } from "./types";

/**
 * Stripe Invoicing-adapter (default). Bruger den eksisterende Stripe-klient
 * (lib/stripe.ts). Opretter customer → invoice-items → invoice → finalize, og
 * returnerer hosted-URL + PDF-URL. Med automaticTax sætter den Stripe Tax på
 * (managed moms). Beløb er allerede i øre (Stripe minor units for dkk).
 */
export class StripeInvoiceProvider implements InvoiceProvider {
  readonly name = "stripe";

  async createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
    const stripe = await getStripeClient();
    if (!stripe) {
      throw new Error("Stripe er ikke konfigureret (mangler API-key).");
    }

    const customer = await stripe.customers.create({
      email: input.customer.email,
      name: input.customer.name ?? undefined,
      metadata: { orderId: input.orderId },
    });

    for (const line of input.lines) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        currency: input.currency,
        amount: line.unitAmountOere * line.quantity,
        description: `${line.description}${line.quantity > 1 ? ` ×${line.quantity}` : ""}`,
      });
    }

    const created = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 14,
      auto_advance: false,
      automatic_tax: input.automaticTax ? { enabled: true } : undefined,
      metadata: { orderId: input.orderId, ...(input.metadata ?? {}) },
    });

    const invoiceId = created.id;
    if (!invoiceId) throw new Error("Stripe returnerede ingen invoice-id.");
    const finalized = await stripe.invoices.finalizeInvoice(invoiceId);

    return {
      provider: this.name,
      id: finalized.id ?? invoiceId,
      pdfUrl: finalized.invoice_pdf ?? null,
      hostedUrl: finalized.hosted_invoice_url ?? null,
      status: finalized.status ?? "open",
    };
  }
}
