/**
 * InvoiceProvider — det udskiftelige faktura-interface. Cartwright-koden kender
 * KUN dette interface; konkrete providers (Stripe Invoicing, e-conomic, Dinero)
 * implementerer det. Ingen lock-in: skift provider uden at røre kalde-koden.
 *
 * Alle beløb i ØRE (minor units), samme konvention som resten af shoppen.
 */

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  /** Stykpris i øre (inkl. moms hvis policies.pricesIncludeVat). */
  unitAmountOere: number;
};

export type InvoiceInput = {
  orderId: string;
  customer: { email: string; name?: string | null };
  /** ISO-4217 lower-case, fx "dkk". */
  currency: string;
  lines: InvoiceLineInput[];
  vatRatePct: number;
  pricesIncludeVat: boolean;
  /** Aktivér Stripe Tax / automatisk moms (kun Stripe-provideren). */
  automaticTax?: boolean;
  metadata?: Record<string, string>;
};

export type InvoiceResult = {
  provider: string;
  id: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
  status: string;
};

export interface InvoiceProvider {
  readonly name: string;
  createInvoice(input: InvoiceInput): Promise<InvoiceResult>;
}

export type InvoiceProviderName = "stripe" | "economic" | "dinero";
