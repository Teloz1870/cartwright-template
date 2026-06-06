import "server-only";

import type { InvoiceProvider, InvoiceInput, InvoiceResult } from "./types";

/**
 * e-conomic-adapter (dansk bogføring, EAN/NemHandel, revisor-sync). STUB —
 * implementerer interfacet så det er valgbart, men kræver opsætning af
 * e-conomic REST-credentials (App-Secret-Token + Agreement-Grant-Token) i
 * IntegrationSettings + selve REST-kaldene (draft → book → send).
 *
 * Dokumentation: https://restdocs.e-conomic.com/ (draft invoices endpoint).
 * Indtil konfigureret kaster den en tydelig fejl frem for at fejle stille.
 */
export class EconomicInvoiceProvider implements InvoiceProvider {
  readonly name = "economic";

  async createInvoice(_input: InvoiceInput): Promise<InvoiceResult> {
    throw new Error(
      "e-conomic-provider er ikke konfigureret endnu. Tilføj credentials i /admin/integrations og implementér REST-kaldene (se lib/invoicing/README.md).",
    );
  }
}
