/**
 * Maskin-læsbart PII-inventar — kilden til både docs/gdpr/pii-inventory.md og
 * checklisten bag DSAR-export (B1) og soft-erasure (B2).
 *
 * NB: Selve erasure-mutationerne i B2 er EKSPLICITTE, typede Prisma-updates
 * (ikke dynamiske felt-skrivninger ud fra strenge) — denne map er sandheds-
 * kilden/dokumentationen de er afstemt imod, ikke en runtime-skrive-motor.
 *
 * Pure-data modul — ingen runtime-imports.
 */

/** Hvordan et PII-felt behandles ved soft-erasure. */
export type ErasureStrategy =
  /** Sæt til null (nullable felt). */
  | "null"
  /** Erstat med en konstant placeholder ("[slettet]"). */
  | "redact"
  /** Erstat email med en salted hash (bevarer dedup/linkage uden PII). */
  | "hash"
  /** Behold uændret (finansielt/lovligt — fx beløb, stripePaymentIntentId). */
  | "keep";

/** Hvordan en records ejer (data subject) findes. */
export type SubjectLink =
  /** Direkte FK til User.id. */
  | "userId"
  /** Matchet på email-snapshot (guest-ordrer, leads, reviews, ACP). */
  | "email"
  /** AuditLog: actor === `user:<id>`. */
  | "actor";

export type PiiFieldSpec = {
  field: string;
  strategy: ErasureStrategy;
  note?: string;
};

export type PiiModelSpec = {
  /** Prisma-model-navn. */
  model: string;
  link: SubjectLink;
  /**
   * true = behold rækken (finansiel/lovlig opbevaring) men anonymisér PII-
   * felterne. false = rækken kan slettes helt ved erasure.
   */
  retainRow: boolean;
  fields: PiiFieldSpec[];
  note?: string;
};

/** Placeholder brugt ved "redact". */
/**
 * Written into Order.shippingName/Address/Zip/City, ProductReview.authorName
 * and Lead.name by `lib/gdpr/erase.ts`, then rendered from the row forever
 * (app/admin/ordrer/[id]/page.tsx:77,81). A Danish literal here is not a UI
 * string that a locale switch can fix later — it is permanent data.
 */
export const REDACTED = "[redacted]";

/**
 * Every Order column that erasure leaves alone. Most are the transaction itself,
 * which bookkeeping law keeps (amounts, dates, payment and invoice references);
 * the rest say nothing about a person (status, channel, currency). The PDF behind
 * invoicePdfUrl and the shipment behind trackingNumber live with their processor,
 * like a Stripe customer ("Kendte begrænsninger" in docs/gdpr/pii-inventory.md).
 *
 * tests/unit/gdpr-pii-map.test.ts walks prisma/schema.prisma and goes red for an
 * Order column that is neither here nor erased in PII_MAP, so a new column gets
 * classified the day it is added.
 */
const ORDER_KEPT_COLUMNS = [
  "id",
  "userId", // the row it points at is anonymized, not deleted
  "status",
  "subtotalDkk",
  "shippingDkk",
  "discountDkk",
  "totalDkk",
  "vatOere",
  "invoiceProvider",
  "invoiceId",
  "invoicePdfUrl",
  "discountCode",
  "isAiGenerated",
  "aiAgentSource",
  "carrier",
  "trackingNumber",
  "trackingUrl",
  "estDeliveryFrom",
  "estDeliveryTo",
  "createdAt",
  "stripePaymentIntentId",
  "paymentMethod",
  "paidAt",
  "currency",
  "fxRate",
  "channel",
  "acpSessionId",
  "confirmationEmailSentAt",
  "refundedAt",
  "disputedAt",
  "orderNumber",
  "termsVersion",
  "termsAcceptedAt",
  "externalId",
  "source",
  "paymentProvider",
  "paymentRef",
] as const;

/**
 * Inventar over modeller med kunde-relateret PII. Afstemt med
 * prisma/schema.prisma (gennemgået 2026-05-30). Finansielle felter (beløb,
 * stripe-referencer) er "keep" — bogføringspligt går forud for erasure; PII
 * omkring dem anonymiseres.
 */
export const PII_MAP: readonly PiiModelSpec[] = [
  {
    model: "User",
    link: "userId",
    retainRow: true,
    note: "Kerne-konto. Anonymiseres frem for hard-delete så ordrer/reviews-FKs ikke brydes.",
    fields: [
      { field: "email", strategy: "hash", note: "hash bevarer login-unikhed uden PII" },
      { field: "name", strategy: "redact" },
      { field: "phoneNumber", strategy: "null" },
      { field: "shippingName", strategy: "null" },
      { field: "shippingAddress", strategy: "null" },
      { field: "shippingZip", strategy: "null" },
      { field: "shippingCity", strategy: "null" },
      { field: "passwordHash", strategy: "null", note: "log ud / invalidér login" },
    ],
  },
  {
    model: "Order",
    link: "userId",
    retainRow: true,
    note: "Bogføringspligt: behold beløb + stripePaymentIntentId; anonymisér modtager-PII.",
    fields: [
      { field: "email", strategy: "hash" },
      { field: "shippingName", strategy: "redact" },
      { field: "shippingAddress", strategy: "redact" },
      { field: "shippingZip", strategy: "redact" },
      { field: "shippingCity", strategy: "redact" },
      { field: "billingName", strategy: "null" },
      { field: "billingAddress", strategy: "null" },
      { field: "billingZip", strategy: "null" },
      { field: "billingCity", strategy: "null" },
      { field: "billingCountry", strategy: "null" },
      { field: "phoneNumber", strategy: "null" },
      { field: "cvr", strategy: "null", note: "can name a sole trader" },
      { field: "ean", strategy: "null", note: "can name a sole trader" },
      { field: "reference", strategy: "null", note: "free text, often the buyer's name" },
      ...ORDER_KEPT_COLUMNS.map((field) => ({ field, strategy: "keep" as const })),
    ],
  },
  {
    model: "ProductReview",
    link: "userId",
    retainRow: true,
    note: "Behold rating/body (offentligt indhold) men anonymisér forfatter.",
    fields: [
      { field: "authorName", strategy: "redact" },
      { field: "authorEmail", strategy: "hash" },
    ],
  },
  {
    model: "Subscription",
    link: "userId",
    retainRow: true,
    note: "Stripe-referencer beholdes til afstemning; ingen fri-PII her.",
    fields: [
      { field: "stripeCustomerId", strategy: "keep", note: "ekstern reference — afmeld separat hos Stripe" },
    ],
  },
  {
    model: "Lead",
    link: "email",
    retainRow: false,
    note: "Uverificerede form-leads — kan slettes helt ved request.",
    fields: [
      { field: "name", strategy: "redact" },
      { field: "email", strategy: "hash" },
      { field: "phone", strategy: "null" },
      { field: "company", strategy: "null" },
      { field: "message", strategy: "redact" },
      // Free-form submission payload from a shop's own form. The docs actively
      // encourage putting postcodes, addresses and measurements here, so it is
      // a PII sink and must be erased with the rest of the row.
      { field: "data", strategy: "null" },
    ],
  },
  {
    model: "AcpCheckoutSession",
    link: "email",
    retainRow: false,
    note: "Kortvarige agent-checkout-sessions (30 min TTL) — slettes ved cleanup/erasure.",
    fields: [
      { field: "buyerEmail", strategy: "hash" },
      { field: "buyerName", strategy: "redact" },
      { field: "buyerPhone", strategy: "null" },
      { field: "shippingName", strategy: "redact" },
      { field: "shippingAddress", strategy: "redact" },
      { field: "shippingZip", strategy: "redact" },
      { field: "shippingCity", strategy: "redact" },
    ],
  },
  {
    model: "AuditLog",
    link: "actor",
    retainRow: true,
    note: "argsJson redactes allerede ved skrivning (lib/audit.ts). ip kan nulles ved erasure.",
    fields: [{ field: "ip", strategy: "null" }],
  },
];

/** Modeller hvis hele række slettes ved erasure (i stedet for anonymisering). */
export const DELETABLE_MODELS = PII_MAP.filter((m) => !m.retainRow).map((m) => m.model);
