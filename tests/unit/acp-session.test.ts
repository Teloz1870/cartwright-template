import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      findFirst: vi.fn(),
    },
    productVariant: {
      findFirst: vi.fn(),
    },
    acpCheckoutSession: {
      create: vi.fn(),
    },
    discountCode: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

import { prisma } from "@/lib/db";
import { createSession, serializeAcpSession } from "@/lib/acp";

const productFindFirstMock = prisma.product.findFirst as unknown as Mock;
const variantFindFirstMock = prisma.productVariant.findFirst as unknown as Mock;
const sessionCreateMock = prisma.acpCheckoutSession.create as unknown as Mock;
const discountFindUniqueMock = prisma.discountCode.findUnique as unknown as Mock;

async function echoCreate({ data }: { data: Record<string, unknown> }) {
  return {
    ...data,
    createdAt: new Date("2026-05-20T10:00:00Z"),
    updatedAt: new Date("2026-05-20T10:00:00Z"),
    orderId: null,
  };
}

type ProductRow = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  priceDkk: number;
  stock: number;
  /** Absent is "active", the column default. */
  status?: "active" | "draft";
  deletedAt?: Date;
  variants?: Array<{ id: string; sku: string; priceDkk: number; stock: number }>;
};

/**
 * Prisma's to-many relation filters as a look-up with an empty inner filter
 * uses them: `none: {}` — no variants; `some: {}` — at least one; `every: {}` —
 * true for any product, one without variants too. Anything else throws, so a
 * look-up this fake cannot answer honestly fails instead of passing.
 */
type VariantsFilter = { none?: object; some?: object; every?: object };
function variantsMatch(variants: unknown[], filter?: VariantsFilter): boolean {
  if (filter === undefined) return true;
  const ops = Object.entries(filter);
  if (ops.length !== 1 || Object.keys(ops[0][1] ?? {}).length > 0) {
    throw new Error(`fake cannot model variants filter ${JSON.stringify(filter)}`);
  }
  const op = ops[0][0];
  if (op === "none") return variants.length === 0;
  if (op === "some") return variants.length > 0;
  if (op === "every") return true;
  throw new Error(`fake cannot model variants filter ${JSON.stringify(filter)}`);
}

/**
 * A fake that answers the way the database would: by the `where` it is given —
 * `slug`, `sku`, `status`, `deletedAt: null` and the `variants` relation filter
 * (see variantsMatch) on a product, `sku` and `product: { status, deletedAt }`
 * on a variant. An absent filter is no filter, as in Prisma, so a look-up that
 * drops `deletedAt` sees soft-deleted rows, and one that drops `status` drafts.
 */
function catalog(rows: ProductRow[]) {
  const live = (row: ProductRow, where?: { status?: string; deletedAt?: null }) =>
    (where?.deletedAt !== null || !row.deletedAt) &&
    (where?.status === undefined || (row.status ?? "active") === where.status);
  productFindFirstMock.mockImplementation(
    async ({
      where,
    }: {
      where: {
        slug?: string;
        sku?: string;
        status?: string;
        deletedAt?: null;
        variants?: VariantsFilter;
      };
    }) =>
      rows.find(
        (row) =>
          live(row, where) &&
          (where.slug === undefined || row.slug === where.slug) &&
          (where.sku === undefined || row.sku === where.sku) &&
          variantsMatch(row.variants ?? [], where.variants),
      ) ?? null,
  );
  variantFindFirstMock.mockImplementation(
    async ({
      where,
    }: {
      where: { sku: string; product?: { status?: string; deletedAt?: null } };
    }) => {
      for (const row of rows.filter((row) => live(row, where.product))) {
        const variant = row.variants?.find((v) => v.sku === where.sku);
        if (variant) {
          return { ...variant, product: { id: row.id, slug: row.slug, name: row.name } };
        }
      }
      return null;
    },
  );
}

const mug: ProductRow = {
  id: "prod_mug",
  slug: "blue-mug",
  sku: "CW-MUG-01",
  name: "Blue Mug",
  priceDkk: 12900,
  stock: 4,
};

/**
 * A parent whose own sku is also one of its variants' — the schema allows it.
 * It has stock of its own, so a look-up that wrongly lets the parent through
 * orders it rather than stopping at acp_out_of_stock.
 */
const tee: ProductRow = {
  id: "prod_tee",
  slug: "tee",
  sku: "CW-TEE",
  name: "Tee",
  priceDkk: 9900,
  stock: 5,
  variants: [
    { id: "var_tee_m", sku: "CW-TEE", priceDkk: 11000, stock: 3 },
    { id: "var_tee_l", sku: "tee-l", priceDkk: 12000, stock: 3 },
  ],
};

describe("ACP checkout sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productFindFirstMock.mockResolvedValue(null);
    variantFindFirstMock.mockResolvedValue(null);
    discountFindUniqueMock.mockResolvedValue(null);
  });

  it("creates a session from a product slug with stock check and minor-unit totals", async () => {
    productFindFirstMock.mockImplementation(async ({ where }) =>
      where.slug === "classic-frame"
        ? {
            id: "prod_1",
            slug: "classic-frame",
            sku: null,
            name: "Classic Frame",
            priceDkk: 19900,
            stock: 5,
          }
        : null,
    );
    sessionCreateMock.mockImplementation(echoCreate);

    const session = await createSession({
      line_items: [{ id: "classic-frame", quantity: 2 }],
      buyer: { email: " buyer@example.com " },
    });

    expect(productFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "classic-frame", status: "active", deletedAt: null },
      }),
    );
    expect(session.line_items).toEqual([
      expect.objectContaining({
        id: "classic-frame",
        product_id: "prod_1",
        quantity: 2,
        unit_amount: 19900,
        amount_total: 39800,
      }),
    ]);
    expect(session.totals).toEqual({
      subtotal: 39800,
      total_shipping: 4900,
      total_discount: 0,
      amount_total: 44700,
    });
  });

  // FEED-SKU: lib/feeds/catalog-feed.ts lists a product without variants under
  // its own sku when no slug or variant sku answers to it, so a bare item_id is
  // tried slug → variant sku → that product's sku, and lands where the feed meant.
  it("resolves a feed item_id that is a product's sku — after the slug and variant look-ups miss", async () => {
    catalog([mug]);
    sessionCreateMock.mockImplementation(echoCreate);

    const session = await createSession({
      line_items: [{ item_id: "CW-MUG-01", quantity: 1 }],
    });

    expect(productFindFirstMock.mock.calls.map(([args]) => args.where)).toEqual([
      { slug: "CW-MUG-01", status: "active", deletedAt: null },
      { sku: "CW-MUG-01", status: "active", deletedAt: null, variants: { none: {} } },
    ]);
    expect(variantFindFirstMock).toHaveBeenCalledTimes(1);
    expect(variantFindFirstMock.mock.invocationCallOrder[0]).toBeLessThan(
      productFindFirstMock.mock.invocationCallOrder[1],
    );
    expect(session.line_items).toEqual([
      expect.objectContaining({
        id: "CW-MUG-01",
        product_id: "prod_mug",
        variant_id: null,
        slug: "blue-mug",
        sku: null, // the variant sku — a product line has none
        unit_amount: 12900,
      }),
    ]);
  });

  it("still resolves the slug an older feed listed a product with a sku under, and echoes that slug", async () => {
    catalog([mug]);
    sessionCreateMock.mockImplementation(echoCreate);

    const session = await createSession({
      line_items: [{ id: "blue-mug", quantity: 1 }],
    });

    expect(session.line_items).toEqual([
      expect.objectContaining({ id: "blue-mug", product_id: "prod_mug" }),
    ]);
  });

  it("a variant sku that is also its parent's own sku orders the variant, at the variant's price", async () => {
    catalog([tee]);
    sessionCreateMock.mockImplementation(echoCreate);

    const session = await createSession({
      line_items: [{ item_id: "CW-TEE", quantity: 1 }],
    });

    expect(session.line_items).toEqual([
      expect.objectContaining({
        id: "CW-TEE",
        product_id: "prod_tee",
        variant_id: "var_tee_m",
        sku: "CW-TEE",
        unit_amount: 11000,
      }),
    ]);
  });

  it("never orders a product with variants by its own sku — the feed does not list it", async () => {
    // The parent is in stock, so a look-up that let it through would order it.
    catalog([{ ...tee, variants: [tee.variants![1]] }]);
    sessionCreateMock.mockImplementation(echoCreate);

    await expect(
      createSession({ line_items: [{ id: "CW-TEE", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "acp_line_item_not_found" });
  });

  it("never orders a soft-deleted product by its own sku", async () => {
    // An agent may still hold an id from a feed fetched before the delete.
    catalog([
      {
        id: "prod_gone",
        slug: "gone-mug",
        sku: "CW-GONE-01",
        name: "Gone Mug",
        priceDkk: 5000,
        stock: 5,
        deletedAt: new Date("2026-01-01"),
      },
    ]);
    sessionCreateMock.mockImplementation(echoCreate);

    await expect(
      createSession({ line_items: [{ item_id: "CW-GONE-01", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "acp_line_item_not_found" });
  });

  it("never orders a soft-deleted product's variant — the live product listed under that sku gets the line", async () => {
    // The feed lists new-tee under "CW-OLD-TEE": the only variant with that sku
    // belongs to a soft-deleted product, so it takes nothing (catalog-feed.ts).
    catalog([
      {
        id: "prod_old_tee",
        slug: "old-tee",
        sku: null,
        name: "Old Tee",
        priceDkk: 9900,
        stock: 5,
        deletedAt: new Date("2026-01-01"),
        variants: [{ id: "var_old_tee", sku: "CW-OLD-TEE", priceDkk: 9900, stock: 5 }],
      },
      { id: "prod_new_tee", slug: "new-tee", sku: "CW-OLD-TEE", name: "New Tee", priceDkk: 8800, stock: 5 },
    ]);
    sessionCreateMock.mockImplementation(echoCreate);

    const session = await createSession({
      line_items: [{ item_id: "CW-OLD-TEE", quantity: 1 }],
    });

    expect(
      session.line_items.map(({ id, product_id, variant_id, unit_amount }) => ({
        id,
        product_id,
        variant_id,
        unit_amount,
      })),
    ).toEqual([{ id: "CW-OLD-TEE", product_id: "prod_new_tee", variant_id: null, unit_amount: 8800 }]);
  });

  // CART-DRAFT-FILTER: a draft is out of sale like a deleted product — the
  // feed never lists one, and an agent that guesses its id gets nothing.
  it.each([
    ["its slug", { slug: "draft-mug" }],
    ["its slug, as a bare item_id", { item_id: "draft-mug" }],
    ["its own sku", { item_id: "CW-DRAFT-01" }],
    ["a variant's sku", { item_id: "CW-DRAFT-TEE-M" }],
    ["a variant's sku, sent as sku", { sku: "CW-DRAFT-TEE-M" }],
  ] as const)("never orders a draft by %s", async (_label, ref) => {
    catalog([
      { id: "prod_dmug", slug: "draft-mug", sku: "CW-DRAFT-01", name: "Draft Mug", priceDkk: 500, stock: 5, status: "draft" },
      {
        id: "prod_dtee",
        slug: "draft-tee",
        sku: null,
        name: "Draft Tee",
        priceDkk: 500,
        stock: 5,
        status: "draft",
        variants: [{ id: "var_dtee_m", sku: "CW-DRAFT-TEE-M", priceDkk: 500, stock: 5 }],
      },
    ]);
    sessionCreateMock.mockImplementation(echoCreate);

    await expect(
      createSession({ line_items: [{ ...ref, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "acp_line_item_not_found" });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("a sku that is another product's slug resolves to the slug's product; each line echoes what it was ordered by", async () => {
    // Product.sku and Product.slug are each unique, not across each other. The
    // feed lists A under its slug here (its sku is B's slug) and B under "cup".
    catalog([
      { id: "prod_a", slug: "a-cup", sku: "cup", name: "A", priceDkk: 1000, stock: 5 },
      { id: "prod_b", slug: "cup", sku: null, name: "B", priceDkk: 2000, stock: 5 },
    ]);
    sessionCreateMock.mockImplementation(echoCreate);

    const session = await createSession({
      line_items: [
        { item_id: "cup", quantity: 1 },
        { item_id: "a-cup", quantity: 1 },
      ],
    });

    expect(
      session.line_items.map(({ id, product_id, unit_amount }) => ({ id, product_id, unit_amount })),
    ).toEqual([
      { id: "cup", product_id: "prod_b", unit_amount: 2000 },
      { id: "a-cup", product_id: "prod_a", unit_amount: 1000 },
    ]);
  });

  it("an explicit slug is never looked up as a product's sku", async () => {
    catalog([mug]);

    await expect(
      createSession({ line_items: [{ slug: "CW-MUG-01", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "acp_line_item_not_found" });
    expect(productFindFirstMock).toHaveBeenCalledTimes(1);
    expect(productFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "CW-MUG-01", status: "active", deletedAt: null } }),
    );
  });

  it("an explicit slug is never looked up as a variant's sku — an explicit sku beside it still is", async () => {
    catalog([tee]);

    await expect(
      createSession({ line_items: [{ slug: "CW-TEE", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "acp_line_item_not_found" });
    expect(variantFindFirstMock).not.toHaveBeenCalled();

    sessionCreateMock.mockImplementation(echoCreate);
    const session = await createSession({
      line_items: [{ slug: "no-such-slug", sku: "tee-l", quantity: 1 }],
    });
    expect(session.line_items).toEqual([
      expect.objectContaining({ id: "tee-l", variant_id: "var_tee_l" }),
    ]);
  });

  it("an explicit sku is only ever a variant's sku", async () => {
    catalog([mug]);

    await expect(
      createSession({ line_items: [{ sku: "CW-MUG-01", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "acp_line_item_not_found" });
    expect(productFindFirstMock).not.toHaveBeenCalled();
  });

  it("serializes stored ACP rows into canonical JSON", () => {
    const row = {
      id: "acs_test",
      status: "ready_for_payment",
      currency: "DKK",
      lineItemsJson: JSON.stringify([
        {
          id: "sku-1",
          productId: "prod_1",
          variantId: "var_1",
          slug: "classic-frame",
          sku: "sku-1",
          name: "Classic Frame",
          quantity: 1,
          unitPriceDkk: 29900,
        },
      ]),
      buyerEmail: "buyer@example.com",
      buyerName: "Buyer",
      buyerPhone: null,
      shippingName: "Buyer",
      shippingAddress: "Main Street 1",
      shippingZip: "1000",
      shippingCity: "Copenhagen",
      shippingCountry: "DK",
      fulfillmentOption: "standard",
      discountCode: null,
      subtotalDkk: 29900,
      shippingDkk: 0,
      discountDkk: 0,
      totalDkk: 29900,
      orderId: null,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-05-20T10:00:00Z"),
      updatedAt: new Date("2026-05-20T10:00:00Z"),
    };

    expect(serializeAcpSession(row)).toEqual({
      id: "acs_test",
      status: "ready_for_payment",
      currency: "DKK",
      line_items: [
        {
          id: "sku-1",
          product_id: "prod_1",
          variant_id: "var_1",
          slug: "classic-frame",
          sku: "sku-1",
          name: "Classic Frame",
          quantity: 1,
          unit_amount: 29900,
          amount_total: 29900,
        },
      ],
      fulfillment_address: {
        name: "Buyer",
        address_line1: "Main Street 1",
        postal_code: "1000",
        city: "Copenhagen",
        country: "DK",
      },
      fulfillment_option: "standard",
      buyer: {
        email: "buyer@example.com",
        name: "Buyer",
        phone: null,
      },
      totals: {
        subtotal: 29900,
        total_shipping: 0,
        total_discount: 0,
        amount_total: 29900,
      },
      messages: [],
    });
  });
});
