import "server-only";

import type { InvoiceProvider, InvoiceInput, InvoiceResult } from "./types";

/**
 * Dinero-adapter (90k+ danske virksomheder, via Visma Connect OAuth2). STUB —
 * implementerer interfacet så det er valgbart, men kræver OAuth2-opsætning
 * (Visma Connect) + REST-kaldene (book invoices/contacts/products).
 *
 * Dokumentation: https://developer.dinero.dk/. Indtil konfigureret kaster den
 * en tydelig fejl frem for at fejle stille.
 */
export class DineroInvoiceProvider implements InvoiceProvider {
  readonly name = "dinero";

  async createInvoice(_input: InvoiceInput): Promise<InvoiceResult> {
    throw new Error(
      "Dinero-provider er ikke konfigureret endnu. Tilføj Visma Connect OAuth2-credentials i /admin/integrations og implementér REST-kaldene (se lib/invoicing/README.md).",
    );
  }
}
