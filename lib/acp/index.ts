import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { calcPriceBreakdown } from "@/lib/pricing";
import { validateDiscountCode } from "@/lib/discount";

export const ACP_STATUSES = [
  "not_ready_for_payment",
  "ready_for_payment",
  "completed",
  "canceled",
  "expired",
] as const;

export type AcpStatus = (typeof ACP_STATUSES)[number];

type AcpLineItemSnapshot = {
  id: string;
  productId: string;
  variantId: string | null;
  slug: string;
  sku: string | null;
  name: string;
  quantity: number;
  unitPriceDkk: number;
};

export type AcpCheckoutSessionRow = {
  id: string;
  status: string;
  currency: string;
  lineItemsJson: string;
  buyerEmail: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  shippingName: string | null;
  shippingAddress: string | null;
  shippingZip: string | null;
  shippingCity: string | null;
  shippingCountry: string | null;
  fulfillmentOption: string | null;
  discountCode: string | null;
  subtotalDkk: number;
  shippingDkk: number;
  discountDkk: number;
  totalDkk: number;
  orderId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AcpSerializedSession = {
  id: string;
  status: AcpStatus;
  currency: string;
  line_items: Array<{
    id: string;
    product_id: string;
    variant_id: string | null;
    slug: string;
    sku: string | null;
    name: string;
    quantity: number;
    unit_amount: number;
    amount_total: number;
  }>;
  fulfillment_address: {
    name: string | null;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
  } | null;
  fulfillment_option: string | null;
  buyer: {
    email: string | null;
    name: string | null;
    phone: string | null;
  };
  totals: {
    subtotal: number;
    total_shipping: number;
    total_discount: number;
    amount_total: number;
  };
  messages: Array<{ code: string; message: string }>;
};

export class AcpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AcpError";
  }
}

const lineItemSchema = z.object({
  id: z.string().trim().min(1).optional(),
  item_id: z.string().trim().min(1).optional(),
  slug: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1).optional(),
  quantity: z.number().int().min(1).max(10),
});

const buyerSchema = z
  .object({
    email: z.string().trim().email().optional().nullable(),
    name: z.string().trim().min(1).max(200).optional().nullable(),
    phone: z.string().trim().min(1).max(40).optional().nullable(),
  })
  .strict();

const fulfillmentAddressSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional().nullable(),
    address_line1: z.string().trim().min(1).max(300).optional().nullable(),
    address: z.string().trim().min(1).max(300).optional().nullable(),
    postal_code: z.string().trim().min(1).max(40).optional().nullable(),
    zip: z.string().trim().min(1).max(40).optional().nullable(),
    city: z.string().trim().min(1).max(120).optional().nullable(),
    country: z.string().trim().length(2).optional().nullable(),
  })
  .strict();

export const createSessionInputSchema = z
  .object({
    line_items: z.array(lineItemSchema).min(1).max(20),
    buyer: buyerSchema.optional(),
    fulfillment_address: fulfillmentAddressSchema.optional(),
    fulfillment_option: z.string().trim().min(1).max(120).optional().nullable(),
    discount_code: z.string().trim().min(1).max(80).optional().nullable(),
  })
  .strict();

export const updateSessionInputSchema = z
  .object({
    buyer: buyerSchema.optional(),
    fulfillment_address: fulfillmentAddressSchema.optional(),
    fulfillment_option: z.string().trim().min(1).max(120).optional().nullable(),
    discount_code: z.string().trim().min(1).max(80).optional().nullable(),
  })
  .strict();

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;

function acsId(): string {
  return `acs_${randomUUID().replace(/-/g, "")}`;
}

function canonicalStatus(row: AcpCheckoutSessionRow): AcpStatus {
  if (row.status === "completed" || row.status === "canceled") {
    return row.status;
  }
  if (row.expiresAt <= new Date()) return "expired";
  if (row.status === "ready_for_payment") return "ready_for_payment";
  if (row.status === "expired") return "expired";
  return "not_ready_for_payment";
}

function hasCompleteAddress(row: {
  shippingName: string | null;
  shippingAddress: string | null;
  shippingZip: string | null;
  shippingCity: string | null;
  shippingCountry: string | null;
}): boolean {
  return Boolean(
    row.shippingName &&
      row.shippingAddress &&
      row.shippingZip &&
      row.shippingCity &&
      row.shippingCountry,
  );
}

function nextOpenStatus(row: AcpCheckoutSessionRow): AcpStatus {
  if (row.expiresAt <= new Date()) return "expired";
  return hasCompleteAddress(row) ? "ready_for_payment" : "not_ready_for_payment";
}

function parseLineItems(raw: string): AcpLineItemSnapshot[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AcpLineItemSnapshot => {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.productId === "string" &&
        typeof item.slug === "string" &&
        typeof item.name === "string" &&
        typeof item.quantity === "number" &&
        typeof item.unitPriceDkk === "number"
      );
    });
  } catch {
    return [];
  }
}

function normalizeBuyer(input: CreateSessionInput["buyer"]): {
  email: string | null;
  name: string | null;
  phone: string | null;
} {
  return {
    email: input?.email ? input.email.trim().toLowerCase() : null,
    name: input?.name ? input.name.trim() : null,
    phone: input?.phone ? input.phone.trim() : null,
  };
}

function normalizeAddress(input: CreateSessionInput["fulfillment_address"]): {
  name: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
} {
  return {
    name: input?.name ? input.name.trim() : null,
    address: input?.address_line1
      ? input.address_line1.trim()
      : input?.address
        ? input.address.trim()
        : null,
    zip: input?.postal_code
      ? input.postal_code.trim()
      : input?.zip
        ? input.zip.trim()
        : null,
    city: input?.city ? input.city.trim() : null,
    country: input?.country ? input.country.trim().toUpperCase() : null,
  };
}

function sessionMessages(row: AcpCheckoutSessionRow): Array<{
  code: string;
  message: string;
}> {
  const status = canonicalStatus(row);
  const messages: Array<{ code: string; message: string }> = [];
  if (status === "not_ready_for_payment" && !hasCompleteAddress(row)) {
    messages.push({
      code: "fulfillment_address_required",
      message: "A complete fulfillment_address is required before payment.",
    });
  }
  return messages;
}

async function discountForCode(code: string | null): Promise<{
  type: "percent" | "fixed";
  value: number;
} | null> {
  if (!code) return null;
  const record = await prisma.discountCode.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  const typed =
    record && (record.type === "percent" || record.type === "fixed")
      ? { ...record, type: record.type as "percent" | "fixed" }
      : null;
  const validation = validateDiscountCode(typed, new Date());
  if (!validation.ok) return null;
  return { type: validation.type, value: validation.value };
}

async function resolveLineItem(
  item: z.infer<typeof lineItemSchema>,
): Promise<AcpLineItemSnapshot> {
  const identifier = item.id ?? item.item_id ?? item.slug ?? item.sku;
  if (!identifier) {
    throw new AcpError(
      "acp_line_item_identifier_required",
      "Each line item must include id, item_id, slug, or sku.",
      422,
    );
  }

  if (item.slug || (!item.sku && (item.id || item.item_id))) {
    const slug = item.slug ?? identifier;
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, slug: true, name: true, priceDkk: true, stock: true },
    });
    if (product) {
      if (product.stock < item.quantity) {
        throw new AcpError(
          "acp_out_of_stock",
          `Only ${product.stock} in stock for ${product.slug}.`,
          409,
        );
      }
      return {
        id: product.slug,
        productId: product.id,
        variantId: null,
        slug: product.slug,
        sku: null,
        name: product.name,
        quantity: item.quantity,
        unitPriceDkk: product.priceDkk,
      };
    }
  }

  const sku = item.sku ?? identifier;
  const variant = await prisma.productVariant.findFirst({
    where: { sku, product: { deletedAt: null } },
    select: {
      id: true,
      sku: true,
      priceDkk: true,
      stock: true,
      product: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!variant) {
    throw new AcpError(
      "acp_line_item_not_found",
      `Line item not found: ${identifier}`,
      404,
    );
  }
  if (variant.stock < item.quantity) {
    throw new AcpError(
      "acp_out_of_stock",
      `Only ${variant.stock} in stock for ${variant.sku}.`,
      409,
    );
  }
  return {
    id: variant.sku,
    productId: variant.product.id,
    variantId: variant.id,
    slug: variant.product.slug,
    sku: variant.sku,
    name: variant.product.name,
    quantity: item.quantity,
    unitPriceDkk: variant.priceDkk,
  };
}

function mergeLineItems(
  items: AcpLineItemSnapshot[],
): AcpLineItemSnapshot[] {
  const byKey = new Map<string, AcpLineItemSnapshot>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    existing.quantity += item.quantity;
  }
  return [...byKey.values()];
}

async function priceForLines(
  lines: AcpLineItemSnapshot[],
  discountCode: string | null,
) {
  const discount = await discountForCode(discountCode);
  return calcPriceBreakdown(
    lines.map((line) => ({
      unitPriceDkk: line.unitPriceDkk,
      quantity: line.quantity,
    })),
    discount,
  );
}

async function expireIfNeeded(row: AcpCheckoutSessionRow | null) {
  if (!row) return null;
  if (
    row.expiresAt <= new Date() &&
    row.status !== "completed" &&
    row.status !== "canceled" &&
    row.status !== "expired"
  ) {
    return prisma.acpCheckoutSession.update({
      where: { id: row.id },
      data: { status: "expired" },
    });
  }
  return row;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<AcpSerializedSession> {
  const resolved = mergeLineItems(
    await Promise.all(input.line_items.map((item) => resolveLineItem(item))),
  );
  const discountCode = input.discount_code?.trim().toUpperCase() ?? null;
  const totals = await priceForLines(resolved, discountCode);
  const buyer = normalizeBuyer(input.buyer);
  const address = normalizeAddress(input.fulfillment_address);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const status: AcpStatus =
    address.name &&
    address.address &&
    address.zip &&
    address.city &&
    address.country
      ? "ready_for_payment"
      : "not_ready_for_payment";

  const row = await prisma.acpCheckoutSession.create({
    data: {
      id: acsId(),
      status,
      // ACP/Stripe-konvention er lowercase ISO-4217 (modsat schema.org
      // JSON-LD, der bruger uppercase). Matcher også schemaets default.
      currency: brand.policies.currency.toLowerCase(),
      lineItemsJson: JSON.stringify(resolved),
      buyerEmail: buyer.email,
      buyerName: buyer.name,
      buyerPhone: buyer.phone,
      shippingName: address.name,
      shippingAddress: address.address,
      shippingZip: address.zip,
      shippingCity: address.city,
      shippingCountry: address.country,
      fulfillmentOption: input.fulfillment_option?.trim() ?? null,
      discountCode,
      subtotalDkk: totals.subtotalDkk,
      shippingDkk: totals.shippingDkk,
      discountDkk: totals.discountDkk,
      totalDkk: totals.totalDkk,
      expiresAt,
    },
  });
  return serializeAcpSession(row);
}

export async function retrieveSession(
  id: string,
): Promise<AcpSerializedSession | null> {
  const row = await expireIfNeeded(
    await prisma.acpCheckoutSession.findUnique({ where: { id } }),
  );
  return row ? serializeAcpSession(row) : null;
}

export async function updateSession(
  id: string,
  input: UpdateSessionInput,
): Promise<AcpSerializedSession | null> {
  const current = await expireIfNeeded(
    await prisma.acpCheckoutSession.findUnique({ where: { id } }),
  );
  if (!current) return null;
  const currentStatus = canonicalStatus(current);
  if (
    currentStatus === "completed" ||
    currentStatus === "canceled" ||
    currentStatus === "expired"
  ) {
    throw new AcpError(
      "acp_session_not_updateable",
      `Cannot update a ${currentStatus} ACP checkout session.`,
      409,
    );
  }

  const buyer = input.buyer ? normalizeBuyer(input.buyer) : null;
  const address = input.fulfillment_address
    ? normalizeAddress(input.fulfillment_address)
    : null;
  const discountCode =
    input.discount_code === undefined
      ? current.discountCode
      : input.discount_code
        ? input.discount_code.trim().toUpperCase()
        : null;
  const lines = parseLineItems(current.lineItemsJson);
  const totals = await priceForLines(lines, discountCode);
  const statusProbe: AcpCheckoutSessionRow = {
    ...current,
    ...(address
      ? {
          // fulfillment_address er en FULD erstatning, ikke en patch — en
          // udeladt delfelt bliver null (ikke den gamle DB-værdi). Ellers
          // kan en agent hverken rydde et felt eller stole på status-probet.
          shippingName: address.name,
          shippingAddress: address.address,
          shippingZip: address.zip,
          shippingCity: address.city,
          shippingCountry: address.country,
        }
      : {}),
  };

  const row = await prisma.acpCheckoutSession.update({
    where: { id },
    data: {
      status: nextOpenStatus(statusProbe),
      ...(buyer
        ? {
            buyerEmail: buyer.email,
            buyerName: buyer.name,
            buyerPhone: buyer.phone,
          }
        : {}),
      ...(address
        ? {
            // Fuld erstatning — se status-probet ovenfor.
            shippingName: address.name,
            shippingAddress: address.address,
            shippingZip: address.zip,
            shippingCity: address.city,
            shippingCountry: address.country,
          }
        : {}),
      ...(input.fulfillment_option !== undefined
        ? { fulfillmentOption: input.fulfillment_option?.trim() ?? null }
        : {}),
      discountCode,
      subtotalDkk: totals.subtotalDkk,
      shippingDkk: totals.shippingDkk,
      discountDkk: totals.discountDkk,
      totalDkk: totals.totalDkk,
    },
  });
  return serializeAcpSession(row);
}

export async function cancelSession(
  id: string,
): Promise<AcpSerializedSession | null> {
  const current = await expireIfNeeded(
    await prisma.acpCheckoutSession.findUnique({ where: { id } }),
  );
  if (!current) return null;
  const status = canonicalStatus(current);
  if (status === "completed") {
    throw new AcpError(
      "acp_session_not_cancelable",
      "Cannot cancel a completed ACP checkout session.",
      409,
    );
  }
  if (status === "canceled" || status === "expired") {
    return serializeAcpSession(current);
  }
  const row = await prisma.acpCheckoutSession.update({
    where: { id },
    data: { status: "canceled" },
  });
  return serializeAcpSession(row);
}

export function serializeAcpSession(
  row: AcpCheckoutSessionRow,
): AcpSerializedSession {
  const lineItems = parseLineItems(row.lineItemsJson);
  const hasAddress = Boolean(
    row.shippingName ||
      row.shippingAddress ||
      row.shippingZip ||
      row.shippingCity ||
      row.shippingCountry,
  );

  return {
    id: row.id,
    status: canonicalStatus(row),
    currency: row.currency,
    line_items: lineItems.map((item) => ({
      id: item.id,
      product_id: item.productId,
      variant_id: item.variantId,
      slug: item.slug,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unit_amount: item.unitPriceDkk,
      amount_total: item.unitPriceDkk * item.quantity,
    })),
    fulfillment_address: hasAddress
      ? {
          name: row.shippingName,
          address_line1: row.shippingAddress,
          postal_code: row.shippingZip,
          city: row.shippingCity,
          country: row.shippingCountry,
        }
      : null,
    fulfillment_option: row.fulfillmentOption,
    buyer: {
      email: row.buyerEmail,
      name: row.buyerName,
      phone: row.buyerPhone,
    },
    totals: {
      subtotal: row.subtotalDkk,
      total_shipping: row.shippingDkk,
      total_discount: row.discountDkk,
      amount_total: row.totalDkk,
    },
    messages: sessionMessages(row),
  };
}
