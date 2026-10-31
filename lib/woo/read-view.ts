import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { WooView, ownedCategory, ownedProduct } from "@/lib/woo/view";

/**
 * W21-live-2 — the whole catalogue as one point in time: the view a dry run
 * hands decide() (spec 2026-10-25, §3D, INV-24). Every row of both tables, ours
 * or not, since any row can hold a key a Woo row wants, and every secondary
 * link, read in ONE transaction. The tree and each link a row's projection names
 * come out of these same rows, never from a read of their own, so a parent the
 * view walks and a parent a fingerprint names cannot disagree. It writes nothing.
 * The client and the dialect are injected.
 */

/** What a run was told its database is, as in lib/woo/ledger.ts. */
export type WooReadDialect = "sqlite" | "postgres";

/**
 * Each dialect's word for one snapshot across statements. libSQL's adapter takes
 * Serializable and refuses every other level. Postgres's RepeatableRead holds one
 * snapshot, and a read under it is never cancelled as a serialization failure,
 * as one under Serializable can be.
 */
const ISOLATION: Record<WooReadDialect, string> = { sqlite: "Serializable", postgres: "RepeatableRead" };
/** A chunk's `maxWait`, and a longer `timeout` than its 20 s: over a network a whole catalogue is not measured yet, and a read takes no write lock. */
const BOUNDS = { maxWait: 5_000, timeout: 60_000 };

const STORED = { id: true, source: true, externalId: true, slug: true, name: true, permalink: true } as const;
const CATEGORY = { ...STORED, description: true, parentId: true } as const;
const PRODUCT = { ...STORED, sku: true, priceDkk: true, description: true, answerSummary: true, attributes: true, deletedAt: true, categoryId: true } as const;
const EXTRA = { productId: true, categoryId: true } as const;

export async function readFullView(db: Pick<PrismaClient, "$transaction">, dialect: WooReadDialect): Promise<WooView> {
  const { categories, products, extras } = await db.$transaction(
    async (tx) => ({
      categories: await tx.category.findMany({ select: CATEGORY }),
      products: await tx.product.findMany({ select: PRODUCT }),
      extras: await tx.productCategory.findMany({ select: EXTRA }),
    }),
    // A client generated for one provider types only that provider's levels, and this module serves both.
    { isolationLevel: ISOLATION[dialect] as Prisma.TransactionIsolationLevel, ...BOUNDS },
  );
  const byId = new Map(categories.map((row) => [row.id, row]));
  // A foreign key the database does not enforce can point past these rows: such a link names no Woo id, and is no root.
  const linked = (id: string) => byId.get(id) ?? { id, source: null, externalId: null };
  const extrasOf = new Map<string, { category: ReturnType<typeof linked> }[]>();
  for (const { productId, categoryId } of extras) extrasOf.set(productId, [...(extrasOf.get(productId) ?? []), { category: linked(categoryId) }]);
  return new WooView({
    categories: categories.map((row) => {
      const { id, source, externalId, slug, permalink, parentId } = row;
      return { id, source, externalId, slug, permalink, parentId, owned: ownedCategory({ ...row, parent: parentId === null ? null : linked(parentId) }) };
    }),
    products: products.map((row) => {
      const { id, source, externalId, slug, permalink, sku, deletedAt, categoryId } = row;
      return { id, source, externalId, slug, permalink, sku, deletedAt, owned: ownedProduct({ ...row, category: linked(categoryId), extraCategories: extrasOf.get(id) ?? [] }) };
    }),
  });
}
