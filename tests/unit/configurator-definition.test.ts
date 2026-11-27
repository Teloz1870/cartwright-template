import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_JSON_CHARS, MAX_JSON_DEPTH, MAX_JSON_NODES, applyLedger, parseDefinition, parseTemplate, type ParsedDefinition } from "@/lib/configurator/definition";
import { MAX_EXPR_LENGTH, parseExpr } from "@/lib/configurator/expr";
import { ruleHash, stableJson } from "@/lib/configurator/hash";
import type { Definition, LedgerRow, Step } from "@/lib/configurator/types";
import { groupFp } from "@/lib/woo/groups";

/**
 * BOM2-a2 — the configurator's way in: the shape, the grammar pass, the rule hash and the ledger.
 * Every noun and number here is invented; no shop's rule is in this file.
 */

/** The small end of the contract, as its spec writes it: select, price delta, showIf. */
const SMALL: Definition = {
  schemaVersion: 1,
  parts: { "gate-120": { sku: "G120" }, "gate-140": { sku: "G140" } },
  fields: [
    { key: "size", type: "select", required: true, options: [{ value: "120" }, { value: "140" }] },
    { key: "handle", type: "select", options: [{ value: "black", default: true }, { value: "steel" }] },
    { key: "hinge", type: "select", required: true, options: [{ value: "left" }, { value: "right" }], showIf: "size=='140'" },
  ],
  steps: [
    {
      op: "lines",
      items: [
        { key: "gate", part: "gate-{size}", qty: "1" },
        { key: "handle-steel", label: "Steel handle", qty: "1", when: "handle=='steel'", fixedOre: "14900" },
      ],
    },
  ],
};

/** A shelving wall holding every key of the contract at least once. */
const FULL: Definition = {
  schemaVersion: 1,
  parts: {
    upright: { source: "woocommerce", product: "901", variant: "902" },
    "upright-plain": { source: "woocommerce", product: "903" },
    "upright-none": { source: "woocommerce", product: "904", variant: null },
    shelf: { sku: "SH-80" },
    bracket: { slug: "bracket", variantSku: "BR-1" },
    cap: { slug: "cap" },
  },
  constants: { bayM: 0.8, bracketsPerShelf: 2, finish: "oak", glued: false },
  tables: { heightCm: { low: 120, high: 200 }, shelves: { "120": 3, "200:oak": 5 } },
  fields: [
    {
      key: "depth", type: "number", label: "Depth", help: { en: "In centimetres", de: "In Zentimetern" }, from: "axes.depth", required: true,
      min: 20, max: 60, step: 5, unit: "cm", absInt: true, default: 30,
    },
    {
      key: "colour", type: "select", label: { en: "Colour" }, from: "attributes.pa_colour", showIf: "depth>=20", scope: "public", default: "white",
      onInvalid: "refuse", widget: "swatch",
      options: [
        { value: "white", label: "White", default: true, image: "https://shop.example.test/white.png", showIf: "depth>=20" },
        { value: 2, label: { en: "Two" } },
      ],
    },
    { key: "glue", type: "checkbox", default: false },
    { key: "ref", type: "text", maxLength: 40, default: "", scope: "operator" },
    { key: "extras", type: "group", as: "extra", min: 0, max: 3, overflow: "truncate", fields: [{ key: "n", type: "number", showIf: "depth>=20" }] },
  ],
  groups: [
    {
      key: "rows", as: "row", from: "state.rows", label: "Rows", min: 1, max: 8, overflow: "refuse", skipWhen: "row.metres<=0",
      derive: [{ name: "bays", expr: "ceil(row.metres/bayM)" }],
      fields: [
        { key: "metres", type: "number", required: true, showIf: "depth>=20" },
        { key: "height", type: "select", onInvalid: "skip-item", options: [{ value: "low", showIf: "depth>=20" }, { value: "high" }] },
        { key: "doors", type: "group", as: "door", max: 2, overflow: "refuse", fields: [{ key: "width", type: "number", showIf: "depth>=20" }] },
      ],
    },
  ],
  derive: [{ name: "totalBays", expr: "sum(rows,row.bays)" }],
  steps: [
    {
      op: "each", when: "count(rows)>0", of: "rows",
      steps: [
        {
          op: "lines", when: "row.bays>0",
          items: [
            {
              key: "shelf-{row.height}", part: "shelf", label: "Shelf {row.height}", group: "wood", tags: ["wood", "shelf"], note: "{row.bays} bays",
              qty: "row.bays*lookup('shelves',lookup('heightCm',row.height))", when: "row.bays>=1", meta: { code: "S-{row.height}" },
            },
            { key: "upright", part: "upright", tags: ["post"], qty: "row.bays+1" },
          ],
        },
        { op: "move", when: "prev!=null", from: "upright", to: "shelf-{row.height}", qty: "1" },
        { op: "each", when: "row.bays>0", of: "row.doors", steps: [{ op: "lines", items: [{ key: "door", label: "Door", qty: "1", fixedOre: "round(door.width*100)" }] }] },
      ],
    },
    { op: "take", when: "glue", tag: "post", amount: "min(1,qty('post'))", keepAtLeast: 1, firstOnly: true },
    {
      op: "block", when: "totalBays>2",
      steps: [
        { op: "warn", when: "depth>50", code: "deep", message: "Deep" },
        { op: "refuse", when: "totalBays>40", code: "too_long", path: "rows[{count(rows)}]", message: { en: "Too long" } },
      ],
    },
  ],
  discounts: [{ key: "volume", label: "Volume", metric: "totalBays", base: "wood", steps: [{ min: 3, bps: 500 }, { min: 6, bps: 1000 }] }],
  facts: { bays: "totalBays" },
  lineOrder: ["wood"],
  quote: { validDays: 30 },
  presentation: {
    groupLabels: { wood: "Wood", post: { en: "Posts" } },
    summary: "{facts.bays} bays",
    stateParam: "c",
    urlAttributes: { colour: "attribute_pa_colour" },
    raw: { ui: { accent: "oak", hide: [1, null, { deep: true }] } },
    display: { perBay: "totals.totalOre/facts.bays" },
  },
};
const BARE = { schemaVersion: 1, parts: {}, fields: [], steps: [] };

type Doc = Record<string, unknown>;
const copy = <T>(v: T): T => structuredClone(v);

/** "steps[0].items[1].qty" as keys. No key in this file's documents holds a dot or a bracket where a path names it. */
const keysOf = (at: string) => at.split(/\.|(?=\[)/).map((k) => (k.startsWith("[") ? Number(k.slice(1, -1)) : k));
function parentOf(doc: unknown, at: string): [Record<PropertyKey, unknown>, string | number] {
  const keys = keysOf(at);
  const last = keys.pop() as string | number;
  const parent = keys.reduce<unknown>((o, k) => (o as Record<PropertyKey, unknown>)[k], doc);
  if (parent === null || typeof parent !== "object") throw new Error(`no parent for ${at}`);
  return [parent as Record<PropertyKey, unknown>, last];
}
function getAt(doc: unknown, at: string): unknown {
  const [parent, last] = parentOf(doc, at);
  return parent[last];
}
/** A copy of `doc` with `at` set. The old value must exist unless `fresh`, so a stale path in a table fails here, not by accident below. */
function withAt(doc: unknown, at: string, value: unknown, fresh = false): Doc {
  const out = copy(doc) as Doc;
  const [parent, last] = parentOf(out, at);
  if (!fresh && !Object.hasOwn(parent, last)) throw new Error(`${at} is not in the fixture`);
  parent[last] = value;
  return out;
}
function without(doc: unknown, at: string): Doc {
  const out = copy(doc) as Doc;
  const [parent, last] = parentOf(out, at);
  if (!Object.hasOwn(parent, last)) throw new Error(`${at} is not in the fixture`);
  delete parent[last];
  return out;
}

function good(out: ParsedDefinition): Definition {
  if (!out.ok) throw new Error(`refused: ${JSON.stringify(out.errors)}`);
  return out.definition;
}
const hashOf = (json: unknown) => {
  const out = parseDefinition(json);
  if (!out.ok) throw new Error(`refused: ${JSON.stringify(out.errors)}`);
  return out.ruleHash;
};
/** [path, code] of every fault, or "parsed". */
const faults = (out: ParsedDefinition) => (out.ok ? "parsed" : out.errors.map((e) => [e.path, e.code]));
const refusal = (json: unknown) => faults(parseDefinition(json));

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    Object.values(v).forEach(deepFreeze);
  }
  return v;
}
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Every plain object below `doc`, at any depth, with its path as this file writes paths. */
function objectsIn(doc: unknown, at = ""): [string, Doc][] {
  if (Array.isArray(doc)) return doc.flatMap((v, i) => objectsIn(v, `${at}[${i}]`));
  if (doc === null || typeof doc !== "object") return [];
  return [[at, doc as Doc], ...Object.entries(doc).flatMap(([k, v]) => objectsIn(v, at ? `${at}.${k}` : k))];
}

describe("a definition that is whole", () => {
  it.each<[string, unknown]>([
    ["the small end", SMALL],
    ["every key of the contract", FULL],
    ["nothing but what is required", BARE],
  ])("%s parses to itself: nothing dropped, nothing invented, no warning", (_name, doc) => {
    const out = parseDefinition(doc);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.definition).toStrictEqual(doc);
    expect(out.warnings).toEqual([]);
    expect(out.ruleHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.ruleHash).toBe(ruleHash(out.definition));
  });

  /** The least each kind of object may hold, so every optional key is shown absent. */
  const LEAST: [string, Doc][] = [
    ["a part by source", withAt(BARE, "parts", { a: { source: "s", product: "p" } })],
    ["a part with no variant", withAt(BARE, "parts", { a: { source: "s", product: "p", variant: null } })],
    ["a part by sku", withAt(BARE, "parts", { a: { sku: "s" } })],
    ["a part by slug", withAt(BARE, "parts", { a: { slug: "s" } })],
    ["a number field", withAt(BARE, "fields", [{ key: "a", type: "number" }])],
    ["an option", withAt(BARE, "fields", [{ key: "a", type: "select", options: [{ value: 1 }] }])],
    ["a checkbox field", withAt(BARE, "fields", [{ key: "a", type: "checkbox" }])],
    ["a text field", withAt(BARE, "fields", [{ key: "a", type: "text", maxLength: 1, scope: "operator" }])],
    ["a nested group", withAt(BARE, "fields", [{ key: "a", type: "group", as: "b", max: 1, overflow: "refuse", fields: [] }])],
    ["a group", { ...BARE, groups: [{ key: "a", as: "b", max: 1, overflow: "truncate", fields: [] }] }],
    ["a derived value", { ...BARE, derive: [{ name: "a", expr: "1" }] }],
    ["a lines step", withAt(BARE, "steps", [{ op: "lines", items: [] }])],
    ["a line", withAt(BARE, "steps", [{ op: "lines", items: [{ key: "a", qty: "1" }] }])],
    ["a take step", withAt(BARE, "steps", [{ op: "take", tag: "a", amount: "1" }])],
    ["a move step", withAt(BARE, "steps", [{ op: "move", from: "a", to: "b" }])],
    ["an each step", withAt(BARE, "steps", [{ op: "each", of: "a", steps: [] }])],
    ["a block step", withAt(BARE, "steps", [{ op: "block", steps: [] }])],
    ["a refuse step", withAt(BARE, "steps", [{ op: "refuse", when: "true", code: "a" }])],
    ["a warn step", withAt(BARE, "steps", [{ op: "warn", when: "true", code: "a" }])],
    ["a discount", { ...BARE, discounts: [{ key: "a", metric: "1", base: "all", steps: [{ min: 0, bps: 1 }] }] }],
    ["an empty presentation", { ...BARE, presentation: {} }],
    ["empty records", { ...BARE, constants: {}, tables: {}, facts: {}, groups: [], derive: [], discounts: [], lineOrder: [] }],
  ];
  it.each(LEAST)("%s needs no more", (_name, doc) => {
    expect(good(parseDefinition(doc))).toStrictEqual(doc);
  });

  /** Each value the contract names for a closed choice, on the kind of object that takes it. */
  it.each<[string, Doc]>([
    ["a public field", withAt(BARE, "fields", [{ key: "a", type: "number", scope: "public" }])],
    ["an operator field", withAt(BARE, "fields", [{ key: "a", type: "number", scope: "operator" }])],
    ...["refuse", "default", "skip-item"].map((onInvalid): [string, Doc] => [`onInvalid ${onInvalid}`, withAt(BARE, "fields", [{ key: "a", type: "select", options: [{ value: 1 }], onInvalid }])]),
    ...["select", "radio", "swatch"].map((widget): [string, Doc] => [`widget ${widget}`, withAt(BARE, "fields", [{ key: "a", type: "select", options: [{ value: 1 }], widget }])]),
    ...["refuse", "truncate"].map((overflow): [string, Doc] => [`a group's overflow ${overflow}`, { ...BARE, groups: [{ key: "a", as: "b", max: 1, overflow, fields: [] }] }]),
    ...["refuse", "truncate"].map((overflow): [string, Doc] => [`a nested group's overflow ${overflow}`, withAt(BARE, "fields", [{ key: "a", type: "group", as: "b", max: 1, overflow, fields: [] }])]),
  ])("%s", (_name, doc) => {
    expect(good(parseDefinition(doc))).toStrictEqual(doc);
  });

  /** What the contract's own comments show, in the places a mapper writes them. */
  it.each<[string, Doc]>([
    ["a bound list as `of`", withAt(BARE, "steps", [{ op: "each", of: "row.doors", steps: [] }])],
    ["a raw path with anything but a dot in a segment", withAt(BARE, "fields", [{ key: "a", type: "number", from: "attributes.pa_colour-x y.0" }])],
    ["a compound table key", { ...BARE, tables: { t: { "a:b": 1, "": 2, "0.5": 3 } } }],
    ["any text as a part's name", withAt(BARE, "parts", { "parent:v 1.2": { sku: "s" } })],
    ["a function's name as a field's", withAt(BARE, "fields", [{ key: "ceil", type: "checkbox" }])],
    ["a default of a number on a select", withAt(BARE, "fields", [{ key: "a", type: "select", options: [{ value: 1 }], default: 1 }])],
    ["the greatest discount", { ...BARE, discounts: [{ key: "a", metric: "1", base: "t", steps: [{ min: -1.5, bps: 10000 }] }] }],
    ["a negative bound on a number", withAt(BARE, "fields", [{ key: "a", type: "number", min: -1.5, max: -0.5, step: 0.25, default: -1 }])],
    ["no part and no price on a line", withAt(BARE, "steps", [{ op: "lines", items: [{ key: "a", label: "", note: "", qty: "1" }] }])],
    ["an empty text in a refusal", withAt(BARE, "steps", [{ op: "refuse", when: "true", code: "a", path: "", message: "" }])],
    ["an empty meta", withAt(BARE, "steps", [{ op: "lines", items: [{ key: "a", qty: "1", meta: { code: "" } }] }])],
    ["an object with no prototype", Object.assign(Object.create(null), BARE)],
    ["a member that is undefined, at any depth", { ...BARE, facts: undefined, constants: { a: undefined }, presentation: { summary: undefined, raw: { a: undefined } } }],
  ])("%s is allowed", (_name, doc) => {
    expect(parseDefinition(doc).ok).toBe(true);
  });
});

/** The value a smuggling toJSON hands over: own forbidden keys, which no walk of this value would let past. */
const smuggled = () => JSON.parse('{"constructor":{"x":1},"__proto__":{"polluted":1}}');
const inRaw = (a: unknown) => ({ ...BARE, presentation: { raw: { a } } });
/** A list that holds more than its elements: what a walk by index never reads. */
const listWith = (member: Doc, ...elements: unknown[]) => Object.assign(elements, member);

describe("what is not JSON is refused before the schema reads it", () => {
  class Thing {}
  class ListOf extends Array<unknown> {}
  class SmugglingList extends Array<unknown> {
    toJSON() {
      return smuggled();
    }
  }
  const hole = [1, 2];
  delete hole[0];
  it.each<[string, unknown, string]>([
    ["undefined", undefined, ""],
    ["a function", () => 1, ""],
    ["a symbol", Symbol("s"), ""],
    ["a bigint", BigInt(1), ""],
    ["NaN", NaN, ""],
    ["Infinity", Infinity, ""],
    ["-Infinity", -Infinity, ""],
    ["a date", new Date(0), ""],
    ["a map", new Map(), ""],
    ["a class", new Thing(), ""],
    ["a typed array", new Uint8Array(1), ""],
    ["a toJSON of its own", { ...BARE, toJSON: () => BARE }, "toJSON"],
    ["a toJSON on a list", inRaw(listWith({ toJSON: smuggled }, 1)), "presentation.raw.a.toJSON"],
    ["a toJSON on an empty list standing in for the steps", { ...BARE, steps: listWith({ toJSON: () => [{ op: "lines", items: [] }] }) }, "steps.toJSON"],
    ["a toJSON on the root as a list", listWith({ toJSON: () => BARE }), "toJSON"],
    ["a named member on a list", inRaw(listWith({ extra: 1 }, 1)), "presentation.raw.a.extra"],
    ["a class extending Array", inRaw(new ListOf()), "presentation.raw.a"],
    ["a class extending Array, with a toJSON", inRaw(new SmugglingList()), "presentation.raw.a"],
    ["a list with another prototype", inRaw(Object.setPrototypeOf([1], { toJSON: smuggled })), "presentation.raw.a"],
    ["a list with no prototype", inRaw(Object.setPrototypeOf([1], null)), "presentation.raw.a"],
    ["infinity in a table", { ...BARE, tables: { t: { a: Infinity } } }, "tables.t.a"],
    ["NaN in a passed-through record", { ...BARE, presentation: { raw: { a: { b: NaN } } } }, "presentation.raw.a.b"],
    ["a function in a passed-through list", { ...BARE, presentation: { raw: { a: [0, () => 1] } } }, "presentation.raw.a[1]"],
    ["a date in a passed-through record", { ...BARE, presentation: { raw: { a: new Date(0) } } }, "presentation.raw.a"],
    ["undefined in a list", { ...BARE, lineOrder: ["a", undefined] }, "lineOrder[1]"],
    ["a hole in a list", { ...BARE, presentation: { raw: { a: hole } } }, "presentation.raw.a[0]"],
  ])("%s", (_name, value, at) => {
    expect(refusal(value)).toEqual([[at, "not_json"]]);
  });

  /** Own keys, as JSON.parse makes them: z.record alone would drop them and report a shorter rule. */
  it.each<[string, string, string]>([
    ["at the root", '{"schemaVersion":1,"parts":{},"fields":[],"steps":[],"__proto__":{"a":1}}', "__proto__"],
    ["as a part", '{"schemaVersion":1,"parts":{"__proto__":{"sku":"x"}},"fields":[],"steps":[]}', "parts.__proto__"],
    ["as a constant", '{"schemaVersion":1,"parts":{},"constants":{"__proto__":1},"fields":[],"steps":[]}', "constants.__proto__"],
    ["as a table", '{"schemaVersion":1,"parts":{},"tables":{"__proto__":{"a":1}},"fields":[],"steps":[]}', "tables.__proto__"],
    ["in a table", '{"schemaVersion":1,"parts":{},"tables":{"t":{"__proto__":1}},"fields":[],"steps":[]}', "tables.t.__proto__"],
    ["in a table, the second word", '{"schemaVersion":1,"parts":{},"tables":{"t":{"constructor":1}},"fields":[],"steps":[]}', "tables.t.constructor"],
    ["in a table, the third word", '{"schemaVersion":1,"parts":{},"tables":{"t":{"prototype":1}},"fields":[],"steps":[]}', "tables.t.prototype"],
    ["as a fact", '{"schemaVersion":1,"parts":{},"facts":{"__proto__":"1"},"fields":[],"steps":[]}', "facts.__proto__"],
    ["in a label", '{"schemaVersion":1,"parts":{},"fields":[{"key":"a","type":"checkbox","label":{"__proto__":"x"}}],"steps":[]}', "fields[0].label.__proto__"],
    ["deep in what is passed through", '{"schemaVersion":1,"parts":{},"fields":[],"steps":[],"presentation":{"raw":{"a":[{"b":{"__proto__":1}}]}}}', "presentation.raw.a[0].b.__proto__"],
    ["beside another fault", '{"schemaVersion":1,"parts":{},"fields":[],"steps":[],"presentation":{"raw":{"constructor":1}}}', "presentation.raw.constructor"],
  ])("a forbidden key %s", (_name, text, at) => {
    expect(refusal(JSON.parse(text))).toEqual([[at, "forbidden_key"]]);
  });

  it("names every forbidden key, and only those: the same three the language refuses", () => {
    for (const word of ["__proto__", "constructor", "prototype"]) {
      const parsed = parseExpr(word);
      expect(parsed.ok ? "parsed" : parsed.error.code).toBe("forbidden_name");
      expect(refusal(JSON.parse(`{"schemaVersion":1,"parts":{},"fields":[],"steps":[],"presentation":{"raw":{"${word}":1}}}`))).toEqual([[`presentation.raw.${word}`, "forbidden_key"]]);
    }
    expect(parseDefinition({ ...BARE, presentation: { raw: { __prot__: 1, construct: 1, proto: 1 } } }).ok).toBe(true);
  });

  const nested = (levels: number) => {
    let v: unknown = 1;
    for (let i = 0; i < levels; i++) v = [v];
    return v;
  };
  /** The document, presentation and raw are three levels, and the list at `a` adds `levels` more. */
  const atDepth = (levels: number) => ({ ...BARE, presentation: { raw: { a: nested(levels) } } });
  it("takes a document up to the depth limit and refuses one level more, at the place", () => {
    expect(parseDefinition(atDepth(MAX_JSON_DEPTH - 3)).ok).toBe(true);
    expect(refusal(atDepth(MAX_JSON_DEPTH - 2))).toEqual([[`presentation.raw.a${"[0]".repeat(MAX_JSON_DEPTH - 3)}`, "too_deep"]]);
    expect(MAX_JSON_DEPTH).toBe(64);
  });

  it("refuses steps nested past the limit as a fault, where the schema's recursion would reach the stack", () => {
    let steps: Step[] = [];
    for (let i = 0; i < 200_000; i++) steps = [{ op: "block", steps }];
    const out = parseDefinition({ ...BARE, steps });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.map((e) => e.code)).toEqual(["too_deep"]);
  });

  it("takes steps nested as far as the limit lets them, on the schema's own recursion", () => {
    const blocks = (n: number) => {
      let steps: Step[] = [];
      for (let i = 0; i < n; i++) steps = [{ op: "block", steps }];
      return { ...BARE, steps };
    };
    expect(good(parseDefinition(blocks(31)))).toStrictEqual(blocks(31));
    expect(refusal(blocks(32))).toEqual([[`steps${"[0].steps".repeat(31)}[0]`, "too_deep"]]);
  });

  it("refuses a cycle as too deep", () => {
    const raw: Doc = {};
    raw.self = raw;
    const out = parseDefinition({ ...BARE, presentation: { raw } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.map((e) => e.code)).toEqual(["too_deep"]);
  });

  /** A document of exactly `nodes` values: the root, its 4 members, presentation, raw, `a`, and the list's elements. */
  const ofSize = (nodes: number) => ({ ...BARE, presentation: { raw: { a: Array.from({ length: nodes - 8 }, () => 0) } } });
  it("takes a document up to the size limit and refuses one value more, once", () => {
    expect(parseDefinition(ofSize(MAX_JSON_NODES)).ok).toBe(true);
    expect(refusal(ofSize(MAX_JSON_NODES + 1))).toEqual([[`presentation.raw.a[${MAX_JSON_NODES - 8}]`, "too_large"]]);
    expect(refusal(ofSize(MAX_JSON_NODES + 500))).toEqual([[`presentation.raw.a[${MAX_JSON_NODES - 8}]`, "too_large"]]);
    expect(MAX_JSON_NODES).toBe(100_000);
  });
  it("reads the last value inside the limit like any other", () => {
    const doc = ofSize(MAX_JSON_NODES);
    doc.presentation.raw.a[MAX_JSON_NODES - 9] = NaN;
    expect(refusal(doc)).toEqual([[`presentation.raw.a[${MAX_JSON_NODES - 9}]`, "not_json"]]);
  });

  it("stops at the limit on a document that shares itself into more paths than can be walked", () => {
    let shared: unknown = [0];
    for (let i = 0; i < 40; i++) shared = [shared, shared];
    const out = parseDefinition({ ...BARE, presentation: { raw: { a: shared } } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.map((e) => e.code)).toEqual(["too_large"]);
  });

  it("stops at the limit on a list whose length is far above what it holds", { timeout: 5_000 }, () => {
    const out = parseDefinition(inRaw(new Array(2 ** 30)));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      const listed = out.errors.slice(0, -1);
      expect(out.errors.at(-1)).toEqual({ path: "", code: "too_many_faults", message: `${MAX_JSON_NODES - 7 - listed.length} more faults, not listed`, severity: "error" });
      expect(listed.every((e) => e.code === "not_json")).toBe(true);
    }
  });
  it("does not list a list's keys once past the limit, where a list can hold more than memory has room to name", () => {
    let asked = 0;
    const list = (length: number) => new Proxy(new Array(length).fill(0), { ownKeys: (target) => (asked++, Reflect.ownKeys(target)) });
    expect(parseDefinition(inRaw(list(MAX_JSON_NODES - 8))).ok).toBe(true);
    expect(asked).toBe(1);
    expect(refusal(inRaw(list(MAX_JSON_NODES - 7)))).toEqual([[`presentation.raw.a[${MAX_JSON_NODES - 8}]`, "too_large"]]);
    expect(asked).toBe(1);
  });

  describe("the limit on characters", () => {
    /** The root's four keys hold 29 characters, `presentation` and `raw` 15. */
    const KEYS = 44;
    it("takes a document up to the limit and refuses one character more, at the place", () => {
      const ofChars = (chars: number) => inRaw("x".repeat(chars - KEYS - "a".length));
      expect(parseDefinition(ofChars(MAX_JSON_CHARS)).ok).toBe(true);
      expect(refusal(ofChars(MAX_JSON_CHARS + 1))).toEqual([["presentation.raw.a", "too_large"]]);
      expect(MAX_JSON_CHARS).toBe(1_000_000);
    });
    it("counts a key as it counts a string, every key at every depth", () => {
      const keyOf = (chars: number) => ({ ...BARE, presentation: { raw: { ["k".repeat(chars - KEYS)]: 1 } } });
      expect(parseDefinition(keyOf(MAX_JSON_CHARS)).ok).toBe(true);
      const out = parseDefinition(keyOf(MAX_JSON_CHARS + 1));
      expect(out.ok ? "parsed" : out.errors.map((e) => [e.path.slice(0, 18), e.path.length, e.code])).toEqual([["presentation.raw.k", "presentation.raw.".length + MAX_JSON_CHARS + 1 - KEYS, "too_large"]]);
      const deep = (chars: number) => inRaw([{ ["k".repeat(chars - KEYS - "a".length)]: 1 }]);
      expect(parseDefinition(deep(MAX_JSON_CHARS)).ok).toBe(true);
      expect(parseDefinition(deep(MAX_JSON_CHARS + 1)).ok).toBe(false);
    });
    it("adds up every string, and says so once", () => {
      const half = "x".repeat(MAX_JSON_CHARS / 2);
      const out = parseDefinition(inRaw([half, half, half, half]));
      expect(out).toEqual({ ok: false, errors: [{ path: "presentation.raw.a[1]", code: "too_large", message: `a document holds at most ${MAX_JSON_CHARS} characters`, severity: "error" }] });
    });
    it("at the limit to the character, there is no room for one more", () => {
      const full = "x".repeat(MAX_JSON_CHARS - KEYS - "a".length);
      expect(parseDefinition(inRaw([full, ""])).ok).toBe(true);
      expect(refusal(inRaw([full, "y"]))).toEqual([["presentation.raw.a[1]", "too_large"]]);
    });
    it("still reads the rest, for what else is wrong", () => {
      expect(refusal(inRaw(["x".repeat(MAX_JSON_CHARS), NaN]))).toEqual([["presentation.raw.a[0]", "too_large"], ["presentation.raw.a[1]", "not_json"]]);
    });
    it("a document too long to store at all is a fault at its place, where storing it threw a length with no path", () => {
      const long = "x".repeat(300_000_000);
      expect(refusal(inRaw([long, long]))).toEqual([["presentation.raw.a[0]", "too_large"]]);
    });
    it("a template over the limit is a fault at its place, where the regex's stack ran out and lost the path", () => {
      expect(refusal({ ...BARE, presentation: { summary: `{${"a".repeat(1e7)}}` } })).toEqual([["presentation.summary", "too_large"]]);
    });
    it("does not count a number, a boolean or a null", () => {
      expect(parseDefinition(inRaw(["x".repeat(MAX_JSON_CHARS - KEYS - "a".length), 1, 1.5, true, null])).ok).toBe(true);
    });
  });

  it("turns a getter that throws into a fault at the root, and says what it threw", () => {
    const doc = { ...BARE, get parts(): never { throw new Error("boom"); } };
    expect(parseDefinition(doc)).toEqual({ ok: false, errors: [{ path: "", code: "internal", message: "boom", severity: "error" }] });
    const notAnError = { ...BARE, get parts(): never { throw "text"; } };
    expect(parseDefinition(notAnError)).toEqual({ ok: false, errors: [{ path: "", code: "internal", message: "text", severity: "error" }] });
  });
  it.each<[string, unknown, string]>([
    ["an object with no prototype", Object.create(null), "something that cannot be read"],
    ["an object whose toString throws", { toString() { throw new Error("no text"); } }, "something that cannot be read"],
    ["an error whose message throws", new (class extends Error { get message(): string { throw new Error("no message"); } })(), "something that cannot be read"],
    ["an error whose message is no string", new (class extends Error { get message() { return 5 as unknown as string; } })(), "5"],
    ["a symbol", Symbol("s"), "Symbol(s)"],
  ])("a getter that throws %s is still a fault, where reading what it threw threw again", (_name, thrown, message) => {
    const want = { ok: false, errors: [{ path: "", code: "internal", message, severity: "error" }] };
    const doc = { ...BARE, get parts(): never { throw thrown; } };
    expect(parseDefinition(doc)).toEqual(want);
    expect(applyLedger(doc, [])).toEqual(want);
    expect(applyLedger(BARE, [{ get id(): never { throw thrown; } }])).toEqual(want);
  });
});

describe("the report of a refused document stays no longer than a document may be", () => {
  /** A key this long on the path over many faults made each fault's path this long: 4.5 GB of report from a 1 MB document, and stringifying it ran the process out of heap. */
  const LONG = "k".repeat(900_000);
  const forbiddenKeys = (n: number) => JSON.parse(`[${Array.from({ length: n }, () => '{"__proto__":1}').join(",")}]`);
  const chars = (out: ParsedDefinition) => (out.ok ? 0 : out.errors.reduce((n, e) => n + e.path.length + e.message.length, 0));
  const row = (patch: unknown[]) => ({ id: "D1", patch, why: "a reason", decision: "B1", signedBy: "owner", signedAt: "2026-10-31" });
  const notListed = (n: number) => ({ path: "", code: "too_many_faults", message: `${n} more faults, not listed`, severity: "error" });

  it.each<[string, () => ParsedDefinition]>([
    ["forbidden keys below a long key", () => parseDefinition({ ...BARE, presentation: { raw: { [LONG]: forbiddenKeys(5000) } } })],
    ["what the schema refuses below a long key", () => parseDefinition({ ...BARE, tables: { [LONG]: Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`k${i}`, []])) } })],
    ["a proof's forbidden keys below a long key", () => applyLedger({ ...BARE, presentation: { raw: { [LONG]: forbiddenKeys(5000) } } }, [])],
    ["a book's forbidden keys below a long key", () => applyLedger(BARE, [row([{ op: "add", path: "/a", value: { [LONG]: forbiddenKeys(5000) } }])])],
    ["what the outcome's schema refuses below a long key", () => applyLedger(BARE, [row([{ op: "add", path: "/tables", value: { [LONG]: Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`k${i}`, []])) } }])])],
  ])("%s: the first fault and a count of the rest", (_name, read) => {
    const out = read();
    expect(chars(out)).toBeLessThan(MAX_JSON_CHARS + 100);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toHaveLength(2);
      expect(out.errors[1]).toEqual(notListed(out.errors[0].path.includes("__proto__") ? 4999 : 5000));
    }
    expect(JSON.stringify(out).length).toBeLessThan(2 * MAX_JSON_CHARS);
  });

  it("lists as many short faults as there is room for, in document order, and counts the rest", () => {
    const out = parseDefinition(inRaw(forbiddenKeys(49_000)));
    if (out.ok) throw new Error("parsed");
    const listed = out.errors.slice(0, -1);
    expect(listed.length).toBeGreaterThan(10_000);
    expect(listed.map((e) => e.path)).toEqual(listed.map((_, i) => `presentation.raw.a[${i}].__proto__`));
    expect(out.errors.at(-1)).toEqual(notListed(49_000 - listed.length));
    expect(chars(out) - notListed(49_000 - listed.length).message.length).toBeLessThanOrEqual(MAX_JSON_CHARS);
  });

  /** Two faults of two paths and two messages of 28 characters: this much key makes them fill the room to the character. */
  const FITS = MAX_JSON_CHARS - "presentation.raw.a[0].__proto__".length - "presentation.raw.[0].__proto__".length - 2 * "__proto__ can never be a key".length;
  const reportOfKey = (length: number) => parseDefinition({ ...BARE, presentation: { raw: { a: forbiddenKeys(1), ["k".repeat(length)]: forbiddenKeys(1) } } });
  it("a report that fills the room to the character is not cut, and one character more is", () => {
    const fits = reportOfKey(FITS);
    if (fits.ok) throw new Error("parsed");
    expect(chars(fits)).toBe(MAX_JSON_CHARS);
    expect(fits.errors.map((e) => e.code)).toEqual(["forbidden_key", "forbidden_key"]);
    const over = reportOfKey(FITS + 1);
    if (over.ok) throw new Error("parsed");
    expect(over.errors).toHaveLength(2);
    expect(over.errors[0].path).toBe("presentation.raw.a[0].__proto__");
    expect(over.errors[1]).toEqual(notListed(1));
  });

  it("the first fault is always there, however long its own path, so a document is never refused for nothing", () => {
    const long = "k".repeat(2 * MAX_JSON_CHARS);
    const out = parseDefinition({ ...BARE, presentation: { raw: { [long]: 1 } } });
    if (out.ok) throw new Error("parsed");
    expect(out.errors.map((e) => [e.path.length, e.code])).toEqual([["presentation.raw.".length + long.length, "too_large"]]);
  });

  it("a report that short is left as it is", () => {
    const out = parseDefinition({ ...BARE, parts: 1, fields: 1 });
    if (out.ok) throw new Error("parsed");
    expect(out.errors.map((e) => e.path)).toEqual(["parts", "fields"]);
    expect(out.errors.some((e) => e.code === "too_many_faults")).toBe(false);
  });
});

describe("what was checked is what is stored", () => {
  const storedOf = (a: unknown) => (good(parseDefinition(inRaw(a))).presentation?.raw as Doc).a;
  const forbidden = () => JSON.parse('{"__proto__":{"polluted":1}}');

  it("a toJSON on a list never runs, and no forbidden key gets in", () => {
    let calls = 0;
    const a = listWith({ toJSON: () => (calls++, smuggled()) }, 1);
    expect(refusal(inRaw(a))).toEqual([["presentation.raw.a.toJSON", "not_json"]]);
    expect(calls).toBe(0);
  });

  it("never calls a toJSON the walk cannot see as a member, on an object or on a list", () => {
    let calls = 0;
    const smuggler = () => (calls++, smuggled());
    expect(storedOf(Object.defineProperty({ a: 1 }, "toJSON", { value: smuggler }))).toStrictEqual({ a: 1 });
    expect(storedOf(Object.defineProperty([1], "toJSON", { value: smuggler }))).toStrictEqual([1]);
    expect(good(parseDefinition(Object.defineProperty({ ...BARE }, "toJSON", { value: smuggler })))).toStrictEqual(BARE);
    expect(calls).toBe(0);
  });

  it("a list that hides its toJSON cannot hand over steps the walk never read", () => {
    const steps = Object.defineProperty([], "toJSON", { value: () => [{ op: "lines", items: [] }] });
    expect(good(parseDefinition({ ...BARE, steps })).steps).toStrictEqual([]);
  });

  it("reads a getter once, and stores what it said then", () => {
    let reads = 0;
    const a = { get b() { return reads++ === 0 ? 1 : forbidden(); } };
    expect(storedOf(a)).toStrictEqual({ b: 1 });
    expect(reads).toBe(1);
  });

  it("reads an element of a list once, and stores what it said then", () => {
    let reads = 0;
    const a = Object.defineProperty([0], 0, { enumerable: true, get: () => (reads++ === 0 ? 1 : forbidden()) });
    expect(storedOf(a)).toStrictEqual([1]);
    expect(reads).toBe(1);
  });

  it("never asks a Proxy for a toJSON, and asks it for each member once", () => {
    const asked: PropertyKey[] = [];
    const trap = <T extends object>(target: T) => new Proxy(target, {
      get(on, key, receiver) {
        asked.push(key);
        return key === "toJSON" ? () => forbidden() : Reflect.get(on, key, receiver);
      },
    });
    expect(storedOf(trap({ b: 1 }))).toStrictEqual({ b: 1 });
    expect(asked).toEqual(["b"]);
    asked.length = 0;
    expect(storedOf(trap([1, 2]))).toStrictEqual([1, 2]);
    expect(asked).not.toContain("toJSON");
    expect(asked.filter((k) => k === "0" || k === "1")).toEqual(["0", "1"]);
  });

  it("the same value at two places is two values", () => {
    const shared = { b: 1 };
    const stored = storedOf([shared, shared]) as Doc[];
    expect(stored).toStrictEqual([{ b: 1 }, { b: 1 }]);
    expect(stored[0]).not.toBe(stored[1]);
    expect(stored[0]).not.toBe(shared);
  });

  it("stores what a JSON round trip stores, key order included, on 3000 seeded values", { timeout: 60_000 }, () => {
    const rnd = seeded(10312026);
    const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
    const LEAVES = [null, true, false, 0, -0, 1, -1, 1.5, 0.1, 1e21, 1e-7, 5e-324, Number.MAX_VALUE, 2 ** 53, "", "x", "æ", "😀", "\ud83d", "\u0000", '"', "\\", "\n", "{", "__proto__"];
    const NAMES = ["a", "b", "10", "2", "0", "", "a.b", " ", "æ", "toString", "hasOwnProperty", "valueOf", "length", "toJSONish"];
    const seen = { negativeZero: 0, absent: 0, noPrototype: 0, sharedTwice: 0, numberKeys: 0 };
    const make = (depth: number, made: object[]): unknown => {
      const roll = rnd();
      if (depth === 0 || roll < 0.25) {
        const leaf = pick(LEAVES);
        if (Object.is(leaf, -0)) seen.negativeZero++;
        return leaf;
      }
      if (roll < 0.35 && made.length) {
        seen.sharedTwice++;
        return pick(made);
      }
      const size = Math.floor(rnd() * 4);
      if (roll < 0.6) {
        const list = Array.from({ length: size }, () => make(depth - 1, made));
        made.push(list);
        return list;
      }
      const object: Doc = rnd() < 0.2 ? Object.create(null) : {};
      if (Object.getPrototypeOf(object) === null) seen.noPrototype++;
      for (let i = 0; i < size; i++) {
        const key = pick(NAMES), absent = rnd() < 0.15;
        if (/^\d+$/.test(key)) seen.numberKeys++;
        if (absent) seen.absent++;
        object[key] = absent ? undefined : make(depth - 1, made);
      }
      made.push(object);
      return object;
    };
    for (let i = 0; i < 3000; i++) {
      const value = make(5, []);
      const stored = storedOf(value);
      const trip = JSON.parse(JSON.stringify(value));
      expect(stored).toStrictEqual(trip);
      expect(JSON.stringify(stored)).toBe(JSON.stringify(trip));
    }
    expect(seen.negativeZero).toBeGreaterThan(100);
    expect(seen.absent).toBeGreaterThan(100);
    expect(seen.noPrototype).toBeGreaterThan(100);
    expect(seen.sharedTwice).toBeGreaterThan(100);
    expect(seen.numberKeys).toBeGreaterThan(100);
  });
});

describe("unknown keys", () => {
  /** Places whose keys are the shop's own: a record, where any key may stand. */
  const RECORDS = /^(parts|constants|tables(\.\w+)?|facts|presentation\.(groupLabels(\.post)?|urlAttributes|raw(\..*)?|display))$|\.(label|help|message|meta)$/;
  const STRICT = objectsIn(FULL).filter(([at]) => !RECORDS.test(at)).map(([at]) => at);

  // A guard on this file, at collection: the walk must reach every kind of object the contract has.
  const KINDS = ["", "parts.upright", "parts.shelf", "parts.bracket", "fields[0]", "fields[1]", "fields[1].options[0]", "fields[2]", "fields[3]", "fields[4]", "fields[4].fields[0]",
    "groups[0]", "groups[0].derive[0]", "groups[0].fields[2].fields[0]", "derive[0]", "steps[0]", "steps[0].steps[0]", "steps[0].steps[0].items[0]", "steps[0].steps[1]",
    "steps[1]", "steps[2]", "steps[2].steps[0]", "steps[2].steps[1]", "discounts[0]", "discounts[0].steps[0]", "quote", "presentation"];
  for (const kind of KINDS) if (!STRICT.includes(kind)) throw new Error(`the fixture lost ${kind}`);

  it.each(STRICT)("at %s", (at) => {
    const doc = copy(FULL) as unknown as Doc;
    const target = at ? (getAt(doc, at) as Doc) : doc;
    target.zzz = 1;
    expect(refusal(doc)).toEqual([[at ? `${at}.zzz` : "zzz", "unknown_key"]]);
  });

  it("each by its own path, as many as there are", () => {
    expect(refusal({ ...BARE, a: 1, b: 2, quote: { validDays: 1, c: 3, d: 4 } })).toEqual(expect.arrayContaining([["a", "unknown_key"], ["b", "unknown_key"], ["quote.c", "unknown_key"], ["quote.d", "unknown_key"]]));
    expect(refusal({ ...BARE, a: 1, b: 2, quote: { validDays: 1, c: 3, d: 4 } })).toHaveLength(4);
  });

  it("the key of one kind of step or field on another is unknown too", () => {
    expect(refusal(withAt(BARE, "steps", [{ op: "block", steps: [], items: [] }]))).toEqual([["steps[0].items", "unknown_key"]]);
    expect(refusal(withAt(BARE, "fields", [{ key: "a", type: "checkbox", options: [] }]))).toEqual([["fields[0].options", "unknown_key"]]);
    expect(refusal(withAt(BARE, "fields", [{ key: "a", type: "number", maxLength: 1 }]))).toEqual([["fields[0].maxLength", "unknown_key"]]);
  });
});

describe("every expression", () => {
  const EXPRESSIONS = [
    "fields[1].showIf",
    "fields[1].options[0].showIf",
    "fields[4].fields[0].showIf",
    "groups[0].skipWhen",
    "groups[0].derive[0].expr",
    "groups[0].fields[0].showIf",
    "groups[0].fields[1].options[0].showIf",
    "groups[0].fields[2].fields[0].showIf",
    "derive[0].expr",
    "steps[0].when",
    "steps[0].steps[0].when",
    "steps[0].steps[0].items[0].qty",
    "steps[0].steps[0].items[0].when",
    "steps[0].steps[1].when",
    "steps[0].steps[1].qty",
    "steps[0].steps[2].when",
    "steps[0].steps[2].steps[0].items[0].fixedOre",
    "steps[1].when",
    "steps[1].amount",
    "steps[2].when",
    "steps[2].steps[0].when",
    "steps[2].steps[1].when",
    "discounts[0].metric",
    "facts.bays",
    "presentation.display.perBay",
  ];
  const TEMPLATES = [
    "steps[0].steps[0].items[0].key",
    "steps[0].steps[0].items[0].part",
    "steps[0].steps[0].items[0].label",
    "steps[0].steps[0].items[0].note",
    "steps[0].steps[0].items[0].meta.code",
    "steps[0].steps[1].from",
    "steps[0].steps[1].to",
    "steps[2].steps[1].path",
    "presentation.summary",
  ];
  const BROKEN: [string, string][] = [
    ["1 +", "syntax"],
    ["1e-9", "syntax"],
    ["1<2<3", "syntax"],
    ["nope(1)", "unknown_function"],
    ["ceil(1,2)", "arity"],
    ["__proto__", "forbidden_name"],
    ["a.constructor", "forbidden_name"],
    ["a.prototype.b", "forbidden_name"],
    ["lookup('__proto__',1)", "forbidden_name"],
    ["lookup(t,1)", "table_not_literal"],
    ["sum(1,2)", "not_a_list"],
    [`1${"+1".repeat(1100)}`, "too_long"],
    ["(".repeat(300), "too_deep"],
  ];

  describe.each(EXPRESSIONS)("%s", (at) => {
    it.each(BROKEN)("refuses %s", (src, code) => {
      expect(refusal(withAt(FULL, at, src))).toEqual([[at, code]]);
    });
    it("refuses an empty one and one that is no string", () => {
      expect(refusal(withAt(FULL, at, ""))).toEqual([[at, "syntax"]]);
      expect(refusal(withAt(FULL, at, 1))).toEqual([[at, "invalid_type"]]);
    });
  });

  describe.each(TEMPLATES)("the holes of %s", (at) => {
    it.each(BROKEN.filter(([src]) => src.length < 2000))("refuses a hole holding %s", (src, code) => {
      expect(refusal(withAt(FULL, at, `x{${src}}y`))).toEqual([[at, code]]);
    });
    it.each(["x{", "x}", "{{a}}", "{a}}", "{a}{", "{}"])("refuses %s", (src) => {
      expect(refusal(withAt(FULL, at, src))).toEqual([[at, "syntax"]]);
    });
    it("refuses one that is no string", () => {
      expect(refusal(withAt(FULL, at, 1))).toEqual([[at, "invalid_type"]]);
    });
    it("takes plain text", () => {
      expect(parseDefinition(withAt(FULL, at, "plain text")).ok).toBe(true);
    });
  });

  it("the path and the message both say where", () => {
    const out = parseDefinition(withAt(FULL, "steps[0].steps[0].items[0].qty", "1 + + "));
    expect(out).toMatchObject({ ok: false, errors: [{ path: "steps[0].steps[0].items[0].qty", code: "syntax", severity: "error" }] });
    if (!out.ok) expect(out.errors[0].message).toContain("(at 4)");
    const hole = parseDefinition(withAt(FULL, "steps[0].steps[1].to", "ab{cd +}"));
    if (!hole.ok) expect(hole.errors[0].message).toContain("(at 7)");
    expect(hole.ok).toBe(false);
  });

  it("reports every fault, not the first", () => {
    const doc = withAt(withAt(withAt(FULL, "derive[0].expr", "1 +"), "steps[1].amount", "nope(1)"), "presentation.summary", "{");
    expect(refusal(doc)).toEqual(expect.arrayContaining([["derive[0].expr", "syntax"], ["steps[1].amount", "unknown_function"], ["presentation.summary", "syntax"]]));
    expect(refusal(doc)).toHaveLength(3);
  });

  describe("a list for `each` to walk", () => {
    it.each<[string, string]>([
      ["__proto__", "forbidden_name"],
      ["rows.__proto__", "forbidden_name"],
      ["constructor", "forbidden_name"],
      ["1+1", "not_a_list"],
      ["count(rows)", "not_a_list"],
      ["true", "not_a_list"],
      ["'rows'", "not_a_list"],
      ["", "syntax"],
      ["rows rows", "syntax"],
    ])("refuses %s", (of, code) => {
      expect(refusal(withAt(FULL, "steps[0].of", of))).toEqual([["steps[0].of", code]]);
      expect(refusal(withAt(FULL, "steps[0].steps[2].of", of))).toEqual([["steps[0].steps[2].of", code]]);
    });
    it("names a group or a bound list", () => {
      expect(good(parseDefinition(withAt(FULL, "steps[0].of", "row.doors.a")))).toBeTruthy();
    });
    it("is a string", () => {
      expect(refusal(withAt(FULL, "steps[0].of", 1))).toEqual([["steps[0].of", "invalid_type"]]);
    });
  });

  it("reads a dotted name in a template hole and in a raw path alike", () => {
    expect(parseDefinition(withAt(FULL, "steps[0].steps[1].to", "{row.a.b}")).ok).toBe(true);
    expect(parseDefinition(withAt(FULL, "fields[0].from", "row.a.b")).ok).toBe(true);
  });
});

describe("parseTemplate", () => {
  const nodeOf = (src: string) => {
    const out = parseExpr(src);
    if (!out.ok) throw new Error(src);
    return out.value;
  };
  it.each<[string, unknown[]]>([
    ["", []],
    ["text", ["text"]],
    ["text with spaces, æøå and a new\nline", ["text with spaces, æøå and a new\nline"]],
    ["{a}", [nodeOf("a")]],
    ["{ a }", [nodeOf(" a ")]],
    ["a{b}", ["a", nodeOf("b")]],
    ["{a}b", [nodeOf("a"), "b"]],
    ["a{b}c{d}e", ["a", nodeOf("b"), "c", nodeOf("d"), "e"]],
    ["{a}{b}", [nodeOf("a"), nodeOf("b")]],
    ["{'x'}", [nodeOf("'x'")]],
    ["{'{'}", [nodeOf("'{'")]],
    ["{'}'}", [nodeOf("'}'")]],
    ["{'it\\'s {'}", [nodeOf("'it\\'s {'")]],
    ["{lookup('t',a,'}')}", [nodeOf("lookup('t',a,'}')")]],
    ["a{'{'}b{'}'}c", ["a", nodeOf("'{'"), "b", nodeOf("'}'"), "c"]],
    ["it's {a}", ["it's ", nodeOf("a")]],
    ["{a}'s and {b}'s", [nodeOf("a"), "'s and ", nodeOf("b"), "'s"]],
  ])("reads %j", (src, want) => {
    expect(parseTemplate(src)).toEqual({ ok: true, value: want });
  });

  it.each<[string, string, number]>([
    ["{", "syntax", 0],
    ["}", "syntax", 0],
    ["a}", "syntax", 1],
    ["ab{", "syntax", 2],
    ["{{a}}", "syntax", 0],
    ["{a}}", "syntax", 3],
    ["{a}{", "syntax", 3],
    ["{a}b}c", "syntax", 4],
    ["{'a}", "syntax", 0],
    ["{a'}", "syntax", 0],
    ["{}", "syntax", 1],
    ["{ }", "syntax", 2],
    ["x{1 +}", "syntax", 5],
    ["xy{a}z{1 +}", "syntax", 10],
    ["x{nope(1)}", "unknown_function", 2],
    ["x{__proto__}", "forbidden_name", 2],
    ["{a}{b.constructor}", "forbidden_name", 4],
  ])("refuses %j with %s at %i", (src, code, pos) => {
    const out = parseTemplate(src);
    expect(out.ok ? "parsed" : [out.error.code, out.error.pos]).toEqual([code, pos]);
  });

  /** The prototype's own rule for a hole, kept apart from the code it checks: where the two can differ at all is a brace held in a string, which this alphabet has no quote to write. */
  it("finds the holes the contract's prototype finds, on 20000 strings, and refuses where its text would hold a brace", { timeout: 60_000 }, () => {
    const rnd = seeded(404);
    const alphabet = ["{a}", "{a.b}", "{ 1+1 }", "{ceil(a)}", "{}", "{ }", "{1+}", "{nope(1)}", "{", "}", "a", "b c", " ", "1", "+", "."];
    const seen = { parsed: 0, stray: 0, broken: 0, holes: 0 };
    for (let n = 0; n < 20000; n++) {
      const src = Array.from({ length: Math.floor(rnd() * 7) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
      const pieces = src.split(/\{([^{}]*)\}/); // text, hole, text, hole, …, text
      const texts = pieces.filter((_, i) => i % 2 === 0), holes = pieces.filter((_, i) => i % 2 === 1);
      const out = parseTemplate(src);
      if (texts.some((t) => /[{}]/.test(t))) {
        seen.stray++;
        expect(out.ok).toBe(false);
      } else if (holes.some((h) => !parseExpr(h).ok)) {
        seen.broken++;
        expect(out.ok).toBe(false);
      } else {
        seen.parsed++;
        seen.holes += holes.length;
        const want = pieces.flatMap<unknown>((p, i) => (i % 2 === 1 ? [nodeOf(p)] : p ? [p] : []));
        expect(out).toEqual({ ok: true, value: want });
      }
    }
    expect(seen.parsed).toBeGreaterThan(1000);
    expect(seen.holes).toBeGreaterThan(500);
    expect(seen.stray).toBeGreaterThan(1000);
    expect(seen.broken).toBeGreaterThan(100);
  });

  it("a brace is refused in plain text, even where it would make a part's name", () => {
    expect(parseDefinition(withAt(BARE, "steps", [{ op: "lines", items: [{ key: "a", part: "gate-{size", qty: "1" }] }])).ok).toBe(false);
  });

  it("answers anything that is no string with a value", () => {
    for (const notText of [1, null, undefined, true, {}, [], Symbol("s"), BigInt(1), () => 1, new String("{a}")]) {
      expect(parseTemplate(notText as unknown as string)).toMatchObject({ ok: false, error: { code: "syntax", pos: 0 } });
    }
  });

  /** The read before it went linear, kept as the oracle: it searched for the holes first, then read the text between them. */
  function bySearching(src: string): ReturnType<typeof parseTemplate> {
    const parts: unknown[] = [];
    let at = 0;
    for (const hole of [...src.matchAll(/\{((?:[^{}']|'(?:[^'\\]|\\.)*')*)\}/g), null]) {
      const end = hole ? hole.index : src.length;
      const plain = src.slice(at, end), brace = plain.search(/[{}]/);
      if (brace >= 0) return { ok: false, error: { code: "syntax", message: "a brace outside a {hole}", pos: at + brace } };
      if (plain) parts.push(plain);
      if (!hole) break;
      const out = parseExpr(hole[1]);
      if (!out.ok) return { ok: false, error: { ...out.error, pos: end + 1 + out.error.pos } };
      parts.push(out.value);
      at = end + hole[0].length;
    }
    return { ok: true, value: parts as ReturnType<typeof nodeOf>[] };
  }
  it("reads what a search for the holes read, on 30000 strings of quotes, escapes and braces: the same parts, or the same first fault", { timeout: 60_000 }, () => {
    const rnd = seeded(10312027);
    const alphabet = ["{", "}", "'", "\\", "\n", " ", "a", "1", "+", " ", ".", "{a}", "{'", "'}", "\\'", "\\\n", "{'{'}", "{'}'}", "{'\\''}", "{'a\\\nb'}", "{1+}", "{nope(1)}", "{__proto__}", "lookup('t',a,'}')", "{lookup('t',a,'{')}"];
    const seen = { parsed: 0, holeWithBrace: 0, stray: 0, broken: 0 };
    for (let n = 0; n < 30000; n++) {
      const src = Array.from({ length: Math.floor(rnd() * 8) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
      const want = bySearching(src);
      expect(parseTemplate(src)).toEqual(want);
      if (want.ok) {
        seen.parsed++;
        if (want.value.some((p) => typeof p !== "string" && p.kind === "literal" && /[{}]/.test(String(p.value)))) seen.holeWithBrace++;
      } else if (want.error.message === "a brace outside a {hole}") seen.stray++;
      else seen.broken++;
    }
    expect(seen.parsed).toBeGreaterThan(1000);
    expect(seen.holeWithBrace).toBeGreaterThan(50);
    expect(seen.stray).toBeGreaterThan(1000);
    expect(seen.broken).toBeGreaterThan(1000);
  });

  describe("at any length", () => {
    /** Every { of this opens a string that never closes, so a search that starts again from each of them is quadratic. */
    const unclosed = (length: number) => `{'${"\\'{".repeat((length - 2) / 3)}`;
    const answer = (out: ReturnType<typeof parseTemplate>) => (out.ok ? "parsed" : [out.error.code, out.error.pos]);
    it("reads a string of unclosed strings in one pass", { timeout: 5_000 }, () => {
      expect(answer(parseTemplate(unclosed(480_002)))).toEqual(["syntax", 0]);
    });
    it("through a document, one long template", { timeout: 5_000 }, () => {
      expect(refusal({ ...BARE, presentation: { summary: unclosed(480_002) } })).toEqual([["presentation.summary", "syntax"]]);
    });
    it("through a document, many: a cap on the length alone would still add up", { timeout: 5_000 }, () => {
      const items = Array.from({ length: 18 }, () => ({ key: "a", qty: "1", label: unclosed(50_000) }));
      expect(refusal({ ...BARE, steps: [{ op: "lines", items }] })).toEqual(items.map((_, i) => [`steps[0].items[${i}].label`, "syntax"]));
    });

    const TOO_LONG = { ok: false, error: { code: "too_long", message: `a template is at most ${MAX_JSON_CHARS} characters`, pos: MAX_JSON_CHARS } };
    it.each<[string, string]>([
      ["a hole", `{${"a".repeat(1e7)}}`],
      ["a hole never closed", `{${"a".repeat(3e7)}`],
      ["a string in a hole", `{'${"a".repeat(3e7)}'}`],
      ["plain text", "a".repeat(3e7)],
    ])("answers %s far over the limit with a value, where the regex's stack ran out and it threw", (_name, src) => {
      expect(parseTemplate(src)).toEqual(TOO_LONG);
    });
    it("takes text up to the limit and refuses one character more", () => {
      const text = "a".repeat(MAX_JSON_CHARS);
      expect(parseTemplate(text)).toEqual({ ok: true, value: [text] });
      expect(parseTemplate(`${text}a`)).toEqual(TOO_LONG);
    });

    /** A template as long as the limit lets it be, in the shapes that load the regex's stack the most. It holds, and the answer is the one a short template gets. */
    const IN_HOLE = 1 + MAX_EXPR_LENGTH;
    it.each<[string, string, string, number]>([
      ["a hole", `{${"a".repeat(MAX_JSON_CHARS - 2)}}`, "too_long", IN_HOLE],
      ["a hole never closed", `{${"a".repeat(MAX_JSON_CHARS - 1)}`, "syntax", 0],
      ["a string", `{'${"a".repeat(MAX_JSON_CHARS - 4)}'}`, "too_long", IN_HOLE],
      ["a string never closed", `{'${"a".repeat(MAX_JSON_CHARS - 2)}`, "syntax", 0],
      ["many strings", `{${"'a'".repeat((MAX_JSON_CHARS - 2) / 3)}}`, "too_long", IN_HOLE],
      ["many strings, never closed", `{${"'a'".repeat((MAX_JSON_CHARS - 1) / 3)}`, "syntax", 0],
      ["escapes", `{'${"\\a".repeat((MAX_JSON_CHARS - 4) / 2)}'}`, "too_long", IN_HOLE],
      ["unclosed strings", unclosed(MAX_JSON_CHARS), "syntax", 0],
      ["opening braces", "{".repeat(MAX_JSON_CHARS), "syntax", 0],
      ["closing braces", "}".repeat(MAX_JSON_CHARS), "syntax", 0],
      ["empty holes", "{}".repeat(MAX_JSON_CHARS / 2), "syntax", 1],
    ])("%s at the limit", (_name, src, code, pos) => {
      expect(answer(parseTemplate(src))).toEqual([code, pos]);
    });
    it("as many holes as the limit has room for are all read", { timeout: 60_000 }, () => {
      const holes = Math.floor(MAX_JSON_CHARS / 3);
      const out = parseTemplate("{a}".repeat(holes));
      expect(out.ok && out.value.length).toBe(holes);
      expect(out.ok && out.value[holes - 1]).toEqual(nodeOf("a"));
    });
  });
});

describe("names", () => {
  const PLACES = [
    "fields[0].key",
    "fields[4].as",
    "fields[4].fields[0].key",
    "groups[0].key",
    "groups[0].as",
    "groups[0].derive[0].name",
    "groups[0].fields[0].key",
    "groups[0].fields[2].as",
    "derive[0].name",
  ];
  const RESERVED = ["prev", "index", "true", "false", "null", "constructor", "prototype"];
  const INVALID = ["__proto__", "_a", "1a", "a-b", "a.b", "a b", "", " a", "a ", "a\n", "æ", "{a}"];
  describe.each(PLACES)("%s", (at) => {
    it.each(RESERVED)("refuses %s as reserved", (word) => {
      expect(refusal(withAt(FULL, at, word))).toEqual([[at, "reserved_name"]]);
    });
    it.each(INVALID)("refuses %j as no name", (word) => {
      expect(refusal(withAt(FULL, at, word))).toEqual([[at, "invalid_name"]]);
    });
    it("takes a name, and only a string", () => {
      for (const fine of ["a", "A", "aB_1", "Z9"]) expect(parseDefinition(withAt(FULL, at, fine)).ok).toBe(true);
      expect(refusal(withAt(FULL, at, 1))).toEqual([[at, "invalid_type"]]);
    });
  });

  it.each(RESERVED)("a constant cannot be called %s", (word) => {
    expect(refusal(JSON.parse(`{"schemaVersion":1,"parts":{},"constants":{"${word}":1},"fields":[],"steps":[]}`))).toEqual([[`constants.${word}`, word === "constructor" || word === "prototype" ? "forbidden_key" : "reserved_name"]]);
  });
  it.each(INVALID.filter((w) => w !== "__proto__"))("a constant cannot be called %j", (word) => {
    expect(refusal({ ...BARE, constants: { [word]: 1 } })).toEqual([[`constants.${word}`, "invalid_name"]]);
  });

  it.each(["fields[0].from", "fields[1].from", "groups[0].from"])("%s is a path that keeps away from what must never be read", (at) => {
    for (const bad of ["", ".a", "a.", "a..b"]) expect(refusal(withAt(FULL, at, bad))).toEqual([[at, "invalid_path"]]);
    for (const bad of ["__proto__", "constructor", "prototype", "a.__proto__", "a.constructor.b", "prototype.a"]) expect(refusal(withAt(FULL, at, bad))).toEqual([[at, "forbidden_name"]]);
    for (const fine of ["a", "a.b", "a-b.c d.0", "a-.b", "constructor-x.y", "__proto", "a.proto"]) expect(parseDefinition(withAt(FULL, at, fine)).ok).toBe(true);
    expect(refusal(withAt(FULL, at, 1))).toEqual([[at, "invalid_type"]]);
  });
});

describe("the shape", () => {
  it.each<[string, unknown, string]>([
    ["schemaVersion", 2, "invalid_value"],
    ["schemaVersion", "1", "invalid_value"],
    ["fields", {}, "invalid_type"],
    ["groups", {}, "invalid_type"],
    ["derive", {}, "invalid_type"],
    ["steps", {}, "invalid_type"],
    ["discounts", {}, "invalid_type"],
    ["lineOrder", "wood", "invalid_type"],
    ["lineOrder[0]", "", "too_small"],
    ["lineOrder[0]", 1, "invalid_type"],
    ["parts", [], "invalid_type"],
    ["constants", [], "invalid_type"],
    ["constants.bayM", null, "invalid_union"],
    ["constants.bayM", {}, "invalid_union"],
    ["tables", [], "invalid_type"],
    ["tables.heightCm", 1, "invalid_type"],
    ["tables.heightCm.low", null, "invalid_union"],
    ["facts", [], "invalid_type"],
    ["facts.bays", 1, "invalid_type"],
    ["quote", 30, "invalid_type"],
    ["quote.validDays", 0, "too_small"],
    ["quote.validDays", -1, "too_small"],
    ["quote.validDays", 1.5, "invalid_type"],
    ["quote.validDays", "30", "invalid_type"],
    ["presentation", [], "invalid_type"],
    ["presentation.groupLabels", [], "invalid_type"],
    ["presentation.groupLabels.wood", 1, "invalid_union"],
    ["presentation.stateParam", "", "too_small"],
    ["presentation.stateParam", 1, "invalid_type"],
    ["presentation.urlAttributes", [], "invalid_type"],
    ["presentation.urlAttributes.colour", 1, "invalid_type"],
    ["presentation.raw", [], "invalid_type"],
    ["presentation.raw", "text", "invalid_type"],
    ["presentation.display", [], "invalid_type"],
    ["parts.upright", 1, "invalid_union"],
    ["parts.upright", {}, "invalid_union"],
    ["parts.upright.source", "", "too_small"],
    ["parts.upright.product", "", "too_small"],
    ["parts.upright.variant", "", "too_small"],
    ["parts.shelf.sku", "", "too_small"],
    ["parts.bracket.slug", "", "too_small"],
    ["parts.bracket.variantSku", "", "too_small"],
    ["fields[0].label", 1, "invalid_union"],
    ["fields[0].help", 1, "invalid_union"],
    ["fields[0].required", "yes", "invalid_type"],
    ["fields[0].type", "date", "invalid_union"],
    ["fields[0].min", "1", "invalid_type"],
    ["fields[0].max", "1", "invalid_type"],
    ["fields[0].step", "1", "invalid_type"],
    ["fields[0].unit", 1, "invalid_type"],
    ["fields[0].absInt", 1, "invalid_type"],
    ["fields[0].default", "1", "invalid_type"],
    ["fields[1].scope", "private", "invalid_value"],
    ["fields[1].options", {}, "invalid_type"],
    ["fields[1].options[0].value", true, "invalid_union"],
    ["fields[1].options[0].value", null, "invalid_union"],
    ["fields[1].options[0].label", 1, "invalid_union"],
    ["fields[1].options[0].default", 1, "invalid_type"],
    ["fields[1].options[0].image", 1, "invalid_type"],
    ["fields[1].default", true, "invalid_union"],
    ["fields[1].onInvalid", "skip", "invalid_value"],
    ["fields[1].widget", "dropdown", "invalid_value"],
    ["fields[2].default", "x", "invalid_type"],
    ["fields[3].maxLength", 1.5, "invalid_type"],
    ["fields[3].maxLength", -1, "too_small"],
    ["fields[3].default", 1, "invalid_type"],
    ["fields[3].scope", "public", "invalid_value"],
    ["fields[4].min", 1.5, "invalid_type"],
    ["fields[4].min", -1, "too_small"],
    ["fields[4].max", 1.5, "invalid_type"],
    ["fields[4].max", -1, "too_small"],
    ["fields[4].overflow", "drop", "invalid_value"],
    ["fields[4].fields", {}, "invalid_type"],
    ["fields[4].fields[0].type", "date", "invalid_union"],
    ["groups[0].label", 1, "invalid_union"],
    ["groups[0].min", 1.5, "invalid_type"],
    ["groups[0].min", -1, "too_small"],
    ["groups[0].max", 1.5, "invalid_type"],
    ["groups[0].max", -1, "too_small"],
    ["groups[0].overflow", "drop", "invalid_value"],
    ["groups[0].fields", {}, "invalid_type"],
    ["groups[0].derive", {}, "invalid_type"],
    ["steps[0].op", "loop", "invalid_union"],
    ["steps[0].steps", {}, "invalid_type"],
    ["steps[0].steps[0].items", {}, "invalid_type"],
    ["steps[0].steps[0].items[0].key", "", "too_small"],
    ["steps[0].steps[0].items[0].part", "", "too_small"],
    ["steps[0].steps[0].items[0].group", "", "too_small"],
    ["steps[0].steps[0].items[0].group", 1, "invalid_type"],
    ["steps[0].steps[0].items[0].tags", "wood", "invalid_type"],
    ["steps[0].steps[0].items[0].tags[0]", "", "too_small"],
    ["steps[0].steps[0].items[0].meta", [], "invalid_type"],
    ["steps[0].steps[1].from", "", "too_small"],
    ["steps[0].steps[1].to", "", "too_small"],
    ["steps[1].tag", "", "too_small"],
    ["steps[1].tag", 1, "invalid_type"],
    ["steps[1].keepAtLeast", 0.5, "invalid_type"],
    ["steps[1].keepAtLeast", -1, "too_small"],
    ["steps[1].firstOnly", 1, "invalid_type"],
    ["steps[2].steps", {}, "invalid_type"],
    ["steps[2].steps[0].code", "", "too_small"],
    ["steps[2].steps[0].message", 1, "invalid_union"],
    ["steps[2].steps[1].code", "", "too_small"],
    ["steps[2].steps[1].message", 1, "invalid_union"],
    ["discounts[0].key", "", "too_small"],
    ["discounts[0].label", 1, "invalid_union"],
    ["discounts[0].base", "", "too_small"],
    ["discounts[0].steps", [], "too_small"],
    ["discounts[0].steps[0].min", "1", "invalid_type"],
    ["discounts[0].steps[0].bps", 0, "too_small"],
    ["discounts[0].steps[0].bps", -1, "too_small"],
    ["discounts[0].steps[0].bps", 10_001, "too_big"],
    ["discounts[0].steps[0].bps", 1.5, "invalid_type"],
    ["discounts[0].steps[0].bps", "500", "invalid_type"],
  ])("%s cannot be %j", (at, value, code) => {
    expect(refusal(withAt(FULL, at, value))).toEqual([[at, code]]);
  });

  /** A value of the wrong type in a union of objects is the union's fault, at the union. */
  it.each<[string, unknown, string]>([
    ["parts.upright.source", 1, "parts.upright"],
    ["parts.upright.product", 1, "parts.upright"],
    ["parts.upright.variant", 1, "parts.upright"],
    ["parts.shelf.sku", 1, "parts.shelf"],
    ["parts.bracket.slug", 1, "parts.bracket"],
    ["parts.bracket.variantSku", 1, "parts.bracket"],
    ["fields[0].help.en", 1, "fields[0].help"],
  ])("%s cannot be %j, and %s says so", (at, value, where) => {
    expect(refusal(withAt(FULL, at, value))).toEqual([[where, "invalid_union"]]);
  });

  it.each<[string, string]>([
    ["schemaVersion", "invalid_value"],
    ["parts", "invalid_type"],
    ["fields", "invalid_type"],
    ["steps", "invalid_type"],
    ["fields[0].key", "invalid_type"],
    ["fields[1].options", "invalid_type"],
    ["fields[1].options[0].value", "invalid_union"],
    ["fields[3].maxLength", "invalid_type"],
    ["fields[3].scope", "invalid_value"],
    ["fields[4].as", "invalid_type"],
    ["fields[4].max", "invalid_type"],
    ["fields[4].overflow", "invalid_value"],
    ["fields[4].fields", "invalid_type"],
    ["groups[0].key", "invalid_type"],
    ["groups[0].as", "invalid_type"],
    ["groups[0].max", "invalid_type"],
    ["groups[0].overflow", "invalid_value"],
    ["groups[0].fields", "invalid_type"],
    ["groups[0].derive[0].name", "invalid_type"],
    ["groups[0].derive[0].expr", "invalid_type"],
    ["steps[0].of", "invalid_type"],
    ["steps[0].steps", "invalid_type"],
    ["steps[0].steps[0].items", "invalid_type"],
    ["steps[0].steps[0].items[0].key", "invalid_type"],
    ["steps[0].steps[0].items[0].qty", "invalid_type"],
    ["steps[0].steps[1].from", "invalid_type"],
    ["steps[0].steps[1].to", "invalid_type"],
    ["steps[1].tag", "invalid_type"],
    ["steps[1].amount", "invalid_type"],
    ["steps[2].steps", "invalid_type"],
    ["steps[2].steps[0].when", "invalid_type"],
    ["steps[2].steps[0].code", "invalid_type"],
    ["steps[2].steps[1].when", "invalid_type"],
    ["steps[2].steps[1].code", "invalid_type"],
    ["discounts[0].key", "invalid_type"],
    ["discounts[0].metric", "invalid_type"],
    ["discounts[0].base", "invalid_type"],
    ["discounts[0].steps", "invalid_type"],
    ["discounts[0].steps[0].min", "invalid_type"],
    ["discounts[0].steps[0].bps", "invalid_type"],
    ["quote.validDays", "invalid_type"],
    ["derive[0].name", "invalid_type"],
    ["derive[0].expr", "invalid_type"],
  ])("%s must be there", (at, code) => {
    expect(refusal(without(FULL, at))).toEqual([[at, code]]);
  });

  it.each<[string, Doc, string, string]>([
    ["a field with no type", withAt(BARE, "fields", [{ key: "a" }]), "fields[0].type", "invalid_union"],
    ["a step with no verb", withAt(BARE, "steps", [{ when: "true" }]), "steps[0].op", "invalid_union"],
    ["a part in no form", withAt(BARE, "parts", { a: { sku: "s", slug: "t" } }), "parts.a", "invalid_union"],
    ["a part with half a source", withAt(BARE, "parts", { a: { source: "s" } }), "parts.a", "invalid_union"],
    ["a part with a key of its own", withAt(BARE, "parts", { a: { sku: "s", zzz: 1 } }), "parts.a.zzz", "unknown_key"],
    ["a part by source with a key of its own", withAt(BARE, "parts", { a: { source: "s", product: "p", zzz: 1 } }), "parts.a.zzz", "unknown_key"],
    ["a part by slug with a key of its own", withAt(BARE, "parts", { a: { slug: "s", zzz: 1 } }), "parts.a.zzz", "unknown_key"],
    ["two discounts", { ...BARE, discounts: Array(2).fill({ key: "a", metric: "1", base: "all", steps: [{ min: 0, bps: 1 }] }) }, "discounts", "too_big"],
    ["a part with no name", withAt(BARE, "parts", { "": { sku: "s" } }), "parts.", "too_small"],
    ["a table with no name", { ...BARE, tables: { "": {} } }, "tables.", "too_small"],
    ["a fact with no name", { ...BARE, facts: { "": "1" } }, "facts.", "too_small"],
    ["a meta with no name", withAt(BARE, "steps", [{ op: "lines", items: [{ key: "a", qty: "1", meta: { "": "x" } }] }]), "steps[0].items[0].meta.", "too_small"],
    ["a display with no name", { ...BARE, presentation: { display: { "": "1" } } }, "presentation.display.", "too_small"],
    ["a public text field", withAt(BARE, "fields", [{ key: "a", type: "text", maxLength: 1, scope: "public" }]), "fields[0].scope", "invalid_value"],
    ["a text field with no scope", withAt(BARE, "fields", [{ key: "a", type: "text", maxLength: 1 }]), "fields[0].scope", "invalid_value"],
    ["a number as the document", 1 as unknown as Doc, "", "invalid_type"],
    ["null as the document", null as unknown as Doc, "", "invalid_type"],
    ["a list as the document", [] as unknown as Doc, "", "invalid_type"],
    ["a string as the document", "{}" as unknown as Doc, "", "invalid_type"],
  ])("%s", (_name, doc, at, code) => {
    expect(refusal(doc)).toEqual([[at, code]]);
  });

  it("each fault is plain data with a severity", () => {
    const out = parseDefinition({ ...BARE, zzz: 1 });
    expect(out).toEqual({ ok: false, errors: [{ path: "zzz", code: "unknown_key", message: "unknown key zzz", severity: "error" }] });
  });
  it("says what a union wants", () => {
    const part = parseDefinition(withAt(BARE, "parts", { a: {} }));
    if (!part.ok) expect(part.errors[0].message).toContain("{ sku }");
    const scalar = parseDefinition({ ...BARE, constants: { a: null } });
    if (!scalar.ok) expect(scalar.errors[0].message).toContain("true or false");
    const text = parseDefinition(withAt(BARE, "fields", [{ key: "a", type: "checkbox", label: 1 }]));
    if (!text.ok) expect(text.errors[0].message).toContain("by locale");
    const value = parseDefinition(withAt(BARE, "fields", [{ key: "a", type: "select", options: [{ value: true }] }]));
    if (!value.ok) expect(value.errors[0].message).toContain("a string or a number");
    expect([part.ok, scalar.ok, text.ok, value.ok]).toEqual([false, false, false, false]);
  });
  it("says what a name is and what a path holds", () => {
    const messageOf = (doc: unknown) => {
      const out = parseDefinition(doc);
      return out.ok ? "parsed" : out.errors[0].message;
    };
    expect(messageOf(withAt(FULL, "fields[0].key", "1a"))).toBe("1a is not a name: a letter, then letters, digits and _");
    expect(messageOf(withAt(FULL, "fields[0].key", "prev"))).toBe("prev is reserved");
    expect(messageOf(withAt(FULL, "fields[0].from", "a..b"))).toBe("a..b has an empty segment");
    expect(messageOf(withAt(FULL, "fields[0].from", "a.__proto__"))).toBe("a.__proto__ can never be read");
    expect(messageOf(withAt(FULL, "steps[0].of", "1+1"))).toBe("1+1 is not the name of a list");
    expect(messageOf(JSON.parse('{"schemaVersion":1,"parts":{},"fields":[],"steps":[],"__proto__":1}'))).toBe("__proto__ can never be a key");
    expect(messageOf(NaN)).toBe("not JSON: NaN");
    expect(messageOf(() => 1)).toBe("not JSON: function");
    expect(messageOf(new Date(0))).toBe("not JSON: an object of a class");
    expect(messageOf(listWith({ extra: 1 }))).toBe("not JSON: a list with a named member");
  });
});

describe("the rule hash", () => {
  /** SMALL by hand: sorted keys at every depth, arrays in order, no space. */
  const SMALL_CANONICAL =
    '{"fields":[{"key":"size","options":[{"value":"120"},{"value":"140"}],"required":true,"type":"select"},' +
    '{"key":"handle","options":[{"default":true,"value":"black"},{"value":"steel"}],"type":"select"},' +
    '{"key":"hinge","options":[{"value":"left"},{"value":"right"}],"required":true,"showIf":"size==\'140\'","type":"select"}],' +
    '"parts":{"gate-120":{"sku":"G120"},"gate-140":{"sku":"G140"}},"schemaVersion":1,' +
    '"steps":[{"items":[{"key":"gate","part":"gate-{size}","qty":"1"},' +
    '{"fixedOre":"14900","key":"handle-steel","label":"Steel handle","qty":"1","when":"handle==\'steel\'"}],"op":"lines"}]}';

  it("is the sha256 of the canonical JSON, whole, in hex", () => {
    expect(stableJson(SMALL)).toBe(SMALL_CANONICAL);
    expect(ruleHash(SMALL)).toBe(createHash("sha256").update(SMALL_CANONICAL, "utf8").digest("hex"));
  });

  it("is pinned: a stored hash must keep its meaning within schemaVersion 1", () => {
    expect(ruleHash(SMALL)).toBe("330291fa726f311337ee0fe6b8b8aafd437bc5c2d45e2f2969cbb2c8ff3bf6c6");
    expect(ruleHash(FULL)).toBe("405e34e4ce610bcdb0e1ccee17bd11478832faea5f95587055ccd6c3ccfa5784");
  });

  function shuffled<T>(v: T, rnd: () => number): T {
    if (Array.isArray(v)) return v.map((x) => shuffled(x, rnd)) as T;
    if (v === null || typeof v !== "object") return v;
    const keys = Object.keys(v).map((k) => [rnd(), k] as const).sort(([a], [b]) => a - b).map(([, k]) => k);
    return Object.fromEntries(keys.map((k) => [k, shuffled((v as Doc)[k], rnd)])) as T;
  }

  it("does not move with the order of keys, at any depth", () => {
    const rnd = seeded(20261031);
    const want = hashOf(FULL);
    const orders = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const doc = shuffled(FULL, rnd);
      orders.add(JSON.stringify(doc));
      expect(hashOf(doc)).toBe(want);
    }
    expect(orders.size).toBe(200); // so the walk did what it says
    expect(hashOf(JSON.parse(`{"steps":[],"fields":[],"parts":{"b":{"sku":"x"},"a":{"sku":"y"}},"schemaVersion":1}`))).toBe(hashOf({ schemaVersion: 1, parts: { a: { sku: "y" }, b: { sku: "x" } }, fields: [], steps: [] }));
  });

  it("sorts keys by code unit, without a locale and not as numbers", () => {
    expect(stableJson({ b: 1, a: 2, B: 3, Z: 4, "é": 5, "10": 6, "9": 7, "": 8 })).toBe('{"":8,"10":6,"9":7,"B":3,"Z":4,"a":2,"b":1,"é":5}');
  });

  /** Written any way, a number is one double, and a double has one canonical form: the hash is taken over this text, spelled out here. */
  it.each<[string, string, string]>([
    ["1.0", '{"a":1.0}', '{"a":1}'],
    ["1.50", '{"a":1.50}', '{"a":1.5}'],
    ["1e2", '{"a":1e2}', '{"a":100}'],
    ["1E2", '{"a":1E2}', '{"a":100}'],
    ["1e+2", '{"a":1e+2}', '{"a":100}'],
    ["1000e-3", '{"a":1000e-3}', '{"a":1}'],
    ["5e-1", '{"a":5e-1}', '{"a":0.5}'],
    ["-0", '{"a":-0}', '{"a":0}'],
    ["0.0", '{"a":0.0}', '{"a":0}'],
    ["-1.0", '{"a":-1.0}', '{"a":-1}'],
    ["1e-7", '{"a":0.0000001}', '{"a":1e-7}'],
    ["1e21", '{"a":1000000000000000000000}', '{"a":1e+21}'],
    ["more digits than a double holds", `{"a":${"1".repeat(21)}}`, '{"a":111111111111111110000}'],
    ["a long form of 0.1", '{"a":0.1000000000000000055511151231257827}', '{"a":0.1}'],
    ["the double nearest 0.3 is not 0.1+0.2", `{"a":${0.1 + 0.2},"b":0.3}`, '{"a":0.30000000000000004,"b":0.3}'],
    ["space between tokens", '{ "a" : 1 , "b" : 2 }', '{"a":1,"b":2}'],
    ["an escaped letter", '{"a":"\\u0061"}', '{"a":"a"}'],
    ["an escaped letter in a key", '{"\\u0061":1}', '{"a":1}'],
    ["an escaped \u00e6, written raw", '{"a":"\\u00e6"}', '{"a":"\u00e6"}'],
    ["an escaped slash", '{"a":"b\\/c"}', '{"a":"b/c"}'],
    ["a quote stays escaped", '{"a":"b\\"c"}', '{"a":"b\\"c"}'],
  ])("%s", (_name, written, canonical) => {
    const inTable = (text: string) => ({ ...BARE, tables: { t: JSON.parse(text) } });
    const whole = `{"fields":[],"parts":{},"schemaVersion":1,"steps":[],"tables":{"t":${canonical}}}`;
    expect(stableJson(inTable(written))).toBe(whole);
    expect(hashOf(inTable(written))).toBe(createHash("sha256").update(whole, "utf8").digest("hex"));
  });

  it.each<[string, unknown, unknown]>([
    ["1 and 1.5", 1, 1.5],
    ["1 and '1'", 1, "1"],
    ["true and 'true'", true, "true"],
    ["0 and false", 0, false],
    ["1 and the next double up", 1, 1 + Number.EPSILON],
    ["'a' and 'A'", "a", "A"],
    ["'a' and 'a '", "a", "a "],
    ["composed and decomposed", "ǽ", "ǽ"],
  ])("tells %s apart", (_name, one, other) => {
    expect(hashOf({ ...BARE, tables: { t: { a: one } } })).not.toBe(hashOf({ ...BARE, tables: { t: { a: other } } }));
  });

  it("keeps an array's order: it is the order of the rule", () => {
    const reversed = (at: string) => withAt(FULL, at, [...(getAt(FULL, at) as unknown[])].reverse());
    for (const at of ["fields", "steps", "fields[1].options", "steps[0].steps", "steps[0].steps[0].items", "discounts[0].steps", "steps[0].steps[0].items[0].tags"]) {
      expect(hashOf(reversed(at))).not.toBe(hashOf(FULL));
    }
  });

  describe("presentation is outside", () => {
    it.each<[string, unknown]>([
      ["presentation.summary", "other"],
      ["presentation.raw", { other: 1 }],
      ["presentation.display", { other: "1" }],
      ["presentation.groupLabels", {}],
      ["presentation.stateParam", "other"],
      ["presentation.urlAttributes", {}],
    ])("%s moves nothing", (at, value) => {
      expect(hashOf(withAt(FULL, at, value))).toBe(hashOf(FULL));
    });
    it("and so does having none, or an empty one", () => {
      expect(hashOf(without(FULL, "presentation"))).toBe(hashOf(FULL));
      expect(hashOf(withAt(FULL, "presentation", {}))).toBe(hashOf(FULL));
      expect(ruleHash({ ...FULL, presentation: undefined })).toBe(ruleHash(FULL));
      expect(hashOf(BARE)).toBe(hashOf({ ...BARE, presentation: { summary: "x" } }));
    });
    it("only at the root: a key of that name anywhere else is part of the rule", () => {
      const named = (presentation: unknown) => ({ ...BARE, constants: { presentation }, tables: { presentation: { presentation } }, facts: { presentation: `${String(presentation)}` }, parts: { presentation: { sku: String(presentation) } } });
      expect(hashOf(named(1))).not.toBe(hashOf(named(2)));
      expect(hashOf({ ...BARE, constants: { presentation: 1 } })).not.toBe(hashOf({ ...BARE, constants: { presentation: 2 } }));
      expect(hashOf({ ...BARE, tables: { presentation: { a: 1 } } })).not.toBe(hashOf({ ...BARE, tables: { presentation: { a: 2 } } }));
      expect(hashOf({ ...BARE, constants: { presentation: 1 } })).not.toBe(hashOf(BARE));
    });
  });

  /** Everything else is the rule, a field's, an option's and a discount's label among it: the spec says so. */
  it.each<[string, unknown]>([
    ["parts.shelf", { sku: "OTHER" }],
    ["constants.bayM", 0.9],
    ["tables.heightCm.low", 121],
    ["fields[0].label", "Other"],
    ["fields[0].help", "Other"],
    ["fields[1].label", { en: "Other" }],
    ["fields[1].options[0].label", "Other"],
    ["fields[1].options[0].image", "https://shop.example.test/other.png"],
    ["groups[0].label", "Other"],
    ["groups[0].max", 9],
    ["derive[0].expr", "1"],
    ["steps[0].when", "true"],
    ["steps[0].steps[0].items[0].label", "Other"],
    ["steps[2].steps[0].message", "Other"],
    ["discounts[0].label", "Other"],
    ["discounts[0].steps[0].bps", 501],
    ["facts.bays", "1"],
    ["lineOrder", []],
    ["quote.validDays", 31],
  ])("%s moves it", (at, value) => {
    expect(hashOf(withAt(FULL, at, value))).not.toBe(hashOf(FULL));
  });
  it.each(["constants", "tables", "groups", "derive", "discounts", "facts", "lineOrder", "quote"])("having no %s moves it", (at) => {
    expect(hashOf(without(FULL, at))).not.toBe(hashOf(FULL));
  });

  it("drops a member that is undefined, so an unset field hashes as the row it will be stored as", () => {
    expect(ruleHash({ ...SMALL, constants: undefined })).toBe(ruleHash(SMALL));
    expect(stableJson({ a: undefined, b: { c: undefined }, d: null })).toBe('{"b":{},"d":null}');
    expect(stableJson([1, "a", null, true, [], {}])).toBe('[1,"a",null,true,[],{}]');
    expect(hashOf({ ...BARE, constants: undefined })).toBe(hashOf(BARE));
    expect(hashOf({ ...BARE, constants: { a: undefined } })).toBe(hashOf({ ...BARE, constants: {} }));
  });

  it("parsing what parsing gave changes nothing", () => {
    const once = good(parseDefinition(FULL));
    expect(hashOf(once)).toBe(hashOf(FULL));
    expect(good(parseDefinition(once))).toStrictEqual(once);
  });
});

describe("stableJson moved out of lib/woo, and its fingerprints did not", () => {
  const CATEGORY = { externalId: "12", slug: "shelves", name: "Shelves", permalink: "/shelves/", parentExternalId: null, description: null };
  const PRODUCT = {
    externalId: "34", slug: "oak-shelf", name: "Oak shelf æøå 😀", permalink: "/shelves/oak-shelf/", sku: "SH-1", priceDkk: 12345,
    categoryExternalId: "12", extraCategoryExternalIds: ["7", "9"], description: 'Line "one"\nLine two', answerSummary: null,
    attributes: { zeta: ["z"], alpha: ["a", "b"], "10": ["ten"], "9": ["nine"] },
  };
  /** Measured on the commit before the move, by the same call, so these are the values a shop's ledger holds. */
  it.each<[string, () => string, string]>([
    ["a category's core", () => groupFp("category", "core", CATEGORY), "ac9a5e767b05dd3390d9fd9f55281000"],
    ["a product's core", () => groupFp("product", "core", PRODUCT), "8363cbfa6814878e77943cd31e051617"],
    ["a product's price", () => groupFp("product", "price", PRODUCT), "c03ed20de405805ec6f98e3fdb2a1aab"],
    ["a product with no price", () => groupFp("product", "price", { ...PRODUCT, priceDkk: null }), "60ce385670174521c0b0540c9bc5c218"],
    ["a group a kind does not have", () => groupFp("category", "price", CATEGORY), "937c7fc74ffa49020ec90d90f23683ff"],
  ])("%s", (_name, fp, want) => {
    expect(fp()).toBe(want);
  });

  it("there is one of it", () => {
    const groups = readFileSync(path.resolve(__dirname, "../../lib/woo/groups.ts"), "utf8");
    expect(groups).not.toMatch(/function stableJson/);
    expect(groups).toMatch(/import \{ stableJson \} from "@\/lib\/configurator\/hash"/);
  });
});

describe("the ledger", () => {
  const row = (patch: unknown[], over: Partial<LedgerRow> = {}): LedgerRow =>
    ({ id: "D1", patch, why: "a reason", decision: "B1", signedBy: "owner", signedAt: "2026-10-31", ...over }) as LedgerRow;
  const applied = (...ops: unknown[]) => good(applyLedger(FULL, [row(ops)]));
  const stopped = (ops: unknown[]) => faults(applyLedger(FULL, [row(ops)]));

  describe("RFC 6902, on the proof", () => {
    it.each<[string, unknown, (d: Definition) => unknown, unknown]>([
      ["replaces a member", { op: "replace", path: "/discounts/0/base", value: "all" }, (d) => d.discounts?.[0].base, "all"],
      ["adds a member", { op: "add", path: "/constants/extra", value: 5 }, (d) => d.constants?.extra, 5],
      ["add on a member that exists replaces it", { op: "add", path: "/constants/bayM", value: 1 }, (d) => d.constants?.bayM, 1],
      ["removes a member", { op: "remove", path: "/constants/glued" }, (d) => Object.hasOwn(d.constants ?? {}, "glued"), false],
      ["removes a whole section", { op: "remove", path: "/discounts" }, (d) => Object.hasOwn(d, "discounts"), false],
      ["adds a whole section", { op: "add", path: "/quote", value: { validDays: 9 } }, (d) => d.quote, { validDays: 9 }],
      ["replaces an element", { op: "replace", path: "/lineOrder/0", value: "x" }, (d) => d.lineOrder, ["x"]],
      ["inserts before an element", { op: "add", path: "/lineOrder/0", value: "x" }, (d) => d.lineOrder, ["x", "wood"]],
      ["inserts at the end by index", { op: "add", path: "/lineOrder/1", value: "x" }, (d) => d.lineOrder, ["wood", "x"]],
      ["appends by -", { op: "add", path: "/lineOrder/-", value: "x" }, (d) => d.lineOrder, ["wood", "x"]],
      ["removes an element", { op: "remove", path: "/discounts/0/steps/0" }, (d) => d.discounts?.[0].steps, [{ min: 6, bps: 1000 }]],
      ["walks objects and lists alike", { op: "replace", path: "/steps/0/steps/0/items/1/qty", value: "2" }, (d) => JSON.stringify(d.steps).includes('"qty":"2"'), true],
      ["reads ~1 as /", { op: "add", path: "/tables/heightCm/a~1b", value: 1 }, (d) => d.tables?.heightCm["a/b"], 1],
      ["reads ~0 as ~", { op: "add", path: "/tables/heightCm/a~0b", value: 1 }, (d) => d.tables?.heightCm["a~b"], 1],
      ["reads ~01 as ~1, not /", { op: "add", path: "/tables/heightCm/~01", value: 1 }, (d) => d.tables?.heightCm["~1"], 1],
      ["reads every ~1 and ~0 in a segment", { op: "add", path: "/tables/heightCm/a~1b~1c~0d~0e", value: 1 }, (d) => d.tables?.heightCm["a/b/c~d~e"], 1],
      ["a key that looks like an index is a key in an object", { op: "replace", path: "/tables/shelves/120", value: 9 }, (d) => d.tables?.shelves["120"], 9],
      ["a key that looks odd is a key", { op: "replace", path: "/tables/shelves/200:oak", value: 9 }, (d) => d.tables?.shelves["200:oak"], 9],
      ["an empty segment is the key \"\"", { op: "add", path: "/tables/heightCm/", value: 1 }, (d) => d.tables?.heightCm[""], 1],
      ["a value may be null where the contract says so", { op: "replace", path: "/parts/upright/variant", value: null }, (d) => (d.parts.upright as { variant: unknown }).variant, null],
      ["a whole list", { op: "replace", path: "/lineOrder", value: ["a", "b"] }, (d) => d.lineOrder, ["a", "b"]],
      ["a list added to a list is one element", { op: "add", path: "/presentation/raw/ui/hide/0", value: [7, 8] }, (d) => (d.presentation?.raw?.ui as { hide: unknown[] }).hide[0], [7, 8]],
      ["a list put in a list's place is one element", { op: "replace", path: "/presentation/raw/ui/hide/0", value: [7, 8] }, (d) => (d.presentation?.raw?.ui as { hide: unknown[] }).hide, [[7, 8], null, { deep: true }]],
      ["presentation may be patched", { op: "replace", path: "/presentation/summary", value: "x" }, (d) => d.presentation?.summary, "x"],
    ])("%s", (_name, op, read, want) => {
      expect(read(applied(op))).toEqual(want);
    });
  });

  it("reads an index of any length", () => {
    const long = withAt(FULL, "lineOrder", Array.from({ length: 101 }, (_, i) => `g${i}`));
    expect(good(applyLedger(long, [row([{ op: "replace", path: "/lineOrder/100", value: "last" }])])).lineOrder?.[100]).toBe("last");
    expect(good(applyLedger(long, [row([{ op: "remove", path: "/lineOrder/10" }])])).lineOrder?.[10]).toBe("g11");
  });

  describe("a place that is not there stops the book, with the path to the row", () => {
    const AT = "ledger[0].patch[0].path";
    it.each<[string, unknown]>([
      ["replacing a member that is not there", { op: "replace", path: "/constants/nope", value: 1 }],
      ["removing a member that is not there", { op: "remove", path: "/constants/nope" }],
      ["an inherited member is not there", { op: "replace", path: "/constants/toString", value: 1 }],
      ["an inherited member is not there to remove", { op: "remove", path: "/constants/valueOf" }],
      ["below an inherited member", { op: "add", path: "/constants/toString/a", value: 1 }],
      ["replacing past the end", { op: "replace", path: "/lineOrder/1", value: "x" }],
      ["removing past the end", { op: "remove", path: "/lineOrder/1" }],
      ["adding past the end", { op: "add", path: "/lineOrder/2", value: "x" }],
      ["replace does not take -", { op: "replace", path: "/lineOrder/-", value: "x" }],
      ["remove does not take -", { op: "remove", path: "/lineOrder/-" }],
      ["an index with a leading zero", { op: "add", path: "/lineOrder/00", value: "x" }],
      ["an index with a leading zero, replacing", { op: "replace", path: "/lineOrder/00", value: "x" }],
      ["a negative index", { op: "add", path: "/lineOrder/-1", value: "x" }],
      ["an index with a fraction", { op: "add", path: "/lineOrder/0.0", value: "x" }],
      ["an index with an exponent", { op: "add", path: "/lineOrder/1e0", value: "x" }],
      ["a word as an index", { op: "add", path: "/lineOrder/first", value: "x" }],
      ["an array's own length is no member", { op: "replace", path: "/lineOrder/length", value: 0 }],
      ["below a member that is not there", { op: "add", path: "/nope/a", value: 1 }],
      ["below a scalar", { op: "add", path: "/constants/bayM/a", value: 1 }],
      ["below a string", { op: "add", path: "/constants/finish/0", value: 1 }],
      ["below an index past the end", { op: "add", path: "/lineOrder/5/a", value: 1 }],
      ["below an index with a leading zero", { op: "replace", path: "/steps/00/when", value: "true" }],
      ["below -", { op: "replace", path: "/steps/-/when", value: "true" }],
      ["below null", { op: "add", path: "/parts/upright-none/variant/a", value: 1 }],
    ])("%s", (_name, op) => {
      expect(stopped([op])).toEqual([[AT, "patch_target_missing"]]);
    });
    it("names the row and the operation, and goes no further", () => {
      const fine = { op: "replace", path: "/constants/bayM", value: 1 };
      const bad = { op: "remove", path: "/constants/nope" };
      expect(faults(applyLedger(FULL, [row([fine, bad])]))).toEqual([["ledger[0].patch[1].path", "patch_target_missing"]]);
      expect(faults(applyLedger(FULL, [row([fine]), row([fine, fine, bad, bad], { id: "D2" })]))).toEqual([["ledger[1].patch[2].path", "patch_target_missing"]]);
    });
    it("says which place", () => {
      const out = applyLedger(FULL, [row([{ op: "remove", path: "/constants/nope" }])]);
      if (!out.ok) expect(out.errors[0].message).toContain("/constants/nope");
      const list = applyLedger(FULL, [row([{ op: "remove", path: "/lineOrder/4" }])]);
      if (!list.ok) expect(list.errors[0].message).toContain("/lineOrder/4");
      const parent = applyLedger(FULL, [row([{ op: "remove", path: "/nope/a" }])]);
      if (!parent.ok) expect(parent.errors[0].message).toContain("/nope/a");
      expect([out.ok, list.ok, parent.ok]).toEqual([false, false, false]);
    });
  });

  describe("in array order", () => {
    const one = row([{ op: "replace", path: "/constants/bayM", value: 1 }], { id: "D1" });
    const two = row([{ op: "replace", path: "/constants/bayM", value: 2 }], { id: "D2" });
    it("the last row to write a place wins", () => {
      expect(good(applyLedger(FULL, [one, two])).constants?.bayM).toBe(2);
      expect(good(applyLedger(FULL, [two, one])).constants?.bayM).toBe(1);
    });
    it("a row may build on the row before it, and not on the row after it", () => {
      const add = row([{ op: "add", path: "/parts/new", value: { sku: "N" } }], { id: "D1" });
      const edit = row([{ op: "replace", path: "/parts/new/sku", value: "M" }], { id: "D2" });
      expect(good(applyLedger(FULL, [add, edit])).parts.new).toEqual({ sku: "M" });
      expect(faults(applyLedger(FULL, [edit, add]))).toEqual([["ledger[0].patch[0].path", "patch_target_missing"]]);
    });
    it("operations in a row run in their order too", () => {
      expect(applied({ op: "add", path: "/lineOrder/0", value: "a" }, { op: "add", path: "/lineOrder/0", value: "b" }).lineOrder).toEqual(["b", "a", "wood"]);
      expect(applied({ op: "add", path: "/lineOrder/-", value: "a" }, { op: "remove", path: "/lineOrder/0" }).lineOrder).toEqual(["a"]);
      expect(stopped([{ op: "remove", path: "/lineOrder/0" }, { op: "remove", path: "/lineOrder/0" }])).toEqual([["ledger[0].patch[1].path", "patch_target_missing"]]);
    });
    it("what a row removed is gone for the next one", () => {
      const gone = { op: "remove", path: "/constants/glued" };
      expect(stopped([gone, gone])).toEqual([["ledger[0].patch[1].path", "patch_target_missing"]]);
      expect(stopped([gone, { op: "replace", path: "/constants/glued", value: true }])).toEqual([["ledger[0].patch[1].path", "patch_target_missing"]]);
      expect(applied(gone, { op: "add", path: "/constants/glued", value: true }).constants?.glued).toBe(true);
    });
    it("a row's hash follows the order, so the book is part of what is signed", () => {
      const first = applyLedger(FULL, [one, two]);
      const second = applyLedger(FULL, [two, one]);
      expect(first.ok && second.ok && first.ruleHash !== second.ruleHash).toBe(true);
    });
  });

  describe("what a published row must equal", () => {
    const ledger = [
      row([{ op: "replace", path: "/discounts/0/base", value: "shelf" }], { id: "D1" }),
      row([{ op: "replace", path: "/steps/0/steps/0/items/1/qty", value: "ceil(row.bays+1)" }, { op: "add", path: "/fields/1/required", value: true }], { id: "D2" }),
    ];
    it("the same rule written by hand, in another order, hashes equal", () => {
      const hand = copy(FULL) as unknown as Doc;
      (getAt(hand, "discounts[0]") as Doc).base = "shelf";
      (getAt(hand, "steps[0].steps[0].items[1]") as Doc).qty = "ceil(row.bays+1)";
      (getAt(hand, "fields[1]") as Doc).required = true;
      const reordered = Object.fromEntries(Object.entries(hand).reverse());
      const out = applyLedger(FULL, ledger);
      expect(out.ok && out.ruleHash).toBe(hashOf(reordered));
    });
    it("and a rule changed in any other way does not", () => {
      const out = applyLedger(FULL, ledger);
      const hand = withAt(withAt(FULL, "discounts[0].base", "shelf"), "steps[0].steps[0].items[1].qty", "ceil(row.bays+1)");
      expect(out.ok && out.ruleHash).not.toBe(hashOf(hand));
    });
    it("an empty book is the proof", () => {
      const out = applyLedger(FULL, []);
      expect(out).toEqual(parseDefinition(FULL));
    });
    it("a row alone can be applied, and the book's sum differs from each", () => {
      const hashes = [ledger[0], ledger[1]].map((r) => applyLedger(FULL, [r])).map((o) => (o.ok ? o.ruleHash : "refused"));
      const whole = applyLedger(FULL, ledger);
      expect(new Set([...hashes, whole.ok ? whole.ruleHash : "refused", hashOf(FULL)]).size).toBe(4);
      expect(hashes).not.toContain("refused");
    });
    it("a row that touches only the presentation does not move the hash, and does move the text", () => {
      const out = applyLedger(FULL, [row([{ op: "replace", path: "/presentation/summary", value: "x" }])]);
      expect(out.ok && out.ruleHash).toBe(hashOf(FULL));
      expect(out.ok && out.definition.presentation?.summary).toBe("x");
    });
    it("hands back a definition with its hash", () => {
      const out = applyLedger(FULL, ledger);
      expect(out.ok && out.ruleHash).toBe(out.ok && ruleHash(out.definition));
      expect(out.ok && out.warnings).toEqual([]);
    });
    it("a dropped row changes what must be equal, so an empty book cannot publish a changed rule", () => {
      const changed = withAt(FULL, "discounts[0].base", "shelf");
      const empty = applyLedger(FULL, []);
      const signed = applyLedger(FULL, [ledger[0]]);
      expect(empty.ok && empty.ruleHash).not.toBe(hashOf(changed));
      expect(signed.ok && signed.ruleHash).toBe(hashOf(changed));
    });
  });

  describe("the outcome is parsed whole", () => {
    it.each<[string, unknown, string, string]>([
      ["a version the contract does not know", { op: "replace", path: "/schemaVersion", value: 2 }, "schemaVersion", "invalid_value"],
      ["a section that is required", { op: "remove", path: "/parts" }, "parts", "invalid_type"],
      ["an unknown key", { op: "add", path: "/fields/0/zzz", value: 1 }, "fields[0].zzz", "unknown_key"],
      ["an expression that does not parse", { op: "replace", path: "/steps/0/when", value: "1 +" }, "steps[0].when", "syntax"],
      ["a template that does not parse", { op: "replace", path: "/presentation/summary", value: "{" }, "presentation.summary", "syntax"],
      ["a second discount", { op: "add", path: "/discounts/-", value: { key: "b", metric: "1", base: "all", steps: [{ min: 0, bps: 1 }] } }, "discounts", "too_big"],
      ["a public text field", { op: "replace", path: "/fields/3/scope", value: "public" }, "fields[3].scope", "invalid_value"],
    ])("%s is refused at its place in the outcome", (_name, op, at, code) => {
      expect(stopped([op])).toEqual([[at, code]]);
    });
    it("but only the outcome: one row may break what the next one mends", () => {
      const out = applyLedger(FULL, [row([{ op: "remove", path: "/parts" }], { id: "D1" }), row([{ op: "add", path: "/parts", value: {} }], { id: "D2" })]);
      expect(out.ok && out.definition.parts).toEqual({});
    });
    it("a forbidden key inside a value stops at the book, before anything is applied", () => {
      const op = JSON.parse('{"op":"add","path":"/presentation/raw/a","value":{"b":{"__proto__":1}}}');
      expect(stopped([op])).toEqual([["ledger[0].patch[0].value.b.__proto__", "forbidden_key"]]);
    });
    it("what a value holds that the schema would drop is refused, not dropped", () => {
      expect(stopped([{ op: "add", path: "/parts/a", value: { sku: "s", zzz: 1 } }])).toEqual([["parts.a.zzz", "unknown_key"]]);
    });
  });

  describe("the book itself is checked", () => {
    const AT = "ledger[0].patch[0].path";
    it.each(["", "a", "a/b", "/a~", "/a~2b", "/~", "/a/~3"])("%j is no pointer below the root", (pointer) => {
      expect(stopped([{ op: "remove", path: pointer }])).toEqual([[AT, "invalid_pointer"]]);
    });
    /** About as long as a book's limit lets a pointer be, in the shapes that load the regex's stack the most. Ten times this ran the stack out. */
    const ROOM = 999_900;
    it.each<[string, string, string]>([
      ["one segment", `/${"a".repeat(ROOM)}`, "patch_target_missing"],
      ["many segments", "/a".repeat(ROOM / 2), "patch_target_missing"],
      ["only slashes", "/".repeat(ROOM), "patch_target_missing"],
      ["only escapes", `/${"~1".repeat(ROOM / 2)}`, "patch_target_missing"],
      ["wrong at the very end", `${"/a".repeat(ROOM / 2)}~`, "invalid_pointer"],
    ])("a pointer of %s near the limit gets the answer a short one gets", (_name, pointer, code) => {
      expect(stopped([{ op: "remove", path: pointer }])).toEqual([[AT, code]]);
    });
    it("a pointer over the limit is a fault at its place, where the regex's stack ran out and lost the path", () => {
      expect(stopped([{ op: "remove", path: `/${"a".repeat(1e7)}` }])).toEqual([[AT, "too_large"]]);
    });
    it("nothing is polluted by trying, before anything below could try", () => {
      try {
        stopped([{ op: "add", path: "/__proto__/polluted", value: 1 }]);
        expect(({} as Doc).polluted).toBeUndefined();
      } finally {
        delete (Object.prototype as unknown as Doc).polluted;
      }
    });
    it.each(["/__proto__", "/__proto__/a", "/constants/__proto__", "/constants/__proto__/a", "/constructor", "/constants/constructor", "/constants/constructor/prototype", "/prototype", "/a/prototype"])("%s can never be written", (pointer) => {
      expect(stopped([{ op: "add", path: pointer, value: 1 }])).toEqual([[AT, "forbidden_name"]]);
    });
    it.each(["test", "move", "copy", "merge", ""])("%j is no operation", (op) => {
      expect(stopped([{ op, path: "/constants/bayM", value: 1, from: "/a" }])).toEqual([["ledger[0].patch[0].op", "invalid_union"]]);
    });
    it("an operation holds what its kind needs and no more", () => {
      expect(stopped([{ op: "add", path: "/constants/a" }])).toEqual([["ledger[0].patch[0].value", "invalid_type"]]);
      expect(stopped([{ op: "replace", path: "/constants/bayM" }])).toEqual([["ledger[0].patch[0].value", "invalid_type"]]);
      expect(stopped([{ op: "remove", path: "/constants/bayM", value: 1 }])).toEqual([["ledger[0].patch[0].value", "unknown_key"]]);
      expect(stopped([{ op: "add", path: "/constants/a", value: 1, zzz: 1 }])).toEqual([["ledger[0].patch[0].zzz", "unknown_key"]]);
      expect(stopped([{ op: "add", value: 1 }])).toEqual([[AT, "invalid_type"]]);
      expect(stopped([{ op: "remove" }])).toEqual([[AT, "invalid_type"]]);
      expect(stopped([{ op: "remove", path: 1 }])).toEqual([[AT, "invalid_type"]]);
      expect(stopped([1])).toEqual([["ledger[0].patch[0]", "invalid_type"]]);
    });
    it("says what is wrong with a pointer", () => {
      const messageOf = (pointer: string) => {
        const out = applyLedger(FULL, [row([{ op: "remove", path: pointer }])]);
        return out.ok ? "applied" : out.errors[0].message;
      };
      expect(messageOf("x")).toBe("x is not a JSON Pointer below the root");
      expect(messageOf("/__proto__")).toBe("/__proto__ can never be written");
    });
    it("a value may be a falsy one", () => {
      expect(applied({ op: "add", path: "/constants/a", value: 0 }).constants?.a).toBe(0);
      expect(applied({ op: "add", path: "/constants/a", value: false }).constants?.a).toBe(false);
      expect(applied({ op: "add", path: "/constants/a", value: "" }).constants?.a).toBe("");
    });
    it("a row changes something", () => {
      expect(faults(applyLedger(FULL, [row([])]))).toEqual([["ledger[0].patch", "too_small"]]);
    });
    it.each(["patch", "why", "decision", "signedBy", "signedAt", "id"])("a row has its %s", (key) => {
      const bare = row([{ op: "remove", path: "/constants/glued" }]) as unknown as Doc;
      delete bare[key];
      expect(faults(applyLedger(FULL, [bare]))).toEqual([[`ledger[0].${key}`, "invalid_type"]]);
    });
    it.each(["patch", "why", "decision", "signedBy", "signedAt", "id"])("a row's %s has its type", (key) => {
      const bad = { ...row([{ op: "remove", path: "/constants/glued" }]), [key]: 1 };
      expect(faults(applyLedger(FULL, [bad]))).toEqual([[`ledger[0].${key}`, "invalid_type"]]);
    });
    it("a row has a reason, and no key of its own", () => {
      expect(faults(applyLedger(FULL, [row([{ op: "remove", path: "/constants/glued" }], { why: "" })]))).toEqual([["ledger[0].why", "too_small"]]);
      expect(faults(applyLedger(FULL, [{ ...row([{ op: "remove", path: "/constants/glued" }]), zzz: 1 }]))).toEqual([["ledger[0].zzz", "unknown_key"]]);
    });
    it.each(["", "_all", "__proto__", "-a", "a b", "a.b", "a/b", "a\n"])("%j is no row's id", (id) => {
      expect(faults(applyLedger(FULL, [row([{ op: "remove", path: "/constants/glued" }], { id })]))).toEqual([["ledger[0].id", "invalid_format"]]);
    });
    it.each(["D2", "d", "2", "B91-1", "a_b"])("%s is a row's id", (id) => {
      expect(applyLedger(FULL, [row([{ op: "remove", path: "/constants/glued" }], { id })]).ok).toBe(true);
    });
    it("two rows cannot share an id: the harness keys its numbers on it", () => {
      const op = { op: "replace", path: "/constants/bayM", value: 1 };
      expect(faults(applyLedger(FULL, [row([op], { id: "D1" }), row([op], { id: "D2" }), row([op], { id: "D1" })]))).toEqual([["ledger[2].id", "duplicate_id"]]);
      const out = applyLedger(FULL, [row([op]), row([op])]);
      if (!out.ok) expect(out.errors[0].message).toBe("D1 is there twice");
      expect(out.ok).toBe(false);
    });
    it.each<[string, unknown, string, string]>([
      ["null", null, "ledger", "invalid_type"],
      ["an object", {}, "ledger", "invalid_type"],
      ["a string", "x", "ledger", "invalid_type"],
      ["a number", 1, "ledger", "invalid_type"],
      ["undefined", undefined, "ledger", "not_json"],
      ["a row that is no object", [1], "ledger[0]", "invalid_type"],
      ["a function in a value", [row([{ op: "add", path: "/a", value: () => 1 }])], "ledger[0].patch[0].value", "not_json"],
      ["a date in a value", [row([{ op: "add", path: "/a", value: new Date(0) }])], "ledger[0].patch[0].value", "not_json"],
      ["NaN in a value", [row([{ op: "add", path: "/a", value: { b: [NaN] } }])], "ledger[0].patch[0].value.b[0]", "not_json"],
      ["a list with a toJSON", listWith({ toJSON: () => [] }), "ledger.toJSON", "not_json"],
      ["a list with a toJSON in a value", [row([{ op: "add", path: "/a", value: listWith({ toJSON: smuggled }) }])], "ledger[0].patch[0].value.toJSON", "not_json"],
      ["a list of a class", [row(Object.setPrototypeOf([], { toJSON: () => [] }))], "ledger[0].patch", "not_json"],
      ["over the limit on characters", [row([{ op: "remove", path: "/a" }], { why: "x".repeat(MAX_JSON_CHARS) })], "ledger[0].why", "too_large"],
    ])("a book that is %s is refused", (_name, ledger, at, code) => {
      expect(faults(applyLedger(FULL, ledger))).toEqual([[at, code]]);
    });
    it("a proof that holds a list with a toJSON, or too many characters, stops first, named as the proof", () => {
      expect(faults(applyLedger(inRaw(listWith({ toJSON: smuggled })), []))).toEqual([["proof.presentation.raw.a.toJSON", "not_json"]]);
      expect(faults(applyLedger(inRaw("x".repeat(MAX_JSON_CHARS)), []))).toEqual([["proof.presentation.raw.a", "too_large"]]);
    });
    it("the outcome has the limit too, with the path into the outcome", () => {
      const half = "x".repeat(MAX_JSON_CHARS / 2);
      expect(faults(applyLedger(inRaw(half), [row([{ op: "add", path: "/presentation/raw/b", value: half }])]))).toEqual([["presentation.raw.b", "too_large"]]);
    });
    it("a value that is undefined is no value", () => {
      expect(stopped([{ op: "add", path: "/constants/a", value: undefined }])).toEqual([["ledger[0].patch[0].value", "invalid_type"]]);
    });
    it("a proof that is not a definition stops first, named as the proof", () => {
      expect(faults(applyLedger({ ...BARE, zzz: 1 }, []))).toEqual([["proof.zzz", "unknown_key"]]);
      expect(faults(applyLedger(null, []))).toEqual([["proof", "invalid_type"]]);
      expect(faults(applyLedger(undefined, null))).toEqual([["proof", "not_json"]]);
      expect(faults(applyLedger(JSON.parse('{"schemaVersion":1,"parts":{"__proto__":{"sku":"x"}},"fields":[],"steps":[]}'), []))).toEqual([["proof.parts.__proto__", "forbidden_key"]]);
      expect(faults(applyLedger(withAt(FULL, "steps[0].when", "1 +"), [row([{ op: "replace", path: "/steps/0/when", value: "true" }])]))).toEqual([["proof.steps[0].when", "syntax"]]);
    });
    it("what throws comes back as a fault", () => {
      const op = { op: "add", path: "/constants/a", get value(): never { throw new Error("boom"); } };
      expect(applyLedger(FULL, [row([op])])).toEqual({ ok: false, errors: [{ path: "", code: "internal", message: "boom", severity: "error" }] });
    });
  });

  describe("a row not yet signed", () => {
    const op = { op: "replace", path: "/constants/bayM", value: 1 };
    it.each<[string, Partial<LedgerRow>]>([
      ["with no decision", { decision: "" }],
      ["with a blank decision", { decision: "  " }],
      ["with no signature", { signedBy: "" }],
      ["with a blank signature", { signedBy: "  " }],
      ["with neither", { decision: "", signedBy: "", signedAt: "" }],
    ])("%s is applied, so the owner can see what it does, and named, so it cannot pass as signed", (_name, over) => {
      const out = applyLedger(FULL, [row([op], { id: "D1" }), row([op], { id: "D2", ...over })]);
      expect(out.ok && out.definition.constants?.bayM).toBe(1);
      expect(out.ok && out.warnings).toEqual([{ path: "ledger[1]", code: "unsigned_row", message: "D2 has no decision or no signature", severity: "warning" }]);
    });
    it("a signed row names nothing, with or without a date: the gate asks for a decision and a signature", () => {
      const out = applyLedger(FULL, [row([op])]);
      expect(out.ok && out.warnings).toEqual([]);
      const undated = applyLedger(FULL, [row([op], { signedAt: "" })]);
      expect(undated.ok && undated.warnings).toEqual([]);
    });
    it("does not change the hash: the signature is about the row, not about the rule", () => {
      const signed = applyLedger(FULL, [row([op])]);
      const unsigned = applyLedger(FULL, [row([op], { decision: "", signedBy: "", signedAt: "" })]);
      expect(signed.ok && signed.ruleHash).toBe(unsigned.ok && unsigned.ruleHash);
    });
    it("every such row is named, in order", () => {
      const out = applyLedger(FULL, [row([op], { id: "D1", decision: "" }), row([op], { id: "D2" }), row([op], { id: "D3", signedBy: "" })]);
      expect(out.ok && out.warnings.map((w) => w.path)).toEqual(["ledger[0]", "ledger[2]"]);
    });
    it("no warning for a row that failed: only a whole outcome has any", () => {
      expect(stopped([{ op: "remove", path: "/nope" }])).toEqual([["ledger[0].patch[0].path", "patch_target_missing"]]);
    });
  });

  describe("it is pure", () => {
    it("reads a frozen proof and a frozen book", () => {
      const proof = deepFreeze(copy(FULL));
      const ledger = deepFreeze([
        row([{ op: "add", path: "/parts/new", value: { sku: "N" } }], { id: "D1" }),
        row([{ op: "replace", path: "/parts/new/sku", value: "M" }, { op: "remove", path: "/lineOrder/0" }], { id: "D2" }),
      ]);
      const out = applyLedger(proof, ledger);
      expect(out.ok && out.definition.parts.new).toEqual({ sku: "M" });
      expect(proof).toStrictEqual(FULL);
    });
    it("leaves a book it did not freeze alone, even when a later row writes inside an earlier value", () => {
      const ledger = [
        row([{ op: "add", path: "/parts/new", value: { sku: "N" } }], { id: "D1" }),
        row([{ op: "replace", path: "/parts/new/sku", value: "M" }], { id: "D2" }),
      ];
      const before = copy(ledger);
      const proof = copy(FULL);
      const once = applyLedger(proof, ledger);
      const twice = applyLedger(proof, ledger);
      expect(ledger).toEqual(before);
      expect(proof).toStrictEqual(FULL);
      expect(twice).toEqual(once);
    });
    it("reads the proof and the book once: a hidden toJSON never runs, and a getter says one thing", () => {
      let calls = 0, reads = 0;
      const smuggler = () => (calls++, smuggled());
      const hidden = <T extends object>(on: T) => Object.defineProperty(on, "toJSON", { value: smuggler });
      const ledger = hidden([row(hidden([
        { op: "add", path: "/parts/one", value: hidden({ sku: "N" }) },
        { op: "add", path: "/parts/two", get value() { return reads++ === 0 ? { sku: "M" } : smuggled(); } },
      ]))]);
      const out = good(applyLedger(hidden({ ...BARE }), ledger));
      expect(out.parts).toStrictEqual({ one: { sku: "N" }, two: { sku: "M" } });
      expect(calls).toBe(0);
      expect(reads).toBe(1);
    });
    it("the same value used twice is two values", () => {
      const shared = { sku: "N" };
      const out = applyLedger(FULL, [row([{ op: "add", path: "/parts/one", value: shared }, { op: "add", path: "/parts/two", value: shared }, { op: "replace", path: "/parts/two/sku", value: "M" }])]);
      expect(out.ok && out.definition.parts.one).toEqual({ sku: "N" });
      expect(out.ok && out.definition.parts.two).toEqual({ sku: "M" });
      expect(shared).toEqual({ sku: "N" });
    });
    it("what it hands back shares nothing with the book", () => {
      const value = { accent: "oak" };
      const out = applyLedger(FULL, [row([{ op: "replace", path: "/presentation/raw", value }])]);
      if (!out.ok) throw new Error("refused");
      (out.definition.presentation?.raw as Doc).accent = "changed";
      expect(value.accent).toBe("oak");
    });
    it("what it hands back shares nothing with the proof, in lists and in what is passed through", () => {
      const proof = copy(FULL);
      const out = applyLedger(proof, []);
      if (!out.ok) throw new Error("refused");
      (out.definition.presentation?.raw as { ui: Doc }).ui.accent = "changed";
      out.definition.fields.pop();
      expect(proof).toStrictEqual(FULL);
    });
  });

  it("parseDefinition reads a frozen document too, and what it hands back shares nothing with it", () => {
    const frozen = deepFreeze(copy(FULL));
    const out = good(parseDefinition(frozen));
    expect(out).toStrictEqual(FULL);
    (out.presentation?.raw as { ui: Doc }).ui.accent = "changed"; // would throw, were it still the frozen one
    expect(frozen).toStrictEqual(FULL);
  });
});

describe("no input makes it throw", () => {
  const no = () => {
    throw new Error("no");
  };
  const revoked = () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    return proxy;
  };
  it.each<[string, unknown]>([
    ["a revoked Proxy", revoked()],
    ["a Proxy that will not name its prototype", new Proxy({}, { getPrototypeOf: no })],
    ["a Proxy that will not name its keys", new Proxy({}, { ownKeys: no })],
    ["a Proxy that will not hand over a member", new Proxy({ a: 1 }, { get: no })],
    ["a list that will not say how long it is", new Proxy([], { get: (on, key, receiver) => (key === "length" ? no() : Reflect.get(on, key, receiver)) })],
    ["a list that will not name its keys", new Proxy([], { ownKeys: no })],
  ])("%s is a fault at the root, from every door and at any depth", (_name, value) => {
    const internal = { ok: false, errors: [{ path: "", code: "internal", severity: "error" }] };
    expect(parseDefinition(value)).toMatchObject(internal);
    expect(parseDefinition(inRaw(value))).toMatchObject(internal);
    expect(applyLedger(value, [])).toMatchObject(internal);
    expect(applyLedger(BARE, value)).toMatchObject(internal);
  });

  const JUNK: unknown[] = [null, 0, -1, 1.5, "", "x", "1 +", "{", "__proto__", true, false, [], {}, [[]], [null], { a: 1 }, { zzz: { zzz: [] } }, 2 ** 53, 10_001, "row", "constructor"];
  it("1000 documents, each the fixture with junk at a random place", { timeout: 60_000 }, () => {
    const rnd = seeded(31102026);
    const places = objectsIn(FULL).flatMap(([at, o]) => Object.keys(o).map((k) => (at ? `${at}.${k}` : k))).filter((at) => !/[-: ]|\.\d/.test(at));
    const kinds = { refused: 0, parsed: 0 };
    for (let i = 0; i < 1000; i++) {
      let doc: unknown = copy(FULL);
      for (let n = 1 + Math.floor(rnd() * 3); n > 0; n--) {
        const at = places[Math.floor(rnd() * places.length)];
        try {
          doc = rnd() < 0.3 ? without(doc, at) : withAt(doc, at, JUNK[Math.floor(rnd() * JUNK.length)], true);
        } catch {
          // an earlier junk took this path away
        }
      }
      const out = parseDefinition(doc);
      if (out.ok) {
        kinds.parsed++;
        expect(out.ruleHash).toBe(ruleHash(out.definition));
        expect(hashOf(out.definition)).toBe(out.ruleHash);
      } else {
        kinds.refused++;
        expect(out.errors.length).toBeGreaterThan(0);
        for (const e of out.errors) {
          expect(Object.keys(e).sort()).toEqual(["code", "message", "path", "severity"]);
          expect(e.severity).toBe("error");
          expect(typeof e.path).toBe("string");
          expect(e.code).toMatch(/^[a-z_]+$/);
          expect(e.code).not.toBe("internal");
          expect(e.message.length).toBeGreaterThan(0);
        }
      }
    }
    expect(kinds.parsed).toBeGreaterThan(20);
    expect(kinds.refused).toBeGreaterThan(300);
  });

  it("1000 books of junk", { timeout: 60_000 }, () => {
    const rnd = seeded(20261101);
    const places = ["/constants/bayM", "/lineOrder/0", "/lineOrder/-", "/steps/0/when", "/nope", "/fields/0/key", "/parts/shelf/sku", "/", "/quote/validDays", "x", "", "/steps/9/when"];
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
      const op = { op: pick(["add", "replace", "remove", "test"]), path: pick(places), ...(rnd() < 0.8 ? { value: pick(JUNK) } : {}) };
      const ledger = rnd() < 0.1 ? pick(JUNK) : [{ id: `D${i}`, patch: [op], why: "x", decision: "B1", signedBy: "o", signedAt: "t" }];
      const out = applyLedger(FULL, ledger);
      if (out.ok) expect(out.ruleHash).toBe(ruleHash(out.definition));
      else for (const e of out.errors) expect(e.code).not.toBe("internal");
      seen.add(out.ok ? "parsed" : "refused");
    }
    expect([...seen].sort()).toEqual(["parsed", "refused"]);
  });
});

describe("what the contract is built from", () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, `../../lib/configurator/${file}`), "utf8");
  it.each(["types.ts", "hash.ts", "definition.ts"])("%s is free of server-only, eval and Function, so scripts/ and lib/woo can import it", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/server-only/);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(/);
  });
  it("types.ts holds nothing at runtime", () => {
    expect(read("types.ts")).not.toMatch(/^\s*(export\s+)?(import|const|let|function|class)\s/m);
  });
  it("definition.ts looks for a book's duplicate id in one pass: a search per row was quadratic, and no test at the limits can time that apart", () => {
    expect(read("definition.ts")).not.toMatch(/findIndex/);
  });
  it("definition.ts does not store a value by stringifying it: that second read is what a toJSON answers", () => {
    expect(read("definition.ts")).not.toMatch(/JSON\.stringify/);
  });
  it("hash.ts does not pull in the schema, so lib/woo stays free of it", () => {
    expect(read("hash.ts")).not.toMatch(/zod|definition"/);
  });
});
