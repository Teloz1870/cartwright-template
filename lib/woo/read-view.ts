import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { readLedger, type WooLedger } from "@/lib/woo/ledger";
import { WOO_SOURCE, type MappedProduct } from "@/lib/woo/map-catalog";
import { WooView, ownedCategory, ownedProduct, permalinkVariants } from "@/lib/woo/view";

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

const readRows = async (tx: Prisma.TransactionClient) => ({
  categories: await tx.category.findMany({ select: CATEGORY }),
  products: await tx.product.findMany({ select: PRODUCT }),
  extras: await tx.productCategory.findMany({ select: EXTRA }),
});

// A client generated for one provider types only that provider's levels, and this module serves both.
const options = (dialect: WooReadDialect) => ({ isolationLevel: ISOLATION[dialect] as Prisma.TransactionIsolationLevel, ...BOUNDS });

function viewOf({ categories, products, extras }: Awaited<ReturnType<typeof readRows>>): WooView {
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

const LINK = { select: { id: true, source: true, externalId: true } } as const;
/** A product with what its projection names: its category and its secondary links. Also what a product write reads back. */
export const OWNED_PRODUCT = { ...PRODUCT, category: LINK, extraCategories: { select: { category: LINK } } } as const;

/**
 * A product chunk's view (spec §3F S3), keyed, never all of `Product`: the rows that hold
 * one of the chunk's identities, slugs, skus or permalinks, and the categories that hold
 * one of its category identities or permalinks. A permalink is looked for in every stored
 * spelling of it (`permalinkVariants`), in both tables. Two statements, whatever the catalogue.
 */
export async function readProductView(tx: Prisma.TransactionClient, rows: readonly MappedProduct[]): Promise<WooView> {
  const permalinks = [...new Set(rows.flatMap((r) => (r.permalink ? permalinkVariants(r.permalink) : [])))];
  const refs = [...new Set(rows.flatMap((r) => [...(r.categoryExternalId === null ? [] : [r.categoryExternalId]), ...r.extraCategoryExternalIds]))];
  const products = await tx.product.findMany({
    where: { OR: [{ source: WOO_SOURCE, externalId: { in: rows.map((r) => r.externalId) } }, { slug: { in: rows.map((r) => r.slug) } }, { sku: { in: rows.flatMap((r) => (r.sku ? [r.sku] : [])) } }, { permalink: { in: permalinks } }] },
    select: OWNED_PRODUCT,
  });
  const categories = await tx.category.findMany({ where: { OR: [{ source: WOO_SOURCE, externalId: { in: refs } }, { permalink: { in: permalinks } }] }, select: { id: true, source: true, externalId: true, slug: true, permalink: true, parentId: true } });
  return new WooView({ categories, products: products.map((p) => ({ id: p.id, source: p.source, externalId: p.externalId, slug: p.slug, permalink: p.permalink, sku: p.sku, deletedAt: p.deletedAt, owned: ownedProduct(p) })) });
}

/**
 * A category chunk's view, read inside its own transaction after `lockFirst`
 * (spec §3F S3): every category, for the tree, and every product that holds a
 * permalink, as a key holder alone (no slug, sku or links). The view compares
 * permalinks by `permalinkKey`, so a holder in any spelling is seen: a filter
 * on spellings would miss one written differently. Two statements, whatever the chunk.
 */
export async function readCategoryView(tx: Prisma.TransactionClient): Promise<WooView> {
  const view = viewOf({ categories: await tx.category.findMany({ select: CATEGORY }), products: [], extras: [] });
  const held = await tx.product.findMany({ where: { permalink: { not: null } }, select: { id: true, source: true, permalink: true } });
  // Holders only: a product's slug is keyed in its own table, which no category's decision reads.
  for (const p of held) view.record(undefined, { ...p, kind: "product", externalId: null, slug: "" });
  return view;
}

export async function readFullView(db: Pick<PrismaClient, "$transaction">, dialect: WooReadDialect): Promise<WooView> {
  return viewOf(await db.$transaction(readRows, options(dialect)));
}

/**
 * The view and the baseline as ONE point in time: a chunk commits its rows and their
 * entries together (spec §3F S6), so read apart a row could come back without the entry
 * that says who wrote it. `runStore`: the shop this run read, refused if the project now names another.
 */
export async function readViewAndLedger(db: Pick<PrismaClient, "$transaction">, dialect: WooReadDialect, projectId: string, runStore?: string): Promise<{ view: WooView; store: string; baseline: WooLedger }> {
  const { rows, read } = await db.$transaction(async (tx) => ({ read: await readLedger(tx, projectId, runStore), rows: await readRows(tx) }), options(dialect));
  return { view: viewOf(rows), store: read.store, baseline: read.ledger };
}
