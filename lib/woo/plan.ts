import { categoryAncestors } from "@/lib/category-tree";
import { decide, type SourceVerdict, type WooSrc } from "@/lib/woo/decide";
import type { GroupName, WooKind } from "@/lib/woo/groups";
import type { WooBaseline } from "@/lib/woo/ledger";
import { WOO_MAPPING_VERSION, htmlDecoder, mapWooCatalog, type MappedCategory, type MappedProduct, type WooWarning } from "@/lib/woo/map-catalog";
import type { WooSnapshot, WooStock } from "@/lib/woo/types";
import { WooView, keysOf, type WooDbState } from "@/lib/woo/view";

export type { WooDbRow, WooDbState } from "@/lib/woo/view";

/**
 * W21-live — the DRY-RUN plan for categories and products: what importing a
 * snapshot WOULD do, against the DB rows the caller gathered. Pure: it writes
 * and deletes nothing; a row gone from the source is only listed, and only
 * when the snapshot is complete.
 *
 * The plan holds no verdict of its own. `sourceVerdicts` is what the source
 * alone says (spec 2026-10-25 §3E, L2), and each row's action and reason are
 * what `decide()` (lib/woo/decide.ts) says over a `WooView` of those rows: the
 * function a write runs again over the rows its own transaction read. Rows are
 * decided parents first, and what would be written goes into the view, so a
 * category the plan would create is `new:<Woo id>` to the rows after it and one
 * it refuses is absent. With no baseline (`WooPlanRun`), a row already here
 * compares as decide() does without one; with no stock, a create says create
 * without the stock its write will need.
 */

export type WooAction = "create" | "update" | "unchanged" | "skip" | "conflict" | "orphan" | "blocked";
export const ACTIONS: readonly WooAction[] = ["create", "update", "unchanged", "skip", "conflict", "orphan", "blocked"];

export type WooPlanItem = {
  externalId: string;
  slug?: string;
  action: WooAction;
  reason?: string;
  dbId?: string;
  /** An update's groups, and the groups whose baseline a run records with no catalogue write. */
  groups?: GroupName[];
  refresh?: GroupName[];
};

export type WooPlan = {
  mappingVersion: number;
  /** Parents first — the order a run creates them in. */
  categories: WooPlanItem[];
  products: WooPlanItem[];
  variations: { attached: number; orphans: WooPlanItem[] };
  counts: Record<"categories" | "products", Record<WooAction, number>>;
  missingInSource: { kind: WooKind; externalId: string; dbId: string }[];
  warnings: WooWarning[];
  /** What the snapshot itself lacks, e.g. wp/v2 extras it could not read. */
  snapshotWarnings: string[];
};

/**
 * `currency` is this shop's (`brand.policies.currency`): a product Woo prices in any other currency is
 * blocked — prices are never converted, and there is no FX in the import. The same holds for the tax
 * basis: the public Store API does not reliably say whether its prices include VAT (that follows the
 * shop's `woocommerce_tax_display_shop`), so the owner states it as `sourcePricesIncludeVat`, and
 * until it is stated, or when it differs from `pricesIncludeVat` (`brand.policies.pricesIncludeVat`),
 * every simple product is blocked.
 */
export type WooPolicy = { currency: string; pricesIncludeVat: boolean; sourcePricesIncludeVat?: boolean };

/** L2 per row by Woo id, a row with nothing against it having no entry; and a policy holding products back, said once for the shop. */
export type SourceVerdicts = {
  categories: ReadonlyMap<string, SourceVerdict>;
  products: ReadonlyMap<string, SourceVerdict>;
  warnings: string[];
};

/** How many ancestors each category has in the source. A chain that never reaches a root within the cap has depth 0 (lib/category-tree). */
function sourceDepths(categories: readonly MappedCategory[]): Map<string, number> {
  // One id index for every walk: rebuilding it per category made a 10,000-category plan quadratic (4 s).
  const tree = new Map(categories.map((c) => [c.externalId, { id: c.externalId, parentId: c.parentExternalId }]));
  return new Map([...tree.keys()].map((id) => [id, categoryAncestors(tree, id).length]));
}

/** Parents first: the order a run creates them in. */
function parentsFirst(categories: readonly MappedCategory[], depth: ReadonlyMap<string, number>): MappedCategory[] {
  return [...categories].sort((a, b) => (depth.get(a.externalId) ?? 0) - (depth.get(b.externalId) ?? 0));
}

/**
 * L2: what the source alone says about each row, with no DB and no baseline.
 * First match wins, and all of it before the DB is asked (lib/woo/decide.ts):
 * a product's currency, then its tax basis, is blocked; a row with no place in
 * the source's tree is an orphan — a category whose parent is not in the
 * source, whose chain loops or runs past the cap, or whose parent is an orphan,
 * and a product with no category, one not in the source, or an orphan; and a
 * unique key two source rows share is a conflict on BOTH rows, since the first
 * listed has no better claim to it. Every row claims its keys, whatever becomes
 * of it, so a verdict on a key does not move with a policy or a product type.
 */
export function sourceVerdicts(
  snapshot: WooSnapshot,
  mapped: { categories: readonly MappedCategory[]; products: readonly MappedProduct[] },
  { currency, pricesIncludeVat, sourcePricesIncludeVat }: WooPolicy,
): SourceVerdicts {
  const say = (action: SourceVerdict["action"], reason: string): SourceVerdict => ({ action, reason });
  const claims = new Map<string, string[]>();
  const claim = (kind: WooKind, row: MappedCategory | MappedProduct) => {
    for (const [key] of keysOf(kind, row)) claims.set(key, [...(claims.get(key) ?? []), `${kind} ${row.externalId}`]);
  };
  for (const row of mapped.categories) claim("category", row);
  for (const row of mapped.products) claim("product", row);
  const duplicated = (kind: WooKind, row: MappedCategory | MappedProduct): SourceVerdict | null => {
    const me = `${kind} ${row.externalId}`;
    for (const [key, label] of keysOf(kind, row)) {
      const rows = claims.get(key) ?? [];
      if (rows.length > 1) return say("conflict", `keyDuplicated: ${label} is also claimed by Woo ${rows.find((other) => other !== me) ?? me}`);
    }
    return null;
  };

  const depth = sourceDepths(mapped.categories);
  const orphans = new Set<string>();
  const categories = new Map<string, SourceVerdict>();
  for (const row of parentsFirst(mapped.categories, depth)) {
    const parent = row.parentExternalId;
    const why = parent === null ? null
      : depth.get(row.externalId) === 0 ? (depth.has(parent) ? "its parent chain loops or runs deeper than the tree cap" : `parent ${parent} is not in the source`)
        : orphans.has(parent) ? `parent ${parent} is an orphan` : null;
    if (why) orphans.add(row.externalId);
    const verdict = why ? say("orphan", why) : duplicated("category", row);
    if (verdict) categories.set(row.externalId, verdict);
  }

  const priced = new Map(snapshot.products.map((p) => [String(p.id), p.prices.currency_code]));
  const foreign = new Set<string>();
  const vat = (incl: boolean) => (incl ? "include VAT" : "exclude VAT");
  const taxBasis =
    sourcePricesIncludeVat === undefined
      ? { code: "taxBasisUnknown", say: "nobody has said whether the shop's prices include VAT (sourcePricesIncludeVat)" }
      : sourcePricesIncludeVat !== pricesIncludeVat
        ? { code: "taxBasisMismatch", say: `the shop's prices ${vat(sourcePricesIncludeVat)}, this shop's ${pricesIncludeVat ? "include" : "exclude"} it` }
        : null;
  const products = new Map<string, SourceVerdict>();
  for (const row of mapped.products) {
    const code = priced.get(row.externalId) ?? "no currency";
    if (code !== currency) foreign.add(code);
    const held = code !== currency ? `currencyMismatch: priced in ${code}, this shop sells in ${currency}` : taxBasis ? `${taxBasis.code}: ${taxBasis.say}` : null;
    const category = row.categoryExternalId;
    const lost = category === null ? "it has no category" : !depth.has(category) ? `its category ${category} is not in the source` : orphans.has(category) ? `its category ${category} is an orphan` : null;
    const verdict = held ? say("blocked", held) : lost ? say("orphan", lost) : duplicated("product", row);
    if (verdict) products.set(row.externalId, verdict);
  }
  return {
    categories,
    products,
    warnings: [
      ...(taxBasis ? [`${taxBasis.say[0].toUpperCase()}${taxBasis.say.slice(1)}: no product is planned, and prices are never converted`] : []),
      ...(foreign.size ? [`The shop prices in ${[...foreign].join(", ")}, this shop in ${currency}: no product is planned, and prices are never converted`] : []),
    ],
  };
}

/** What a run adds: the last run's baseline, wc/v3's stock (a create has no write without it), and the rows it takes; L2 still reads the whole source. */
export type WooPlanRun = { baseline?: WooBaseline; stock?: ReadonlyMap<string, WooStock> | null; picked?: (kind: WooKind, externalId: string) => boolean };

/** Async only because the HTML decoder (jsdom) is loaded on first use; the plan reads and writes nothing, but a view it is given takes the simulated writes. */
export async function planWooCatalog(snapshot: WooSnapshot, db: WooDbState | WooView, policy: WooPolicy, { baseline, stock = null, picked = () => true }: WooPlanRun = {}): Promise<WooPlan> {
  const mapped = mapWooCatalog(snapshot, await htmlDecoder());
  const verdicts = sourceVerdicts(snapshot, mapped, policy);
  const view = db instanceof WooView ? db : new WooView(db);
  const decided: WooWarning[] = [];
  const planned = (src: WooSrc): WooPlanItem => {
    const base = src.kind === "category" ? baseline?.categories : baseline?.products;
    const { action, reason, dbId, warnings: said, write, refresh } = decide(src, view, base?.[src.row.externalId], stock);
    decided.push(...said);
    if (write) view.record(view.own(src.kind, src.row.externalId), write.after);
    return { externalId: src.row.externalId, slug: src.row.slug, action, reason, dbId, ...(action === "update" && write && { groups: write.groups }), ...(refresh.length > 0 && { refresh }) };
  };
  const categories = parentsFirst(mapped.categories, sourceDepths(mapped.categories)).filter((row) => picked("category", row.externalId)).map((row) => planned({ kind: "category", row, verdict: verdicts.categories.get(row.externalId) }));
  // A row the snapshot names no type for is not taken for a simple one.
  const types = new Map(snapshot.products.map((p) => [String(p.id), p.type]));
  const products = mapped.products.filter((row) => picked("product", row.externalId)).map((row) => planned({ kind: "product", row, type: types.get(row.externalId) ?? "", verdict: verdicts.products.get(row.externalId) }));

  const parents = new Set(snapshot.products.map((p) => p.id));
  const orphanVariations = snapshot.variations
    .filter((v) => !parents.has(v.parent))
    .map((v): WooPlanItem => ({ externalId: String(v.id), action: "orphan", reason: `parent ${v.parent} is not in the source` }));

  const missing = (kind: WooKind, complete: boolean, present: readonly { externalId: string }[]) => {
    const listed = new Set(present.map((row) => row.externalId));
    return complete ? view.ownRows(kind).flatMap((r) => (r.externalId && !listed.has(r.externalId) && picked(kind, r.externalId) ? [{ kind, externalId: r.externalId, dbId: r.id }] : [])) : [];
  };
  // A mapping warning names a Woo id and not its kind: an id in both kinds keeps both rows' warnings.
  const taken = new Set([...categories, ...products].map((item) => item.externalId));
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
      ...missing("category", snapshot.meta.categories.complete, mapped.categories),
      ...missing("product", snapshot.meta.products.complete, mapped.products),
    ],
    warnings: [...mapped.warnings.filter((w) => taken.has(w.externalId)), ...decided],
    snapshotWarnings: [
      ...verdicts.warnings,
      ...(wp.complete ? [] : [`wp/v2 answered ${wp.fetched} of ${wp.total ?? "?"} products: the rest keep their stored status and Yoast fields`]),
    ],
  };
}
