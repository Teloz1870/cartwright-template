/**
 * BOM2-a2 — the configurator contract, version 1: one JSON document per product, read by one
 * interpreter. Plain JSON, so nothing in a Definition executes. Its meaning never changes within a
 * `schemaVersion`, and the grammar and the verb list are part of it. Nothing reads it yet.
 */

export type Minor = number; // whole minor units in the base currency, a safe integer
export type Expr = string; // lib/configurator/expr.ts
export type Template = string; // text with {expr} holes: parseTemplate
export type LocalizedText = string | Record<string, string>;
export type Scalar = number | string | boolean;

export type Definition = {
  schemaVersion: 1;
  parts: Record<string, PartRef>; // every catalogue item a line may sell: the shop's own nouns
  constants?: Record<string, Scalar>;
  tables?: Record<string, Record<string, Scalar>>; // a compound key is joined with ":"
  fields: Field[]; // single option groups
  groups?: Group[]; // repeatable option groups (rows, doors, runs)
  derive?: Derived[]; // root values, in order, after the groups
  steps: Step[]; // the price rule: closed verbs, in order
  discounts?: DiscountRule[]; // at most one in v1
  facts?: Record<string, Expr>; // named outputs for display and comparison; never charged
  lineOrder?: string[]; // stable sort of the final lines by group
  quote?: { validDays: number };
  presentation?: Presentation; // never read by the rule; outside ruleHash
};

export type PartRef =
  | { source: string; product: string; variant?: string | null } // imported: (source, externalId)
  | { sku: string } // this shop's own, or a SKU hardcoded in the old rule
  | { slug: string; variantSku?: string };

type FieldBase = {
  key: string; // /^[a-zA-Z][a-zA-Z0-9_]*$/, not reserved (prev, index, __proto__, …)
  label?: LocalizedText; help?: LocalizedText;
  from?: string; // the raw path when it differs from key: "axes.depth", "attributes.pa_colour"
  required?: boolean;
  showIf?: Expr; // fields, constants and tables only; hidden means default, a posted value is ignored
  scope?: "public" | "operator"; // operator fields are dropped from public input
};
export type Field = FieldBase & (
  | { type: "number"; min?: number; max?: number; step?: number; unit?: string; absInt?: boolean; default?: number }
  | { type: "select"; options: Option[]; default?: string | number; onInvalid?: "refuse" | "default" | "skip-item"; widget?: "select" | "radio" | "swatch" }
  | { type: "checkbox"; default?: boolean }
  | { type: "text"; maxLength: number; default?: string; scope: "operator" } // never public
  | { type: "group"; as: string; min?: number; max: number; overflow: "refuse" | "truncate"; fields: Field[] }
);
export type Option = { value: string | number; label?: LocalizedText; default?: boolean; image?: string; showIf?: Expr };
export type Group = { key: string; as: string; from?: string; min?: number; max: number; overflow: "refuse" | "truncate"; fields: Field[];
                      derive?: Derived[]; skipWhen?: Expr; label?: LocalizedText };
export type Derived = { name: string; expr: Expr };

export type Step =
  | { op: "lines"; when?: Expr; items: LineTemplate[] }
  | { op: "take"; when?: Expr; tag: string; amount: Expr; keepAtLeast?: number; firstOnly?: boolean }
  | { op: "move"; when?: Expr; from: Template; to: Template; qty?: Expr }
  | { op: "each"; when?: Expr; of: string; steps: Step[] } // of: a group's name or a bound list, "rows", "row.doors"
  | { op: "block"; when?: Expr; steps: Step[] }
  | { op: "refuse"; when: Expr; code: string; path?: Template; message?: LocalizedText }
  | { op: "warn"; when: Expr; code: string; message?: LocalizedText };

export type LineTemplate = {
  key: Template; part?: Template; label?: Template; group?: string; tags?: string[]; note?: Template;
  qty: Expr;
  when?: Expr;
  fixedOre?: Expr; // whole minor units ≥ 0 instead of the catalogue price. Neither part nor fixedOre: included, 0
  meta?: Record<string, Template>; // a supplier code, say; copied to the snapshot
};

export type DiscountRule = { key: string; label?: LocalizedText; metric: Expr; base: "all" | string /* a tag */;
                             steps: { min: number; bps: number }[] }; // the highest bps with metric ≥ min; bps a whole 1..10000

export type Presentation = { groupLabels?: Record<string, LocalizedText>; summary?: Template; stateParam?: string;
                             urlAttributes?: Record<string, string>; raw?: Record<string, unknown>; // raw: for a design pack
                             display?: Record<string, Expr> }; // display only, after finalize, in the scope { facts, totals }

/** One deviation from a `proof` row: `patch` is JSON Patch (RFC 6902) on that row. Without a decision it cannot be published. */
export type LedgerRow = {
  id: string; // "D2"
  patch: { op: "add" | "replace" | "remove"; path: string; value?: unknown }[];
  why: string;
  decision: string; // the owner's decision, "B91"
  signedBy: string; signedAt: string;
};

export type DefinitionIssue = { path: string; code: string; message: string; severity: "error" | "warning" };
