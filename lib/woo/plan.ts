import { categoryAncestors } from "@/lib/category-tree";
import { permalinkKey } from "@/lib/urls";
import { WOO_MAPPING_VERSION, WOO_SOURCE, htmlDecoder, mapWooCatalog, wooFingerprint, type MappedCategory, type MappedProduct, type WooWarning } from "@/lib/woo/map-catalog";
import type { WooSnapshot } from "@/lib/woo/types";

/**
 * W21-live — the DRY-RUN plan for categories and products: what importing a
 * snapshot WOULD do, against the DB rows and baseline the caller gathered.
 * Pure: it writes and deletes nothing; a row gone from the source is only
 * listed, and only when the snapshot is complete.
 *
 * Identity is (`source = "woocommerce"`, `externalId`). A unique key — slug
 * and sku per table, permalink across both (URL5) — held by ANY other row (a
 * CSV import, a hand-made row, another Woo id) is a conflict, never a create
 * or an overwrite. A category whose parent is not in the source, or whose
 * chain loops, is an orphan, and so is everything under it and every product
 * whose primary category is one. A NEW category that conflicts is never
 * created, so what it carries is blocked: its subcategories and the products
 * filed under them (a conflicting category that already exists here as ours
 * still carries them). A SECONDARY category that is missing, an orphan or
 * blocked only drops that one assignment, with a warning: the primary
 * category decides where the product lives.
 *
 * A field the snapshot lacks is not a field the source removed: a status or
 * Yoast field wp/v2 did not send (no answer for the product, or no Yoast
 * head) keeps what the DB holds, or what a create writes, so it never turns
 * a row into an update that would erase it.
 */

export type WooAction = "create" | "update" | "unchanged" | "skip" | "conflict" | "orphan" | "blocked";
const ACTIONS: readonly WooAction[] = ["create", "update", "unchanged", "skip", "conflict", "orphan", "blocked"];
type Kind = "category" | "product";

/** A DB row's unique keys and, on a `source = "woocommerce"` row, its owned fields projected like `map-catalog`. */
export type WooDbRow<T> = {
  id: string;
  source: string | null;
  externalId: string | null;
  slug: string;
  permalink: string | null;
  sku?: string | null;
  owned?: T;
};
export type WooDbState = { categories: WooDbRow<MappedCategory>[]; products: WooDbRow<MappedProduct>[] };
/** externalId → the fingerprint the last run wrote. */
export type WooBaseline = { categories: Readonly<Record<string, string>>; products: Readonly<Record<string, string>> };

export type WooPlanItem = {
  externalId: string;
  slug?: string;
  action: WooAction;
  reason?: string;
  dbId?: string;
  /** The source row's fingerprint: the next baseline once the row is written. */
  fingerprint?: string;
};

export type WooPlan = {
  mappingVersion: number;
  /** Parents first — the order a run creates them in. */
  categories: WooPlanItem[];
  products: WooPlanItem[];
  variations: { attached: number; orphans: WooPlanItem[] };
  counts: Record<"categories" | "products", Record<WooAction, number>>;
  missingInSource: { kind: Kind; externalId: string; dbId: string }[];
  warnings: WooWarning[];
  /** What the snapshot itself lacks, e.g. wp/v2 extras it could not read. */
  snapshotWarnings: string[];
};

/**
 * The re-run table (spec principle 3). `src` = the source row now, `db` = the
 * DB row now (null: none), `base` = what the last run wrote. A local edit is
 * never overwritten, and with no baseline nothing says which side changed.
 */
export function threeWay(src: string, db: string | null, base: string | undefined): { action: WooAction; reason?: string } {
  if (db === null) return { action: "create" };
  if (src === db) return { action: "unchanged" };
  if (base === undefined) return { action: "conflict", reason: "differs from the source, and no earlier run says which side changed" };
  if (db === base) return { action: "update" };
  if (src === base) return { action: "skip", reason: "edited locally since the last run; the edit is kept" };
  return { action: "conflict", reason: "changed in the source and locally since the last run" };
}

/** A status or Yoast field this snapshot lacks — wp/v2 did not answer for the product, or sent no Yoast head — keeps the stored value, or what a create writes. Each field on its own. */
function carryWp(row: MappedProduct, stored: MappedProduct | undefined): MappedProduct {
  const kept = <K extends "status" | "metaTitle" | "metaDescription">(key: K, fallback: MappedProduct[K]) =>
    row[key] !== undefined ? row[key] : stored?.[key] !== undefined ? stored[key] : fallback;
  return { ...row, status: kept("status", "active"), metaTitle: kept("metaTitle", null), metaDescription: kept("metaDescription", null) };
}

function keysOf(kind: Kind, row: { slug: string; permalink: string | null; sku?: string | null }): [string, string][] {
  const keys: [string, string][] = [[`${kind}:slug:${row.slug}`, `slug "${row.slug}"`]];
  if (row.sku) keys.push([`${kind}:sku:${row.sku}`, `sku "${row.sku}"`]);
  const path = row.permalink ? permalinkKey(row.permalink) : null;
  if (path) keys.push([`permalink:${path}`, `permalink "${row.permalink}"`]);
  return keys;
}

/**
 * Async only because the HTML decoder (jsdom) is loaded on first use; the plan itself reads and writes nothing.
 * `currency` is this shop's (`brand.policies.currency`): a product Woo prices in any other currency is
 * blocked — prices are never converted, and there is no FX in the import. The same holds for the tax
 * basis: the public Store API does not reliably say whether its prices include VAT (that follows the
 * shop's `woocommerce_tax_display_shop`), so the owner states it as `sourcePricesIncludeVat`, and
 * until it is stated, or when it differs from `pricesIncludeVat` (`brand.policies.pricesIncludeVat`),
 * every product is blocked.
 */
export async function planWooCatalog(
  snapshot: WooSnapshot,
  db: WooDbState,
  {
    currency,
    pricesIncludeVat,
    sourcePricesIncludeVat,
    baseline = { categories: {}, products: {} },
  }: { currency: string; pricesIncludeVat: boolean; sourcePricesIncludeVat?: boolean; baseline?: WooBaseline },
): Promise<WooPlan> {
  const mapped = mapWooCatalog(snapshot, await htmlDecoder());
  // EVERY row per key: a category and a product may share a permalink, and neither may hide the other.
  const holders = new Map<string, (WooDbRow<unknown> & { kind: Kind })[]>();
  const hold = (kind: Kind, row: WooDbRow<unknown>) => {
    for (const [key] of keysOf(kind, row)) holders.set(key, [...(holders.get(key) ?? []), { ...row, kind }]);
  };
  for (const row of db.categories) hold("category", row);
  for (const row of db.products) hold("product", row);
  const claimed = new Map<string, string>();
  const ownRows = <T>(rows: WooDbRow<T>[]) => new Map(rows.filter((r) => r.source === WOO_SOURCE && r.externalId).map((r) => [r.externalId!, r]));
  const own = { category: ownRows(db.categories), product: ownRows(db.products) };

  function decide(kind: Kind, mappedRow: MappedCategory | MappedProduct, base: Readonly<Record<string, string>>): WooPlanItem {
    const existing = own[kind].get(mappedRow.externalId);
    const row = kind === "product" ? carryWp(mappedRow as MappedProduct, existing?.owned as MappedProduct | undefined) : mappedRow;
    const item = { externalId: row.externalId, slug: row.slug, fingerprint: wooFingerprint(row) };
    for (const [key, label] of keysOf(kind, row)) {
      const holder = holders.get(key)?.find((h) => !(h.kind === kind && h.source === WOO_SOURCE && h.externalId === row.externalId));
      if (holder) {
        return { ...item, action: "conflict", reason: `${label} is taken by ${holder.source ?? "a hand-made"} ${holder.kind} ${holder.id}` };
      }
      const twin = claimed.get(key);
      if (twin) return { ...item, action: "conflict", reason: `${label} is also claimed by Woo ${twin}` };
    }
    for (const [key] of keysOf(kind, row)) claimed.set(key, `${kind} ${row.externalId}`);
    if (existing && !existing.owned) return { ...item, action: "conflict", dbId: existing.id, reason: "the DB row has no owned projection" };
    const dbPrint = existing?.owned ? wooFingerprint(existing.owned as MappedCategory | MappedProduct) : null;
    return { ...item, ...threeWay(item.fingerprint, dbPrint, base[row.externalId]), dbId: existing?.id };
  }

  // Parents first. A chain that never reaches a root within the cap has depth 0 (lib/category-tree).
  // One id index for every walk: rebuilding it per category made a 10,000-category plan quadratic (4 s).
  const tree = new Map(mapped.categories.map((c) => [c.externalId, { id: c.externalId, parentId: c.parentExternalId }]));
  const depth = new Map([...tree.keys()].map((id) => [id, categoryAncestors(tree, id).length]));
  /** Categories nothing can be filed under, and why: an orphan, or a new one that will not be created. */
  const unusable = new Map<string, "orphan" | "blocked">();
  const carried = (id: string, as: string): Pick<WooPlanItem, "action" | "reason"> | null => {
    const why = unusable.get(id);
    return why ? { action: why, reason: `${as} ${id} ${why === "orphan" ? "is an orphan" : "conflicts and does not exist here"}` } : null;
  };
  const categories = [...mapped.categories]
    .sort((a, b) => depth.get(a.externalId)! - depth.get(b.externalId)!)
    .map((row): WooPlanItem => {
      const parent = row.parentExternalId;
      const head = { externalId: row.externalId, slug: row.slug };
      const fromParent = parent === null ? null : carried(parent, "parent");
      const item: WooPlanItem =
        parent !== null && depth.get(row.externalId) === 0
          ? { ...head, action: "orphan", reason: depth.has(parent) ? "its parent chain loops or runs deeper than the tree cap" : `parent ${parent} is not in the source` }
          : fromParent ? { ...head, ...fromParent } : decide("category", row, baseline.categories);
      if (item.action === "orphan" || item.action === "blocked") unusable.set(row.externalId, item.action);
      else if (item.action === "conflict" && !own.category.has(row.externalId)) unusable.set(row.externalId, "blocked");
      return item;
    });

  const inSource = new Set(mapped.categories.map((c) => c.externalId));
  const planWarnings: WooWarning[] = [];
  const priced = new Map(snapshot.products.map((p) => [String(p.id), p.prices.currency_code]));
  const foreign = new Set<string>();
  const vat = (incl: boolean) => (incl ? "include VAT" : "exclude VAT");
  const taxBasis =
    sourcePricesIncludeVat === undefined
      ? { code: "taxBasisUnknown", say: "nobody has said whether the shop's prices include VAT (sourcePricesIncludeVat)" }
      : sourcePricesIncludeVat !== pricesIncludeVat
        ? { code: "taxBasisMismatch", say: `the shop's prices ${vat(sourcePricesIncludeVat)}, this shop's ${pricesIncludeVat ? "include" : "exclude"} it` }
        : null;
  const products = mapped.products.map((row): WooPlanItem => {
    const category = row.categoryExternalId;
    const head = { externalId: row.externalId, slug: row.slug };
    const code = priced.get(row.externalId) ?? "no currency";
    if (code !== currency) {
      foreign.add(code);
      return { ...head, action: "blocked", reason: `currencyMismatch: priced in ${code}, this shop sells in ${currency}` };
    }
    if (taxBasis) return { ...head, action: "blocked", reason: `${taxBasis.code}: ${taxBasis.say}` };
    if (category === null) return { ...head, action: "orphan", reason: "it has no category" };
    if (!inSource.has(category)) return { ...head, action: "orphan", reason: `its category ${category} is not in the source` };
    const blocked = carried(category, "its category");
    if (blocked) return { ...head, ...blocked };
    const extras = row.extraCategoryExternalIds.filter((id) => {
      const why = !inSource.has(id) ? "is not in the source" : unusable.get(id) === "orphan" ? "is an orphan" : unusable.has(id) ? "conflicts and does not exist here" : null;
      if (why) planWarnings.push({ code: "extraCategoryDropped", externalId: row.externalId, detail: `category ${id} ${why}; the product is filed without it` });
      return why === null;
    });
    return decide("product", { ...row, extraCategoryExternalIds: extras }, baseline.products);
  });

  const parents = new Set(snapshot.products.map((p) => p.id));
  const orphanVariations = snapshot.variations
    .filter((v) => !parents.has(v.parent))
    .map((v): WooPlanItem => ({ externalId: String(v.id), action: "orphan", reason: `parent ${v.parent} is not in the source` }));

  const missing = (kind: Kind, complete: boolean, present: Set<string>) =>
    complete ? [...own[kind].values()].filter((r) => !present.has(r.externalId!)).map((r) => ({ kind, externalId: r.externalId!, dbId: r.id })) : [];
  const wp = snapshot.meta.wpProducts;
  const tally = (items: WooPlanItem[]) =>
    Object.fromEntries(ACTIONS.map((a) => [a, items.filter((i) => i.action === a).length])) as Record<WooAction, number>;

  return {
    mappingVersion: WOO_MAPPING_VERSION,
    categories,
    products,
    variations: { attached: snapshot.variations.length - orphanVariations.length, orphans: orphanVariations },
    counts: { categories: tally(categories), products: tally(products) },
    missingInSource: [
      ...missing("category", snapshot.meta.categories.complete, new Set(mapped.categories.map((c) => c.externalId))),
      ...missing("product", snapshot.meta.products.complete, new Set(mapped.products.map((p) => p.externalId))),
    ],
    warnings: [...mapped.warnings, ...planWarnings],
    snapshotWarnings: [
      ...(taxBasis ? [`${taxBasis.say[0].toUpperCase()}${taxBasis.say.slice(1)}: no product is planned, and prices are never converted`] : []),
      ...(foreign.size ? [`The shop prices in ${[...foreign].join(", ")}, this shop in ${currency}: no product is planned, and prices are never converted`] : []),
      ...(wp.complete ? [] : [`wp/v2 answered ${wp.fetched} of ${wp.total ?? "?"} products: the rest keep their stored status and Yoast fields`]),
    ],
  };
}
