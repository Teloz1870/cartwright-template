import { permalinkKey } from "@/lib/urls";
import { WOO_SOURCE, type MappedCategory, type MappedProduct } from "@/lib/woo/map-catalog";
import type { WooKind } from "@/lib/woo/groups";

/**
 * W21-live-2 — the DB rows a decision reads (lib/woo/decide.ts), in memory:
 * from one snapshot for the dry run, from the rows its own transaction read
 * for a write. `record` puts a write into it, so the rows decided after it
 * see it: a category a preview creates is `new:<Woo id>`, one refused is absent.
 */

/** A DB row's unique keys; `parentId` (a category's), `deletedAt` (a product's) and `owned` when the reader read them. */
export type WooDbRow = {
  id: string;
  source: string | null;
  externalId: string | null;
  slug: string;
  permalink: string | null;
  sku?: string | null;
  parentId?: string | null;
  deletedAt?: Date | null;
  /** On a row with our identity: its owned fields as map-catalog maps them (`ownedCategory`, `ownedProduct`). */
  owned?: MappedCategory | MappedProduct;
};
export type WooDbState = { categories: WooDbRow[]; products: WooDbRow[] };
export type ViewRow = WooDbRow & { kind: WooKind };

/** A row a stored row links to (a parent, a category), and how a projection names it: its Woo id, or a name no Woo id can equal. */
type Linked = { id: string; source: string | null; externalId: string | null };
const linkName = (row: Linked) => (row.source === WOO_SOURCE && row.externalId ? row.externalId : `local:${row.id}`);
type Stored = Linked & { slug: string; name: string; permalink: string | null };

/**
 * A stored row as map-catalog maps it, undefined when it is not ours: what a read hands
 * `groupFp`, so a row written as decide() intended reads back as intended (spec §3F S5).
 * An empty text or JSON null is the absence the mapper writes, as other save paths store it.
 */
export function ownedCategory(row: Stored & { description: string | null; parent: Linked | null }): MappedCategory | undefined {
  const { source, externalId, slug, name, permalink, description, parent } = row;
  if (source !== WOO_SOURCE || !externalId) return undefined;
  return { externalId, slug, name, permalink, parentExternalId: parent && linkName(parent), description: description || null };
}

export function ownedProduct(
  row: Stored & { sku: string | null; priceDkk: number; description: string; answerSummary: string | null; attributes: unknown; category: Linked; extraCategories: { category: Linked }[] },
): MappedProduct | undefined {
  const { source, externalId, slug, name, permalink, sku, priceDkk, description, answerSummary, attributes, category, extraCategories } = row;
  if (source !== WOO_SOURCE || !externalId) return undefined;
  const links = { categoryExternalId: linkName(category), extraCategoryExternalIds: extraCategories.map((l) => linkName(l.category)).sort() };
  return { externalId, slug, name, permalink, sku, priceDkk, ...links, description, answerSummary: answerSummary || null, attributes: (attributes ?? {}) as Record<string, string[]> };
}

/** A row's unique keys: slug and sku per table, the permalink across both (URL5), keyed as the proxy keys it. */
export function keysOf(kind: WooKind, row: { slug: string; permalink: string | null; sku?: string | null }): [string, string][] {
  const keys: [string, string][] = [[`${kind}:slug:${row.slug}`, `slug "${row.slug}"`]];
  if (row.sku) keys.push([`${kind}:sku:${row.sku}`, `sku "${row.sku}"`]);
  const path = row.permalink ? permalinkKey(row.permalink) : null;
  if (path) keys.push([`permalink:${path}`, `permalink "${row.permalink}"`]);
  return keys;
}

/** Every stored spelling of one address — as sent, decoded, percent-encoded in upper and lower hex, each with and without the trailing slash — for a keyed read of its holders. */
export function permalinkVariants(raw: string): string[] {
  const key = permalinkKey(raw);
  if (key === null) return [raw];
  const upper = key.split("/").map(encodeURIComponent).join("/");
  const lower = upper.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase());
  return [...new Set([raw, ...[key, upper, lower].flatMap((form) => [form, `${form}/`])])];
}

export class WooView {
  private readonly ours = new Map<string, ViewRow>();
  private readonly held = new Map<string, ViewRow[]>();
  private readonly parentOf = new Map<string, string | null>();

  constructor(state: WooDbState) {
    for (const row of state.categories) this.add({ ...row, kind: "category" });
    for (const row of state.products) this.add({ ...row, kind: "product" });
  }

  private add(row: ViewRow): void {
    if (row.source === WOO_SOURCE && row.externalId) this.ours.set(`${row.kind}:${row.externalId}`, row);
    for (const [key] of keysOf(row.kind, row)) this.held.set(key, [...(this.held.get(key) ?? []), row]);
    if (row.kind === "category") this.parentOf.set(row.id, row.parentId ?? null);
  }

  /** The row with our identity (`source = "woocommerce"`, Woo id), soft-deleted or not. */
  own(kind: WooKind, externalId: string): ViewRow | undefined {
    return this.ours.get(`${kind}:${externalId}`);
  }

  /** Another row holding one of `row`'s keys — a slug or sku in its table, a permalink in either — and which key. */
  holder(kind: WooKind, row: { slug: string; permalink: string | null; sku?: string | null }, selfId?: string): { by: ViewRow; label: string } | null {
    for (const [key, label] of keysOf(kind, row)) {
      const by = this.held.get(key)?.find((r) => r.id !== selfId);
      if (by) return { by, label };
    }
    return null;
  }

  /** The id a Woo category has HERE, or null — absent, refused or never ours. Never a guess. */
  resolveCategory(externalId: string): string | null {
    return this.own("category", externalId)?.id ?? null;
  }

  /** Whether category `id` under `parentId` leaves a walk to the root that repeats: through `id` itself, or a loop above it. */
  loops(id: string, parentId: string | null): boolean {
    const seen = new Set([id]);
    for (let at = parentId; at !== null; at = this.parentOf.get(at) ?? null) {
      if (seen.has(at)) return true;
      seen.add(at);
    }
    return false;
  }

  /** A write, into the view: `before` (the row as it was, if any) out, `after` in. */
  record(before: ViewRow | undefined, after: ViewRow): void {
    if (before) {
      if (before.externalId && this.own(before.kind, before.externalId) === before) this.ours.delete(`${before.kind}:${before.externalId}`);
      for (const [key] of keysOf(before.kind, before)) this.held.set(key, (this.held.get(key) ?? []).filter((r) => r !== before));
      this.parentOf.delete(before.id);
    }
    this.add(after);
  }
}
