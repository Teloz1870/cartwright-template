import { wooTypeSkip } from "@/lib/woo/counts";
import { INT32_MAX, WOO_SOURCE, type MappedCategory, type MappedProduct, type WooWarning } from "@/lib/woo/map-catalog";
import { groupFp, groupNames, groupStates, type GroupName, type GroupState, type WooBaseEntry } from "@/lib/woo/groups";
import type { WooAction } from "@/lib/woo/plan";
import type { WooStock } from "@/lib/woo/types";
import type { ViewRow, WooView } from "@/lib/woo/view";

/**
 * W21-live-2 — THE verdict on one Woo row: one pure function the dry run and
 * every write share, the dry run over one snapshot and a write again over the
 * rows its own transaction read (spec 2026-10-25 §3E). First match wins:
 * L1 the product type — only a simple product is imported; L2 what the source
 * alone says (currency or VAT basis, orphan, a key two source rows claim);
 * L3 the DB — a row deleted here is never written again, a key another row
 * holds is a conflict, else each CONFIRMED group compares source, DB and
 * baseline; L4 the gates of a write, for the fields it writes — a price, a
 * parent or primary category that exists here, no parent loop, and on a
 * create only Woo's exact stock.
 */

/** Every key present, none `undefined`: nothing reaches the ORM as "leave it out". */
type Total<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };
type Ours = { source: string; externalId: string };
export type CategoryPayload = Total<Pick<MappedCategory, "slug" | "name" | "permalink" | "description"> & { parentId: string | null }>;
export type ProductCorePayload = Total<
  Pick<MappedProduct, "slug" | "name" | "permalink" | "sku" | "description" | "answerSummary" | "attributes"> & { categoryId: string; extraCategoryIds: string[] }
>;
export type CreateProductPayload = ProductCorePayload & Ours & { priceDkk: number; stock: number };
/** An update writes its groups and nothing else — never stock: what orders here sold stays sold. */
export type UpdateProductPayload = { core?: ProductCorePayload; price?: { priceDkk: number } };
export type WooWrite =
  | { kind: "category"; op: "create"; payload: CategoryPayload & Ours }
  | { kind: "category"; op: "update"; id: string; payload: CategoryPayload }
  | { kind: "product"; op: "create"; payload: CreateProductPayload }
  | { kind: "product"; op: "update"; id: string; payload: UpdateProductPayload };

/** L2: what the source alone says, with no DB and no baseline. */
export type SourceVerdict = { action: "blocked" | "orphan" | "conflict"; reason: string };
/** A source row, its L2 verdict, and — when the snapshot says more than the row — its state per group. */
export type WooSrc = { verdict?: SourceVerdict; states?: Partial<Record<GroupName, GroupState>> } & (
  | { kind: "category"; row: MappedCategory }
  | { kind: "product"; row: MappedProduct; type: string }
);

export type Decision = {
  action: WooAction;
  /** `code: detail`, e.g. `keyTaken: slug "x" is taken by csv product p1`. */
  reason?: string;
  dbId?: string;
  warnings: WooWarning[];
  /** Groups both sides agree on whose baseline is not (source, source) yet: recorded, with no catalogue write. */
  refresh: GroupName[];
  /** A create or update whose every value is known: a dry run that read no stock writes no create. `after` is the row as written. */
  write?: WooWrite & { groups: GroupName[]; after: ViewRow };
};

/** The stock a create copies — a whole number Woo counts that fits an `Int` — or why not. A fact, read whatever the verdict. */
export function stockFact(stock: WooStock | undefined): "exact" | "noExactStock" | "stockUntracked" {
  const n = stock?.stock_quantity;
  if (!stock) return "noExactStock";
  return stock.manage_stock && typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= INT32_MAX ? "exact" : "stockUntracked";
}

/** Products a create would need wc/v3's exact stock for (simple, not here, never imported) that have none — from the facts, not the verdicts. */
export function withoutExactStock(products: readonly { row: MappedProduct; type: string }[], view: WooView, baseline: Readonly<Record<string, WooBaseEntry>>, stock: ReadonlyMap<string, WooStock>): number {
  const candidate = ({ row, type }: { row: MappedProduct; type: string }) => type === "simple" && !view.own("product", row.externalId) && !baseline[row.externalId];
  return products.filter((p) => candidate(p) && stockFact(stock.get(p.row.externalId)) !== "exact").length;
}

type Cell = "agree" | "noBase" | "source" | "local" | "both";
type Said = Pick<Decision, "action" | "reason" | "warnings">;
type Tail = Said & { write?: WooWrite & { after: ViewRow } };
const blocked = (reason: string): Tail => ({ action: "blocked", reason, warnings: [] });

export function decide(src: WooSrc, view: WooView, base: WooBaseEntry | undefined, stock: ReadonlyMap<string, WooStock> | null): Decision {
  const { kind, row } = src;
  const own = view.own(kind, row.externalId);
  const out = (tail: Said, more: Partial<Decision> = {}): Decision => ({ ...(own && { dbId: own.id }), refresh: [], ...tail, ...more });
  const say = (action: WooAction, reason?: string) => out({ action, ...(reason !== undefined && { reason }), warnings: [] });
  const unsupported = src.kind === "product" ? wooTypeSkip(src.type) : null;
  if (unsupported) return say("skip", `unsupportedType: ${unsupported.reason}`);
  if (src.verdict) return say(src.verdict.action, src.verdict.reason);
  if (base && !own) return say("skip", "deletedHere: deleted here after an earlier run imported it; it is not created again");
  if (own?.deletedAt) return say("skip", "deletedHere: deleted here; a deleted row is never written");
  if (own && base && base.rowId !== own.id) return say("conflict", `replacedHere: the row an earlier run wrote (${base.rowId}) is gone, and ${own.id} holds its identity now`);
  const taken = view.holder(kind, row, own?.id);
  if (taken) return say("conflict", `keyTaken: ${taken.label} is taken by ${taken.by.source ?? "a hand-made"} ${taken.by.kind} ${taken.by.id}`);

  // The row as it would be written: a secondary category that does not exist here is dropped, with a warning.
  const warnings: WooWarning[] = [];
  const extras = (src.kind === "product" ? src.row.extraCategoryExternalIds : []).filter((id) => {
    const here = view.resolveCategory(id) !== null;
    if (!here) warnings.push({ code: "extraCategoryDropped", externalId: row.externalId, detail: `category ${id} does not exist here; the product is filed without it` });
    return here;
  });
  const intended = src.kind === "category" ? src.row : { ...src.row, extraCategoryExternalIds: extras };
  const states = src.states ?? groupStates(kind, intended);
  let groups = groupNames(kind).filter((g) => states[g] === "confirmed");
  let refresh: GroupName[] = [];
  if (own) {
    const owned = own.owned;
    if (!owned) return say("conflict", "noProjection: the row here was read without its owned fields");
    const cells = groups.map((g) => {
      const [s, d, b] = [groupFp(kind, g, intended), groupFp(kind, g, owned), base?.groups[g]];
      const cell: Cell = d === s ? "agree" : !b ? "noBase" : d === b.wrote ? "source" : b.saw === null || s === b.saw ? "local" : "both";
      return { g, cell, stale: cell === "agree" && (b?.saw !== s || b?.wrote !== s) };
    });
    const has = (c: Cell) => cells.some((x) => x.cell === c);
    refresh = cells.filter((x) => x.stale).map((x) => x.g);
    if (has("noBase")) return out({ action: "conflict", reason: "noBaseline: differs from the source, and no earlier run says which side changed", warnings });
    if (has("both") || (has("source") && has("local"))) return out({ action: "conflict", reason: "bothChanged: changed in the source and here since the last run", warnings });
    if (has("local")) return out({ action: "skip", reason: "localEdit: edited here since the last run; the edit is kept", warnings }, { refresh });
    if (!has("source")) return out({ action: "unchanged", warnings }, { refresh });
    groups = cells.filter((x) => x.cell === "source").map((x) => x.g);
  }
  const { write, ...tail } = src.kind === "category" ? writeCategory(src.row, own, view) : writeProduct({ ...src.row, extraCategoryExternalIds: extras }, own, groups, view, stock);
  return out({ ...tail, warnings: [...warnings, ...tail.warnings] }, write && { refresh, write: { ...write, groups } });
}

/** L4 for a category: its parent exists here, and the move closes no loop. */
function writeCategory(row: MappedCategory, own: ViewRow | undefined, view: WooView): Tail {
  const parent = row.parentExternalId;
  const parentId = parent === null ? null : view.resolveCategory(parent);
  if (parent !== null && parentId === null) return blocked(`dependencyMissing: parent ${parent} does not exist here`);
  const id = own?.id ?? `new:${row.externalId}`;
  if (view.loops(id, parentId)) return blocked(`parentLoop: under ${parent} its chain of parents would never reach a root here`);
  const payload: CategoryPayload = { slug: row.slug, name: row.name, permalink: row.permalink, description: row.description, parentId };
  const after: ViewRow = { kind: "category", id, source: WOO_SOURCE, externalId: row.externalId, slug: row.slug, permalink: row.permalink, parentId, owned: row };
  const write: WooWrite = own
    ? { kind: "category", op: "update", id: own.id, payload }
    : { kind: "category", op: "create", payload: { ...payload, source: WOO_SOURCE, externalId: row.externalId } };
  return { action: own ? "update" : "create", warnings: [], write: { ...write, after } };
}

/** L4 for a product, for the groups it writes: a price, its primary category when core is written, and on a create (both groups) Woo's exact stock. */
function writeProduct(row: MappedProduct, own: ViewRow | undefined, groups: GroupName[], view: WooView, stock: ReadonlyMap<string, WooStock> | null): Tail {
  const { priceDkk, categoryExternalId: primary } = row;
  const writes = (g: GroupName) => !own || groups.includes(g);
  if (writes("price") && priceDkk === null) return blocked("noPrice: the source sends no usable price, and no price is written as 0");
  const categoryId = primary === null ? null : view.resolveCategory(primary);
  if (writes("core") && categoryId === null) return blocked(`dependencyMissing: its category ${primary} does not exist here`);
  const extraCategoryIds = row.extraCategoryExternalIds.flatMap((ext) => view.resolveCategory(ext) ?? []);
  const { slug, name, permalink, sku, description, answerSummary, attributes } = row;
  const core = categoryId === null ? null : { slug, name, permalink, sku, description, answerSummary, attributes, categoryId, extraCategoryIds };
  // As written: a price this write leaves alone (unknown in the source, or agreeing) keeps the one here.
  const kept = own?.owned && "priceDkk" in own.owned && !writes("price") ? own.owned.priceDkk : priceDkk;
  const after: ViewRow = { ...own, kind: "product", id: own?.id ?? `new:${row.externalId}`, source: WOO_SOURCE, externalId: row.externalId, slug, permalink, sku, owned: { ...row, priceDkk: kept } };
  if (own) {
    const payload: UpdateProductPayload = { ...(writes("core") && core && { core }), ...(writes("price") && priceDkk !== null && { price: { priceDkk } }) };
    return { action: "update", warnings: [], write: { kind: "product", op: "update", id: own.id, payload, after } };
  }
  // A create writes both groups, so both gates above have passed; the null checks only narrow the types.
  if (stock === null || core === null || priceDkk === null) return { action: "create", warnings: [] }; // a dry run that read no stock
  const fact = stockFact(stock.get(row.externalId));
  if (fact !== "exact") return blocked(`${fact}: ${fact === "noExactStock" ? "wc/v3 did not answer for it" : "Woo does not count its stock in whole units"}, and no stock number is invented`);
  const count = stock.get(row.externalId)?.stock_quantity ?? 0;
  const warnings: WooWarning[] = count < 0 ? [{ code: "stockClamped", externalId: row.externalId, detail: `stock ${count} is created as 0` }] : [];
  const payload: CreateProductPayload = { ...core, source: WOO_SOURCE, externalId: row.externalId, priceDkk, stock: Math.max(0, count) };
  return { action: "create", warnings, write: { kind: "product", op: "create", payload, after } };
}
