import { describe, it, expect, vi } from "vitest";

/**
 * The feed and ACP checkout read one id two ways: lib/feeds/catalog-feed.ts
 * picks the id each item is listed under, lib/acp/index.ts (resolveLineItem)
 * turns an item_id an agent sends back into a product or variant. FEED-SKU made
 * that id a product's own sku when it has one, and Product.sku, Product.slug and
 * ProductVariant.sku are separate namespaces — so the two halves are run here
 * against ONE fake database holding the collisions between a product's own sku
 * and the other namespaces: every id listed for a product without variants
 * whose slug or sku the input schema's trim leaves unchanged must come back as
 * that product, at the listed price, and in this catalog every listed id is
 * unique. "Come back" means through the route's own input schema
 * (createSessionInputSchema trims an item_id), not straight into createSession
 * — a feed id that schema would change cannot round-trip.
 *
 * Deliberately NOT in this catalog, and both older than FEED-SKU and still open:
 * - Variant ids that collide. ProductVariant.sku is unique only per product
 *   (@@unique([productId, sku])), so two products' variants can share a sku —
 *   the admin's default template "var-{height}x{width}-{color}"
 *   (components/admin/VariantsAdmin.tsx) makes that likely — and a variant's
 *   sku can be another product's slug. The feed then lists that id twice and
 *   ACP sends both to one item. Nothing here claims variant ids are unique.
 * - A slug with whitespace at either end. Only a SitePack restore writes one
 *   (lib/sitepack keeps a slug as it was; the admin, the products.* tools, CSV,
 *   Sheets, scrape and hoptify write [a-z0-9-] slugs). The feed lists it as it
 *   is, and the schema hands "cup " to ACP as "cup" — another product's slug,
 *   or none. A padded SKU is covered below: the feed never lists one.
 */

type Variant = { id: string; sku: string; priceDkk: number; stock: number; attributes: object };
type Row = {
  id: string;
  slug: string;
  sku: string | null;
  status: "active" | "draft";
  deletedAt: Date | null;
  priceDkk: number;
  variants: Variant[];
};

function row(id: string, slug: string, sku: string | null, extra: Partial<Row> = {}): Row {
  return { id, slug, sku, status: "active", deletedAt: null, priceDkk: 1000, variants: [], ...extra };
}

const variant = (id: string, sku: string, priceDkk: number): Variant => ({
  id,
  sku,
  priceDkk,
  stock: 5,
  attributes: {},
});

const ROWS: Row[] = [
  row("prod_mug", "blue-mug", "CW-MUG-01", { priceDkk: 12900 }), // a free sku
  row("prod_frame", "classic-frame", null), // no sku
  row("prod_blank", "blank-sku", ""), // an empty sku
  row("prod_a", "a-cup", "cup", { priceDkk: 1100 }), // its sku is B's slug
  row("prod_b", "cup", null, { priceDkk: 2200 }),
  // A parent whose own sku is also one of its variants' skus.
  row("prod_tee", "tee", "CW-TEE", {
    variants: [variant("var_tee_m", "CW-TEE", 11000), variant("var_tee_l", "tee-l", 12000)],
  }),
  row("prod_plain", "plain-tee", "tee-l", { priceDkk: 3300 }), // its sku is a variant's
  row("prod_draft", "lamp", null, { status: "draft" }), // listed by neither; its slug is kept from sku ids
  row("prod_lamp", "desk-lamp", "lamp", { priceDkk: 4400 }),
  row("prod_gone", "vase", null, { deletedAt: new Date("2026-01-01") }), // invisible to both
  row("prod_vase", "tall-vase", "vase", { priceDkk: 5500 }),
  // SitePack keeps a sku as it was exported; ACP's input trims an item_id.
  row("prod_pad", "padded-mug", " CW-PAD-01 ", { priceDkk: 6600 }), // trimmed, names nothing
  row("prod_padcup", "padded-cup", " cup ", { priceDkk: 7700 }), // trimmed, is B's slug
  // A soft-deleted product's variants are invisible to both halves: their skus
  // take no id in the feed, and ACP never orders one.
  row("prod_gone_tee", "old-tee", null, {
    deletedAt: new Date("2026-01-01"),
    variants: [variant("var_gone_tee", "CW-OLD-TEE", 9900)],
  }),
  row("prod_new_tee", "new-tee", "CW-OLD-TEE", { priceDkk: 8800 }),
];

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

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({ url: "https://shop.example", policies: { currency: "DKK" } }),
}));
vi.mock("@/lib/media/shim", () => ({ resolveProductImageUrls: () => [] }));
vi.mock("@/lib/db", () => {
  const rows = () => mocks.rows as Row[];
  const asProduct = (r: Row) => ({
    ...r,
    name: r.slug,
    description: "",
    stock: 5,
    brand: null,
    attributes: null,
    permalink: null,
    category: { name: "Things" },
  });
  return {
    prisma: {
      product: {
        findMany: async ({
          where,
          select,
        }: {
          where: { deletedAt?: null; status?: string };
          select?: object;
        }) => {
          const hit = rows().filter(
            (r) =>
              (where.deletedAt !== null || r.deletedAt === null) &&
              (where.status === undefined || r.status === where.status),
          );
          return select ? hit.map((r) => ({ slug: r.slug })) : hit.map(asProduct);
        },
        findFirst: async ({
          where,
        }: {
          where: {
            deletedAt?: null;
            status?: string;
            slug?: string;
            sku?: string;
            variants?: VariantsFilter;
          };
        }) => {
          const r = rows().find(
            (r) =>
              (where.deletedAt !== null || r.deletedAt === null) &&
              (where.status === undefined || r.status === where.status) &&
              (where.slug === undefined || r.slug === where.slug) &&
              (where.sku === undefined || r.sku === where.sku) &&
              variantsMatch(r.variants, where.variants),
          );
          return r ? asProduct(r) : null;
        },
      },
      // An absent filter is no filter, as in Prisma: a `where` that drops
      // `product: { deletedAt: null }` sees soft-deleted products' variants,
      // and one without `product.status` sees drafts' variants.
      productVariant: {
        findMany: async ({ where }: { where?: { product?: { deletedAt?: null } } }) =>
          rows()
            .filter((r) => where?.product?.deletedAt !== null || r.deletedAt === null)
            .flatMap((r) => r.variants.map((v) => ({ sku: v.sku }))),
        findFirst: async ({
          where,
        }: {
          where: { sku: string; product?: { status?: string; deletedAt?: null } };
        }) => {
          for (const r of rows().filter(
            (r) =>
              (where.product?.deletedAt !== null || r.deletedAt === null) &&
              (where.product?.status === undefined || r.status === where.product.status),
          )) {
            const v = r.variants.find((v) => v.sku === where.sku);
            if (v) return { ...v, product: { id: r.id, slug: r.slug, name: r.slug } };
          }
          return null;
        },
      },
      acpCheckoutSession: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          createdAt: new Date("2026-05-20T10:00:00Z"),
          updatedAt: new Date("2026-05-20T10:00:00Z"),
          orderId: null,
        }),
      },
      discountCode: { findUnique: async () => null },
    },
  };
});

import { getCatalogFeed } from "@/lib/feeds/catalog-feed";
import { createSession, createSessionInputSchema } from "@/lib/acp";

mocks.rows = ROWS;

describe("feed id → ACP item_id round trip (FEED-SKU)", () => {
  it("lists every purchasable unit once, under an id no other item in this catalog carries", async () => {
    const ids = (await getCatalogFeed()).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "CW-MUG-01", // a free sku is the id
      "classic-frame",
      "blank-sku",
      "a-cup", // "cup" is B's slug
      "cup",
      "CW-TEE",
      "tee-l",
      "plain-tee", // "tee-l" is a variant's sku
      "desk-lamp", // "lamp" is a draft's slug
      "vase", // a soft-deleted product's slug takes nothing
      "padded-mug", // ACP would trim " CW-PAD-01 "
      "padded-cup", // ACP would trim " cup " to B's slug
      "CW-OLD-TEE", // a soft-deleted product's variant sku takes nothing
    ]);
  });

  it("every id listed here, sent back as item_id, orders the product and variant it was listed for", async () => {
    const feed = await getCatalogFeed();
    const input = createSessionInputSchema.parse({
      line_items: feed.map((i) => ({ item_id: i.id, quantity: 1 })),
    });
    // The schema hands every listed id back exactly as it was listed.
    expect(input.line_items.map((l) => l.item_id)).toEqual(feed.map((i) => i.id));
    const session = await createSession(input);

    const listedFor: Record<string, [string, string | null]> = {
      "CW-MUG-01": ["prod_mug", null],
      "classic-frame": ["prod_frame", null],
      "blank-sku": ["prod_blank", null],
      "a-cup": ["prod_a", null],
      cup: ["prod_b", null],
      "CW-TEE": ["prod_tee", "var_tee_m"],
      "tee-l": ["prod_tee", "var_tee_l"],
      "plain-tee": ["prod_plain", null],
      "desk-lamp": ["prod_lamp", null],
      vase: ["prod_vase", null],
      "padded-mug": ["prod_pad", null],
      "padded-cup": ["prod_padcup", null],
      "CW-OLD-TEE": ["prod_new_tee", null], // never the soft-deleted product's variant
    };
    // An id this test does not expect fails the comparison, not the spread.
    const expected = (id: string) => listedFor[id] ?? ["unexpected feed id", null];
    expect(
      session.line_items.map((l) => [l.id, l.product_id, l.variant_id, l.unit_amount]),
    ).toEqual(feed.map((i) => [i.id, ...expected(i.id), i.priceMinor]));
  });

  it("a draft's slug orders no draft (CART-DRAFT-FILTER): the bare id falls through to the product whose own sku it is", async () => {
    const session = await createSession(
      createSessionInputSchema.parse({ line_items: [{ item_id: "lamp", quantity: 1 }] }),
    );

    expect(session.line_items.map((l) => [l.id, l.product_id])).toEqual([["lamp", "prod_lamp"]]);
  });
});
