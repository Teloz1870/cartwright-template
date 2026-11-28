import { z } from "zod";

import { parseExpr, type ExprNode, type ExprResult } from "@/lib/configurator/expr";
import { ruleHash } from "@/lib/configurator/hash";
import type { Definition, DefinitionIssue, Field, LedgerRow, Step } from "@/lib/configurator/types";

/**
 * BOM2-a2 — the one way a definition gets in. Any value goes in; a definition or a list of faults
 * comes out, each with the path to it, and no exported function throws. In order: it must be JSON, it
 * must have the contract's shape with no unknown key, and every expression and template hole must
 * parse. What only the whole document can tell (does this name resolve, does this part exist) joins
 * in a3. Nothing calls this yet.
 */

/** Never a key in a definition. z.record drops `__proto__` without a word, which would change a rule unseen. expr.ts never reads these three. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
/**
 * What a document may hold, so neither the schema's recursion nor a regex can reach a stack limit and nothing after the read runs long.
 * Characters are those of its strings and keys together: the regexes below first ran out of stack at 2.1 million. The largest rule measured is 13.3 KB.
 */
export const MAX_JSON_DEPTH = 64;
export const MAX_JSON_NODES = 100_000;
export const MAX_JSON_CHARS = 1_000_000;

const fault = (path: string, code: string, message: string): DefinitionIssue => ({ path, code, message, severity: "error" });
const child = (path: string, key: PropertyKey) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${String(key)}` : String(key));

/**
 * A definition is JSON, so it can be stored, hashed and copied. What comes back is built from this one read and shares nothing with
 * the caller's, so what was checked is what is stored, whatever a toJSON, a getter or a Proxy would say to a second read. As a row
 * holds it, a member that is `undefined` is absent and `-0` is `0`.
 */
function readJson(root: unknown, at: string): { ok: true; value: unknown } | { ok: false; errors: DefinitionIssue[] } {
  const faults: DefinitionIssue[] = [];
  let nodes = 0, chars = 0;
  const count = (text: string, path: string): void => {
    if (chars <= MAX_JSON_CHARS && (chars += text.length) > MAX_JSON_CHARS) faults.push(fault(path, "too_large", `a document holds at most ${MAX_JSON_CHARS} characters`));
  };
  const walk = (v: unknown, path: string, depth: number): unknown => {
    if (++nodes === MAX_JSON_NODES + 1) faults.push(fault(path, "too_large", `a document holds at most ${MAX_JSON_NODES} values`));
    if (typeof v === "string") count(v, path);
    if (nodes > MAX_JSON_NODES || v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v === 0 ? 0 : v;
    if (typeof v !== "object") return void faults.push(fault(path, "not_json", `not JSON: ${typeof v === "number" ? v : typeof v}`));
    if (depth >= MAX_JSON_DEPTH) return void faults.push(fault(path, "too_deep", `a document nests at most ${MAX_JSON_DEPTH} levels`));
    const list = Array.isArray(v), proto = Object.getPrototypeOf(v);
    if (list ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return void faults.push(fault(path, "not_json", "not JSON: an object of a class"));
    if (list) {
      const stored: unknown[] = [];
      for (let i = 0; i < v.length && nodes <= MAX_JSON_NODES; i++) stored.push(walk(v[i], child(path, i), depth + 1));
      if (nodes <= MAX_JSON_NODES) for (const k of Object.keys(v).slice(v.length)) faults.push(fault(child(path, k), "not_json", "not JSON: a list with a named member"));
      return stored;
    }
    const stored: Record<string, unknown> = {};
    for (const [k, member] of Object.entries(v)) {
      count(k, child(path, k));
      if (FORBIDDEN_KEYS.has(k)) faults.push(fault(child(path, k), "forbidden_key", `${k} can never be a key`));
      else if (member !== undefined) stored[k] = walk(member, child(path, k), depth + 1);
    }
    return stored;
  };
  const value = walk(root, at, 0);
  return faults.length ? { ok: false, errors: faults } : { ok: true, value };
}

function toIssues(issues: readonly z.core.$ZodIssue[], at: string): DefinitionIssue[] {
  return issues.flatMap((i) => {
    const path = i.path.reduce<string>((p, k) => child(p, k), at);
    if (i.code === "unrecognized_keys") return i.keys.map((k) => fault(child(path, k), "unknown_key", `unknown key ${k}`));
    if (i.code === "invalid_key") return toIssues(i.issues as z.core.$ZodIssue[], path);
    return [fault(path, i.code === "custom" ? String(i.params?.code) : i.code, i.message)];
  });
}

export type TemplatePart = string | ExprNode;
/** Text, a hole or a stray brace, which ends the read. A search for holes alone started again at every {, which is quadratic. */
const PIECE = /[^{}]+|\{((?:[^{}']|'(?:[^'\\]|\\.)*')*)\}|[{}]/g;

/** Text with {expr} holes, where a hole's string may hold a brace: {'{'}. A brace anywhere else is an error, never text: as text, a typo in a part's name would be a wrong part. */
export function parseTemplate(src: string): ExprResult<TemplatePart[]> {
  if (typeof src !== "string") return { ok: false, error: { code: "syntax", message: "a template is a string", pos: 0 } };
  if (src.length > MAX_JSON_CHARS) return { ok: false, error: { code: "too_long", message: `a template is at most ${MAX_JSON_CHARS} characters`, pos: MAX_JSON_CHARS } };
  const parts: TemplatePart[] = [];
  for (const piece of src.matchAll(PIECE)) {
    const [text, hole] = piece;
    if (text === "{" || text === "}") return { ok: false, error: { code: "syntax", message: "a brace outside a {hole}", pos: piece.index } };
    const out: ExprResult<TemplatePart> = hole === undefined ? { ok: true, value: text } : parseExpr(hole);
    if (!out.ok) return { ok: false, error: { ...out.error, pos: piece.index + 1 + out.error.pos } };
    parts.push(out.value);
  }
  return { ok: true, value: parts };
}

type Flaw = { code: string; message: string } | undefined;
/** A string held to `flaw` inside the schema, so the fault gets its path from where it stands. */
const checked = (flaw: (s: string) => Flaw) =>
  z.string().check((ctx) => {
    const found = flaw(ctx.value);
    if (found) ctx.issues.push({ code: "custom", input: ctx.value, message: found.message, params: { code: found.code } });
  });
const exprFlaw = (out: ExprResult<unknown>): Flaw => (out.ok ? undefined : { code: out.error.code, message: `${out.error.message} (at ${out.error.pos})` });

const expr = checked((s) => exprFlaw(parseExpr(s)));
const template = checked((s) => exprFlaw(parseTemplate(s)));
/** None could be read as a name: `each` binds the first two, the grammar reads the next three as values. */
const RESERVED: ReadonlySet<string> = new Set(["prev", "index", "true", "false", "null", ...FORBIDDEN_KEYS]);
const name = checked((s) => {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)) return { code: "invalid_name", message: `${s} is not a name: a letter, then letters, digits and _` };
  return RESERVED.has(s) ? { code: "reserved_name", message: `${s} is reserved` } : undefined;
});
/** `each.of`: a group's name or a bound list, read as the language reads a name. */
const listName = checked((s) => {
  const out = parseExpr(s);
  return !out.ok || out.value.kind === "name" ? exprFlaw(out) : { code: "not_a_list", message: `${s} is not the name of a list` };
});
/** A path into the raw input. Its segments are the sender's, so they are only held away from what must never be read. */
const rawPath = checked((s) => {
  const segments = s.split(".");
  if (segments.includes("")) return { code: "invalid_path", message: `${s} has an empty segment` };
  return segments.some((k) => FORBIDDEN_KEYS.has(k)) ? { code: "forbidden_name", message: `${s} can never be read` } : undefined;
});

const filled = z.string().min(1);
const whole = z.number().int().min(0);
const text = z.union([z.string(), z.record(z.string(), z.string())], { error: "a text is a string, or strings by locale" });
const scalar = z.union([z.number(), z.string(), z.boolean()], { error: "a value is a number, a string, true or false" });
const optionValue = z.union([z.string(), z.number()], { error: "a value is a string or a number" });
const overflow = z.enum(["refuse", "truncate"]);
const derived = z.strictObject({ name, expr });
const fieldBase = { key: name, label: text.optional(), help: text.optional(), from: rawPath.optional(), required: z.boolean().optional(), showIf: expr.optional(),
                    scope: z.enum(["public", "operator"]).optional() };
const option = z.strictObject({ value: optionValue, label: text.optional(), default: z.boolean().optional(), image: z.string().optional(), showIf: expr.optional() });
const field: z.ZodType<Field> = z.lazy(() => z.discriminatedUnion("type", [
  z.strictObject({ ...fieldBase, type: z.literal("number"), min: z.number().optional(), max: z.number().optional(), step: z.number().optional(), unit: z.string().optional(),
                   absInt: z.boolean().optional(), default: z.number().optional() }),
  z.strictObject({ ...fieldBase, type: z.literal("select"), options: z.array(option), default: optionValue.optional(), onInvalid: z.enum(["refuse", "default", "skip-item"]).optional(),
                   widget: z.enum(["select", "radio", "swatch"]).optional() }),
  z.strictObject({ ...fieldBase, type: z.literal("checkbox"), default: z.boolean().optional() }),
  z.strictObject({ ...fieldBase, type: z.literal("text"), maxLength: whole, default: z.string().optional(), scope: z.literal("operator") }),
  z.strictObject({ ...fieldBase, type: z.literal("group"), as: name, min: whole.optional(), max: whole, overflow, fields: z.array(field) }),
]));
const group = z.strictObject({ key: name, as: name, from: rawPath.optional(), min: whole.optional(), max: whole, overflow, fields: z.array(field),
                               derive: z.array(derived).optional(), skipWhen: expr.optional(), label: text.optional() });
const line = z.strictObject({
  key: template.min(1), part: template.min(1).optional(), label: template.optional(), group: filled.optional(), tags: z.array(filled).optional(),
  note: template.optional(), qty: expr, when: expr.optional(), fixedOre: expr.optional(), meta: z.record(filled, template).optional(),
});
const step: z.ZodType<Step> = z.lazy(() => z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("lines"), when: expr.optional(), items: z.array(line) }),
  z.strictObject({ op: z.literal("take"), when: expr.optional(), tag: filled, amount: expr, keepAtLeast: whole.optional(), firstOnly: z.boolean().optional() }),
  z.strictObject({ op: z.literal("move"), when: expr.optional(), from: template.min(1), to: template.min(1), qty: expr.optional() }),
  z.strictObject({ op: z.literal("each"), when: expr.optional(), of: listName, steps: z.array(step) }),
  z.strictObject({ op: z.literal("block"), when: expr.optional(), steps: z.array(step) }),
  z.strictObject({ op: z.literal("refuse"), when: expr, code: filled, path: template.optional(), message: text.optional() }),
  z.strictObject({ op: z.literal("warn"), when: expr, code: filled, message: text.optional() }),
]));
const discount = z.strictObject({ key: filled, label: text.optional(), metric: expr, base: filled,
                                  steps: z.array(z.strictObject({ min: z.number(), bps: z.number().int().min(1).max(10_000) })).min(1) });
const partRef = z.union([
  z.strictObject({ source: filled, product: filled, variant: filled.nullable().optional() }),
  z.strictObject({ sku: filled }),
  z.strictObject({ slug: filled, variantSku: filled.optional() }),
], { error: "a part is { source, product, variant? }, { sku } or { slug, variantSku? }" });
const presentation = z.strictObject({
  groupLabels: z.record(z.string(), text).optional(), summary: template.optional(), stateParam: filled.optional(),
  urlAttributes: z.record(z.string(), z.string()).optional(), raw: z.record(z.string(), z.unknown()).optional(), display: z.record(filled, expr).optional(),
});
const definition: z.ZodType<Definition> = z.strictObject({
  schemaVersion: z.literal(1), parts: z.record(filled, partRef), constants: z.record(name, scalar).optional(),
  tables: z.record(filled, z.record(z.string(), scalar)).optional(), fields: z.array(field), groups: z.array(group).optional(),
  derive: z.array(derived).optional(), steps: z.array(step), discounts: z.array(discount).max(1).optional(), facts: z.record(filled, expr).optional(),
  lineOrder: z.array(filled).optional(), quote: z.strictObject({ validDays: z.number().int().min(1) }).optional(), presentation: presentation.optional(),
});

export type ParsedDefinition = { ok: true; definition: Definition; ruleHash: string; warnings: DefinitionIssue[] } | { ok: false; errors: DefinitionIssue[] };

/** A report is no longer than a document may be: a long key on the path over many faults made it thousands of times the document, and stringifying that ran the process out of heap. */
function bounded(out: ParsedDefinition): ParsedDefinition {
  if (out.ok) return out;
  let room = MAX_JSON_CHARS;
  const kept = out.errors.filter((e, i) => (room -= e.path.length + e.message.length) >= 0 || i === 0);
  return kept.length < out.errors.length ? { ok: false, errors: [...kept, fault("", "too_many_faults", `${out.errors.length - kept.length} more faults, not listed`)] } : out;
}

/** What a throw said. The value is the caller's, so reading it can throw as well. */
function said(thrown: unknown): string {
  try { return String(thrown instanceof Error ? thrown.message : thrown); } catch { return "something that cannot be read"; }
}

function guarded(run: () => ParsedDefinition): ParsedDefinition {
  try {
    return bounded(run());
  } catch (e) {
    return { ok: false, errors: [fault("", "internal", said(e))] };
  }
}

function parse(json: unknown, at: string): ParsedDefinition {
  const read = readJson(json, at);
  if (!read.ok) return read;
  const out = definition.safeParse(read.value);
  return out.success ? { ok: true, definition: out.data, ruleHash: ruleHash(out.data), warnings: [] } : { ok: false, errors: toIssues(out.error.issues, at) };
}

/** The only way in, for an importer, a tool, the admin and a read of a stored row alike. */
export function parseDefinition(json: unknown): ParsedDefinition {
  return guarded(() => parse(json, ""));
}

const segments = (pointer: string) => pointer.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
/** RFC 6901, always below the root: a row changes a place in the proof, it does not replace the proof. */
const pointer = checked((s) => {
  if (!/^(\/([^~/]|~[01])*)+$/.test(s)) return { code: "invalid_pointer", message: `${s} is not a JSON Pointer below the root` };
  return segments(s).some((k) => FORBIDDEN_KEYS.has(k)) ? { code: "forbidden_name", message: `${s} can never be written` } : undefined;
});
const ledgerRows: z.ZodType<LedgerRow[]> = z.array(z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][\w-]*$/),
  patch: z.array(z.discriminatedUnion("op", [
    z.strictObject({ op: z.enum(["add", "replace"]), path: pointer, value: z.unknown() }),
    z.strictObject({ op: z.literal("remove"), path: pointer }),
  ])).min(1),
  why: filled, decision: z.string(), signedBy: z.string(), signedAt: z.string(),
})).check((ctx) => {
  const seen = new Set<string>();
  ctx.value.forEach((row, i) => {
    if (seen.has(row.id)) ctx.issues.push({ code: "custom", input: row.id, path: [i, "id"], message: `${row.id} is there twice`, params: { code: "duplicate_id" } });
    seen.add(row.id);
  });
});

const member = (at: unknown, k: string): unknown => (at !== null && typeof at === "object" && Object.hasOwn(at, k) ? (at as Record<string, unknown>)[k] : undefined);

/** One RFC 6902 operation, in place on `doc`, which is this call's own. Returns what stopped it. */
function applyOp(doc: unknown, op: LedgerRow["patch"][number]): string | null {
  const keys = segments(op.path), last = keys[keys.length - 1];
  const parent = keys.slice(0, -1).reduce(member, doc);
  if (Array.isArray(parent)) {
    const at = last === "-" ? parent.length : /^(0|[1-9]\d*)$/.test(last) ? Number(last) : -1;
    if (at < 0 || at > parent.length - (op.op === "add" ? 0 : 1)) return `${op.path} is no index of a list of ${parent.length}`;
    parent.splice(at, op.op === "add" ? 0 : 1, ...(op.op === "remove" ? [] : [op.value]));
    return null;
  }
  if (parent === null || typeof parent !== "object") return `${op.path} has no parent`;
  const target = parent as Record<string, unknown>;
  if (op.op !== "add" && !Object.hasOwn(target, last)) return `${op.path} is not there`;
  if (op.op === "remove") delete target[last];
  else target[last] = op.value;
  return null;
}

/**
 * The proof with the book's rows applied in array order, each row's operations in theirs, and the
 * outcome parsed whole: what a published row must hash equal to. A row without a decision or a
 * signature is applied and named as a warning, because the owner signs after seeing what it does; the
 * publish gate is what refuses it.
 */
export function applyLedger(proof: unknown, ledger: unknown): ParsedDefinition {
  return guarded(() => {
    const base = parse(proof, "proof");
    if (!base.ok) return base;
    const book = readJson(ledger, "ledger");
    if (!book.ok) return book;
    const rows = ledgerRows.safeParse(book.value);
    if (!rows.success) return { ok: false, errors: toIssues(rows.error.issues, "ledger") };
    for (const [i, row] of rows.data.entries()) {
      for (const [j, op] of row.patch.entries()) {
        const stopped = applyOp(base.definition, op);
        if (stopped) return { ok: false, errors: [fault(`ledger[${i}].patch[${j}].path`, "patch_target_missing", stopped)] };
      }
    }
    const out = parse(base.definition, "");
    if (!out.ok) return out;
    const unsigned = rows.data.flatMap((row, i): DefinitionIssue[] => (row.decision.trim() && row.signedBy.trim() ? [] : [
      { path: `ledger[${i}]`, code: "unsigned_row", message: `${row.id} has no decision or no signature`, severity: "warning" },
    ]));
    return { ...out, warnings: [...unsigned, ...out.warnings] };
  });
}
