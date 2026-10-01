import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { exportUserData } from "@/lib/gdpr/export";
import { anonymizeCustomer } from "@/lib/gdpr/erase";

const isoDateOutput = z.iso.datetime();

const subjectOutput = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  phoneNumber: z.string().nullable(),
  shippingName: z.string().nullable(),
  shippingAddress: z.string().nullable(),
  shippingZip: z.string().nullable(),
  shippingCity: z.string().nullable(),
  role: z.string(),
  createdAt: isoDateOutput,
}).strict();

const opaquePrismaJsonOutput = z.json().describe(
  "Opaque JSON stored by the commerce model and returned verbatim in a GDPR data export.",
);

const orderItemOutput = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string(),
  productName: z.string(),
  unitPriceDkk: z.number().int(),
  quantity: z.number().int(),
  variantId: z.string().nullable(),
  variantSku: z.string().nullable(),
  variantAttributes: opaquePrismaJsonOutput,
}).strict();

const orderScalarShape = {
  id: z.string(),
  userId: z.string().nullable(),
  email: z.string(),
  status: z.string(),
  shippingName: z.string(),
  shippingAddress: z.string(),
  shippingZip: z.string(),
  shippingCity: z.string(),
  billingName: z.string().nullable(),
  billingAddress: z.string().nullable(),
  billingZip: z.string().nullable(),
  billingCity: z.string().nullable(),
  billingCountry: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  subtotalDkk: z.number().int(),
  shippingDkk: z.number().int(),
  discountDkk: z.number().int(),
  totalDkk: z.number().int(),
  vatOere: z.number().int().nullable(),
  invoiceProvider: z.string().nullable(),
  invoiceId: z.string().nullable(),
  invoicePdfUrl: z.string().nullable(),
  discountCode: z.string().nullable(),
  isAiGenerated: z.boolean(),
  aiAgentSource: z.string().nullable(),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  estDeliveryFrom: isoDateOutput.nullable(),
  estDeliveryTo: isoDateOutput.nullable(),
  createdAt: isoDateOutput,
  stripePaymentIntentId: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  paidAt: isoDateOutput.nullable(),
  currency: z.string(),
  fxRate: z.number(),
  channel: z.string(),
  acpSessionId: z.string().nullable(),
  confirmationEmailSentAt: isoDateOutput.nullable(),
  refundedAt: isoDateOutput.nullable(),
  disputedAt: isoDateOutput.nullable(),
};

const orderOutput = z.object(orderScalarShape).strict();
const orderWithItemsOutput = z.object({
  ...orderScalarShape,
  items: z.array(orderItemOutput),
}).strict();

const reviewOutput = z.object({
  id: z.string(),
  productId: z.string(),
  userId: z.string().nullable(),
  orderId: z.string().nullable(),
  authorName: z.string(),
  authorEmail: z.string(),
  rating: z.number().int(),
  title: z.string().nullable(),
  body: z.string(),
  language: z.string(),
  status: z.string(),
  moderatorNote: z.string().nullable(),
  moderatedBy: z.string().nullable(),
  moderatedAt: isoDateOutput.nullable(),
  reviewToken: z.string().nullable(),
  createdAt: isoDateOutput,
  updatedAt: isoDateOutput,
}).strict();

const subscriptionOutput = z.object({
  id: z.string(),
  userId: z.string(),
  stripeCustomerId: z.string(),
  stripeSubId: z.string(),
  stripePriceId: z.string(),
  status: z.string(),
  currentPeriodEnd: isoDateOutput,
  cancelAtPeriodEnd: z.boolean(),
  pauseCollectionBehavior: z.string().nullable(),
  createdAt: isoDateOutput,
  updatedAt: isoDateOutput,
}).strict();

const cartOutput = z.object({
  id: z.string(),
  sessionId: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: isoDateOutput,
  updatedAt: isoDateOutput,
}).strict();

const leadOutput = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  projectType: z.string().nullable(),
  budget: z.string().nullable(),
  message: z.string().nullable(),
  status: z.string(),
  aiPriority: z.string().nullable(),
  aiSummary: z.string().nullable(),
  aiSuggestedReply: z.string().nullable(),
  attachmentUrls: opaquePrismaJsonOutput,
  createdAt: isoDateOutput,
  updatedAt: isoDateOutput,
}).strict();

const acpCheckoutSessionOutput = z.object({
  id: z.string(),
  status: z.string(),
  currency: z.string(),
  lineItemsJson: z.string(),
  buyerEmail: z.string().nullable(),
  buyerName: z.string().nullable(),
  buyerPhone: z.string().nullable(),
  shippingName: z.string().nullable(),
  shippingAddress: z.string().nullable(),
  shippingZip: z.string().nullable(),
  shippingCity: z.string().nullable(),
  shippingCountry: z.string().nullable(),
  fulfillmentOption: z.string().nullable(),
  discountCode: z.string().nullable(),
  subtotalDkk: z.number().int(),
  shippingDkk: z.number().int(),
  discountDkk: z.number().int(),
  totalDkk: z.number().int(),
  orderId: z.string().nullable(),
  expiresAt: isoDateOutput,
  createdAt: isoDateOutput,
  updatedAt: isoDateOutput,
}).strict();

const userDataExportOutput = z.object({
  exportedAt: isoDateOutput,
  subject: subjectOutput,
  orders: z.array(orderWithItemsOutput),
  guestOrdersSameEmail: z.array(orderOutput),
  reviews: z.array(reviewOutput),
  subscriptions: z.array(subscriptionOutput),
  carts: z.array(cartOutput),
  leads: z.array(leadOutput),
  acpCheckoutSessions: z.array(acpCheckoutSessionOutput),
}).strict();

const eraseUserOutput = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  summary: z.object({
    ordersAnonymized: z.number().int().nonnegative(),
    reviewsAnonymized: z.number().int().nonnegative(),
    leadsDeleted: z.number().int().nonnegative(),
    acpSessionsDeleted: z.number().int().nonnegative(),
    apiKeysRevoked: z.number().int().nonnegative(),
    auditIpsCleared: z.number().int().nonnegative(),
    userAnonymized: z.literal(1),
  }).strict(),
}).strict();

/**
 * Admin AI tools for GDPR data-subject requests. gdpr.export_user assembles a
 * full export for a customer (art. 15/20). skipAudit: the result IS the
 * customer's PII — we don't want it copied into the audit afterJson; the
 * invocation itself is admin-gated via the customer:read scope.
 */
export const exportUserTool = defineTool({
  name: "gdpr.export_user",
  description:
    "Export all stored data for one customer (GDPR data-subject access request): profile, orders, guest orders on the same email, reviews, subscriptions, carts, leads, and ACP checkout sessions. Read-only. Provide the userId.",
  scope: "customer:read",
  input: z.object({ userId: z.string().min(1) }),
  output: userDataExportOutput,
  skipAudit: true,
  handler: async (args) => {
    const data = await exportUserData(args.userId);
    if (!data) throw new Error(`Ingen bruger med id '${args.userId}'.`);
    return data;
  },
});

export const eraseUserTool = defineTool({
  name: "gdpr.erase_user",
  description:
    "Soft-erase (anonymize) a customer for a GDPR right-to-erasure request. Anonymizes PII on the user, their orders (KEEPS amounts + payment refs for bookkeeping), and reviews; deletes leads + ACP sessions; revokes API keys; clears audit IPs. NOT reversible. Logs a DataErasureRequest. Provide the userId and confirm: true.",
  scope: "settings:write",
  input: z.object({
    userId: z.string().min(1),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  output: eraseUserOutput,
  handler: async (args, ctx) => {
    const result = await anonymizeCustomer(args.userId, ctx.actor);
    if (!result.ok) throw new Error(result.error);
    return result;
  },
});

export const gdprTools = [exportUserTool, eraseUserTool];
