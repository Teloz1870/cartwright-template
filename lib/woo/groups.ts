import { createHash } from "node:crypto";

import { WOO_MAPPING_VERSION, type MappedCategory, type MappedProduct } from "@/lib/woo/map-catalog";

/**
 * W21-live-2 — the owned fields in GROUPS, each fingerprinted, compared and
 * written on its own. Stock is in no group: it moves with orders here, so it
 * is written on create only and never fingerprinted.
 */

export type WooKind = "category" | "product";
export type GroupName = "core" | "price";

/**
 * What the snapshot says about a group. Only a `confirmed` one is compared,
 * written or recorded; `unknown` = the source did not say (no usable price),
 * `notOwned` = by design not ours (W21-live-4: Yoast's group on a shop without it).
 */
export type GroupState = "confirmed" | "unknown" | "notOwned";

const GROUPS: Record<WooKind, Partial<Record<GroupName, readonly string[]>>> = {
  category: { core: ["slug", "name", "permalink", "parentExternalId", "description"] },
  product: {
    core: ["slug", "name", "permalink", "sku", "categoryExternalId", "extraCategoryExternalIds", "description", "answerSummary", "attributes"],
    price: ["priceDkk"],
  },
};

export const groupNames = (kind: WooKind): GroupName[] => (Object.keys(GROUPS[kind]) as GroupName[]);

/** A source row's state per group. A product without a usable price leaves its price group unknown. */
export function groupStates(kind: WooKind, row: MappedCategory | MappedProduct): Partial<Record<GroupName, GroupState>> {
  if (kind === "category") return { core: "confirmed" };
  return { core: "confirmed", price: "priceDkk" in row && row.priceDkk !== null ? "confirmed" : "unknown" };
}

/** One group's last run: `saw` = what the source confirmed (null: a fallback we wrote), `wrote` = the group as committed. */
export type GroupBase = { saw: string | null; wrote: string };
export type WooBaseEntry = { rowId: string; groups: Partial<Record<GroupName, GroupBase>> };

/** JSON with sorted keys and no `undefined`, so equal rows hash equal. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/** sha256 over one group's fields, the kind, the group and the mapping version; 32 hex characters. */
export function groupFp(kind: WooKind, group: GroupName, row: MappedCategory | MappedProduct): string {
  const values: Record<string, unknown> = { ...row };
  const fields = Object.fromEntries((GROUPS[kind][group] ?? []).map((name) => [name, values[name]]));
  return createHash("sha256").update(stableJson({ v: WOO_MAPPING_VERSION, kind, g: group, fields })).digest("hex").slice(0, 32);
}
