import { categoryHref } from "@/lib/urls";
import { translatedField } from "@/lib/translated-field";

/**
 * The category tree as the storefront reads it (WP2-r1′).
 *
 * `Category.parentId` exists since schema batch A, but nothing on the shop
 * followed it: a parent category page listed only the products assigned to it
 * directly, and the breadcrumb jumped from "All products" straight to the
 * category. A WooCommerce import is exactly the shop where that breaks — the
 * products sit in the leaves (`Product.categoryId` is one field, the primary
 * category), so every parent page of a 3-level tree rendered empty.
 *
 * Everything here is a pure function over ONE fetched list of rows
 * (`CATEGORY_TREE_SELECT`), so it is testable without a database and costs at
 * most one query per page, not one per level — none for a category with
 * neither a parent nor children, which the page knows from its own lookup. A
 * shop with no `parentId` anywhere — every shop before WP2 — gets no ancestors
 * and only the category itself as "descendants", which is what keeps its pages
 * byte-identical.
 */

/** The columns the tree helpers read — one `findMany({ select })` per page. */
export const CATEGORY_TREE_SELECT = {
  id: true,
  parentId: true,
  slug: true,
  name: true,
  permalink: true,
  translations: true,
} as const;

/**
 * How many levels the walks follow. Hegnsfabrikken has 3; a tree deeper than
 * 10 is a data error, and the cap is what bounds a walk over one.
 */
export const CATEGORY_TREE_MAX_DEPTH = 10;

export type CategoryTreeNode = { id: string; parentId: string | null };

export type CategoryTreeRow = CategoryTreeNode & {
  slug: string;
  name: string;
  permalink: string | null;
  translations?: unknown;
};

/**
 * The category's ancestors, root first — `[grandparent, parent]` — without
 * the category itself.
 *
 * The walk must END at a root (a row without a parent, or a parent the rows do
 * not contain) within `CATEGORY_TREE_MAX_DEPTH` steps. A parent loop — A→B→A,
 * or a category that is its own parent — has no root, and a chain cut off at
 * an arbitrary point of the loop would tell Google that A sits under B on one
 * page and B under A on the other. Such a chain is dropped: the page renders
 * the trail it rendered before the tree existed.
 *
 * `rows` may also be the id → row index itself, so a caller that walks from
 * every category builds it once instead of once per walk (W21-live's plan).
 */
export function categoryAncestors<T extends CategoryTreeNode>(
  rows: readonly T[] | ReadonlyMap<string, T>,
  id: string,
): T[] {
  const byId: ReadonlyMap<string, T> = rows instanceof Map ? rows : new Map((rows as readonly T[]).map((row) => [row.id, row]));
  const seen = new Set([id]);
  const chain: T[] = [];
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId !== null) {
    const parent = byId.get(parentId);
    if (!parent) break; // a parent the rows do not hold: the chain stops here
    if (seen.has(parent.id) || chain.length >= CATEGORY_TREE_MAX_DEPTH) return [];
    seen.add(parent.id);
    chain.push(parent);
    parentId = parent.parentId;
  }
  return chain.reverse();
}

/** Parent id → its children's ids, in row order. */
type CategoryChildIndex = ReadonlyMap<string, readonly string[]>;

/**
 * One pass over the rows, reading each row's `parentId` once. Every walk DOWN
 * the tree reads this index, never the rows, so a caller that walks from many
 * categories builds it once: rebuilding it per walk is what made the counts
 * over N categories cost N² (WP2-r1′-b R1).
 */
function categoryChildIndex(rows: readonly CategoryTreeNode[]): CategoryChildIndex {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    const parentId = row.parentId;
    if (parentId === null) continue;
    const siblings = children.get(parentId);
    if (siblings) siblings.push(row.id);
    else children.set(parentId, [row.id]);
  }
  return children;
}

/**
 * The category's own id first, then every descendant's, breadth-first. Each
 * id appears once however the rows loop, and the walk stops after
 * `CATEGORY_TREE_MAX_DEPTH` levels.
 */
export function categoryWithDescendantIds(
  rows: readonly CategoryTreeNode[],
  id: string,
): string[] {
  return descendantIdsFromIndex(categoryChildIndex(rows), id);
}

/** The walk behind `categoryWithDescendantIds`, over a prebuilt index. */
function descendantIdsFromIndex(children: CategoryChildIndex, id: string): string[] {
  const ids = [id];
  const seen = new Set(ids);
  let level = [id];
  for (let depth = 0; depth < CATEGORY_TREE_MAX_DEPTH && level.length > 0; depth++) {
    const next: string[] = [];
    for (const parentId of level) {
      for (const childId of children.get(parentId) ?? []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        ids.push(childId);
        next.push(childId);
      }
    }
    level = next;
  }
  return ids;
}

/**
 * The ids of the categories that hold at least one EXTRA product through
 * `ProductCategory` (WP2-r2′; `lib/category-links.ts` reads them). Empty on a
 * shop that files every product under its primary category alone.
 */
export type LinkedCategoryIds = ReadonlySet<string>;

const NO_LINKS: LinkedCategoryIds = new Set();

type IdMatch = string | { in: string[] };

/** A product in the subtree as its primary category OR as an extra one. */
export type ExtraCategoriesWhere = {
  OR: [
    { categoryId: IdMatch } | { category: CategorySubtreeFilter },
    { extraCategories: { some: { categoryId: IdMatch } | { category: CategorySubtreeFilter } } },
  ];
};

const idMatch = (ids: string[]): IdMatch => (ids.length === 1 ? ids[0] : { in: ids });

/**
 * WP2-r2′: the subtree's products when one of its categories holds extra
 * products — listed whether the category is a product's primary one or an
 * extra one, once each, since it is one `OR` and not two queries. `null` when
 * no category of the subtree is linked, so every shop without
 * `ProductCategory` rows keeps the clause it had, byte for byte.
 *
 * The two legs share one bind budget: by id while the subtree's ids plus the
 * linked ones fit `CATEGORY_IN_LIST_MAX`, past that both follow the parent
 * chain — `2 × (CATEGORY_TREE_MAX_DEPTH + 1)` values however wide the tree.
 */
function withExtraCategories(
  ids: string[],
  id: string,
  linked: LinkedCategoryIds,
): ExtraCategoriesWhere | null {
  const extra = linked.size === 0 ? [] : ids.filter((categoryId) => linked.has(categoryId));
  if (extra.length === 0) return null;
  if (ids.length + extra.length <= CATEGORY_IN_LIST_MAX) {
    return { OR: [{ categoryId: idMatch(ids) }, { extraCategories: { some: { categoryId: idMatch(extra) } } }] };
  }
  const subtree = categorySubtreeFilter(id);
  return { OR: [{ category: subtree }, { extraCategories: { some: { category: subtree } } }] };
}

/**
 * The `where` for a category page's products: the category and everything
 * under it. A category without children gets the exact clause the page used
 * before the tree — `{ categoryId }` — not a one-element `in`. Past
 * `CATEGORY_IN_LIST_MAX` ids it is the catalogue's parent-chain filter, so a
 * very wide subtree is one query that fits instead of a P2029 that the page's
 * fail-soft `.catch` showed as an empty grid (WP2-TREE-READ-COST). `linked`
 * adds the products filed under the subtree as an extra category (WP2-r2′).
 */
export function categoryProductsWhere(
  rows: readonly CategoryTreeNode[],
  id: string,
  linked: LinkedCategoryIds = NO_LINKS,
): { categoryId: string | { in: string[] } } | { category: CategorySubtreeFilter } | ExtraCategoriesWhere {
  const ids = categoryWithDescendantIds(rows, id);
  const withExtra = withExtraCategories(ids, id, linked);
  if (withExtra) return withExtra;
  if (ids.length < 2) return { categoryId: id };
  if (ids.length <= CATEGORY_IN_LIST_MAX) return { categoryId: { in: ids } };
  return { category: categorySubtreeFilter(id) };
}

/** The columns a filter by category SLUG reads to find the subtree. */
export const CATEGORY_SUBTREE_SELECT = { id: true, parentId: true, slug: true } as const;

/**
 * The most category ids a filter sends as one `IN (…)` list
 * (CATEGORY-IN-LIST-BIND-LIMIT). Prisma's SQLite/libSQL client refuses a query
 * with more than 999 bind values — measured on Prisma 7.10.1: 997 ids pass,
 * 998 throw P2029, since every `findMany` also binds LIMIT and OFFSET — and the
 * rest of the `where` needs room: the catalogue's `?q=` alone binds up to 128.
 * A wider subtree is matched through the parent relation instead.
 */
export const CATEGORY_IN_LIST_MAX = 500;

/** "Its parent is X, or its parent's parent is …", one level per step. */
type CategoryParentChain =
  | { parentId: string }
  | { OR: [{ parentId: string }, { parent: CategoryParentChain }] };

/** A Category filter for X and everything under it. */
export type CategorySubtreeFilter = { OR: [{ id: string }, CategoryParentChain] };

/**
 * X's subtree as a relation filter: X itself, or a category whose parent —
 * or parent's parent, and so on for `CATEGORY_TREE_MAX_DEPTH` levels — is X.
 * It binds X once per level, so the query stays the same size however wide
 * the subtree. A category is k levels below X exactly when its k-th parent is
 * X, so this matches the ids `categoryWithDescendantIds` returns, loops and
 * depth cap included. Measured on libSQL: one join per level; about 1 ms for a
 * small subtree, 11 ms for 1,300 products under 1,500 subcategories.
 */
function categorySubtreeFilter(id: string): CategorySubtreeFilter {
  let below: CategoryParentChain = { parentId: id };
  for (let depth = 2; depth <= CATEGORY_TREE_MAX_DEPTH; depth++) {
    below = { OR: [{ parentId: id }, { parent: below }] };
  }
  return { OR: [{ id }, below] };
}

/**
 * The `where` for a catalogue filter that names a category by SLUG —
 * `/produkter?kategori=` and `products.search`'s `categorySlug` (WP2-r1′-b):
 * the category and everything under it, by id while the ids fit an `in` list
 * (`CATEGORY_IN_LIST_MAX`), through the parent chain past that. A category
 * without children (every category of a flat shop), a slug the rows do not
 * hold, and no rows at all (a failed tree query) keep the relation clause
 * those filters used before the tree, `{ category: { slug } }`. `linked`
 * adds the subtree's extra products (WP2-r2′), which needs the slug's row.
 */
export function categorySlugWhere(
  rows: readonly (CategoryTreeNode & { slug: string })[],
  slug: string,
  linked: LinkedCategoryIds = NO_LINKS,
):
  | { category: { slug: string } }
  | { categoryId: { in: string[] } }
  | { category: CategorySubtreeFilter }
  | ExtraCategoriesWhere {
  const category = rows.find((row) => row.slug === slug);
  const ids = category ? categoryWithDescendantIds(rows, category.id) : [];
  const withExtra = category ? withExtraCategories(ids, category.id, linked) : null;
  if (withExtra) return withExtra;
  if (!category || ids.length < 2) return { category: { slug } };
  if (ids.length <= CATEGORY_IN_LIST_MAX) return { categoryId: { in: ids } };
  return { category: categorySubtreeFilter(category.id) };
}

/**
 * For each category WITH subcategories: its own count plus every
 * descendant's, each counted once — the number of products its page lists.
 * A category without children is left out, since its own count is already
 * the whole answer; a flat shop gets an empty map.
 *
 * One child index for the whole call, not one per row. A category has one
 * parent, so it is reached by at most `CATEGORY_TREE_MAX_DEPTH + 1` walks — its
 * own and its ancestors' within the cap — and the call stays linear in the
 * rows, however wide the tree.
 */
export function categoryCountsWithDescendants(
  rows: readonly CategoryTreeNode[],
  directCounts: ReadonlyMap<string, number>,
): Map<string, number> {
  const children = categoryChildIndex(rows);
  const totals = new Map<string, number>();
  for (const row of rows) {
    const ids = descendantIdsFromIndex(children, row.id);
    if (ids.length < 2) continue;
    totals.set(row.id, ids.reduce((sum, id) => sum + (directCounts.get(id) ?? 0), 0));
  }
  return totals;
}

/** One `ProductCategory` row as the counts read it, beside its product's primary category. */
export type CategoryLink = { productId: string; categoryId: string; primaryCategoryId: string };

/**
 * The counts with extra categories folded in (WP2-r2′): `direct` is what a
 * category holds itself, primary or extra; `withDescendants` — for a
 * category with subcategories, as `categoryCountsWithDescendants` — what its
 * page lists. Each product counts once per category: a link to a category
 * that already counts it through its primary one — its own, or an ancestor's
 * — adds nothing, and two links in one subtree add one. Without links both
 * maps are what the primary counts gave.
 *
 * "X counts c" is "c is in X's subtree", which is "X is c or one of c's first
 * `CATEGORY_TREE_MAX_DEPTH` parents" — the walk of `categoryWithDescendantIds`
 * read upwards, loops and depth cap included — so a link costs one short walk.
 */
export function categoryCountsWithLinks(
  rows: readonly CategoryTreeNode[],
  primaryCounts: ReadonlyMap<string, number>,
  links: readonly CategoryLink[],
): { direct: Map<string, number>; withDescendants: Map<string, number> } {
  const direct = new Map(primaryCounts);
  const withDescendants = categoryCountsWithDescendants(rows, primaryCounts);
  if (links.length === 0) return { direct, withDescendants };

  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const countedBy = (id: string): Set<string> => {
    const ids = new Set([id]);
    let parentId = parentOf.get(id) ?? null;
    for (let depth = 0; depth < CATEGORY_TREE_MAX_DEPTH && parentId !== null && !ids.has(parentId); depth++) {
      ids.add(parentId);
      parentId = parentOf.get(parentId) ?? null;
    }
    return ids;
  };
  const add = (counts: Map<string, number>, id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);

  const byProduct = new Map<string, { primary: string; extra: string[] }>();
  for (const link of links) {
    const product = byProduct.get(link.productId);
    if (product) product.extra.push(link.categoryId);
    else byProduct.set(link.productId, { primary: link.primaryCategoryId, extra: [link.categoryId] });
  }
  for (const { primary, extra } of byProduct.values()) {
    const counted = countedBy(primary);
    const reached = new Set<string>();
    for (const categoryId of extra) {
      if (categoryId !== primary) add(direct, categoryId);
      for (const id of countedBy(categoryId)) if (!counted.has(id)) reached.add(id);
    }
    for (const id of reached) if (withDescendants.has(id)) add(withDescendants, id);
  }
  return { direct, withDescendants };
}

/**
 * The visible breadcrumb steps for the category's ancestors, in the page's
 * language and linked through `lib/urls.ts`. Callers put them between "All
 * products" and the category, and map the same steps into BreadcrumbList.
 */
export function categoryAncestorCrumbs(
  rows: readonly CategoryTreeRow[],
  id: string,
  locale: string,
): { label: string; href: string }[] {
  return categoryAncestors(rows, id).map((ancestor) => ({
    label: translatedField(ancestor, "name", locale, ancestor.name),
    href: categoryHref({ slug: ancestor.slug, permalink: ancestor.permalink }, locale),
  }));
}
