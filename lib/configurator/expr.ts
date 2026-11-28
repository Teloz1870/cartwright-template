/**
 * BOM2-a1 — the expression language of a configurator definition: how a price rule, stored as data
 * in a shop's own database, does arithmetic on a customer's input. Nothing reads it yet.
 *
 *   or  := and ('||' and)*          and := cmp ('&&' cmp)*
 *   cmp := add (('=='|'!='|'<='|'>='|'<'|'>') add)?          one comparison: they do not chain
 *   add := mul (('+'|'-') mul)*     mul := unary (('*'|'/') unary)*     unary := ('-'|'!') unary | atom
 *   atom := number | 'string' | true | false | null | name('.'name)* | fn '(' args ')' | '(' or ')'
 *
 * Read by this parser and nothing else, so a definition cannot run code: no user functions and no
 * loops, only folds over a list the definition caps. Numbers are IEEE doubles without an exponent,
 * `==` is strict, nothing is coerced: a wrong type, a missing table key or a division by zero is an
 * error, never a quiet default. Pure and without imports, so scripts/ and lib/woo can use it. No
 * exported function throws: an error is a value with a position, for the person who wrote the rule.
 */

/** Node visits per evaluation, shared by all its expressions. A backstop: the rules measured so far used at most 733. */
export const EXPR_BUDGET = 100_000;
/** The parse budget. Length bounds the work and a long `a+b+c` chain, depth the recursion, so no input reaches the stack limit. */
export const MAX_EXPR_LENGTH = 2048;
export const MAX_EXPR_DEPTH = 256;

const ANY = Number.POSITIVE_INFINITY;
/** The closed function list with [fewest, most] arguments. A new function changes the contract. */
const ARITY = {
  ceil: [1, 1], floor: [1, 1], round: [1, 1], roundd: [1, 2], min: [1, ANY], max: [1, ANY], if: [3, 3],
  coalesce: [1, ANY], lookup: [2, ANY], lookupOr: [3, ANY], hasKey: [2, ANY], sum: [2, 2], count: [1, 2],
  any: [2, 2], first: [2, 2], qty: [1, 1], firstQty: [1, 1], priceOf: [1, 1],
} as const satisfies Record<string, readonly [number, number]>;
export type ExprFn = keyof typeof ARITY;
export const EXPR_FUNCTIONS = Object.keys(ARITY) as readonly ExprFn[];
const FOLDS: ReadonlySet<string> = new Set<ExprFn>(["sum", "count", "any", "first"]);
/** The argument that names a table: a string literal, so a definition's tables can be checked before anything sells. */
const tableArg = (fn: ExprFn) => (fn === "lookupOr" ? 1 : fn === "lookup" || fn === "hasKey" ? 0 : -1);
/** Never read, whatever an object holds: a JSON document can own a `__proto__` key. */
const FORBIDDEN: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

export type ExprErrorCode =
  | "syntax" | "too_long" | "too_deep" | "forbidden_name" | "unknown_function" | "arity" | "not_a_list" | "table_not_literal"
  | "unknown_name" | "unknown_table" | "lookup_miss" | "type" | "not_finite" | "not_an_integer" | "part_unavailable" | "budget" | "internal";
export type ExprError = { code: ExprErrorCode; message: string; pos: number };
export type ExprResult<T> = { ok: true; value: T } | { ok: false; error: ExprError };

type NameNode = { kind: "name"; path: string[]; pos: number };
type CallNode = { kind: "call"; fn: ExprFn; args: ExprNode[]; pos: number };
/** `pos` is the offset in the source: of the operator for a binary node, of the first character otherwise. */
export type ExprNode = NameNode | CallNode
  | { kind: "literal"; value: number | string | boolean | null; pos: number }
  | { kind: "unary"; op: "-" | "!"; operand: ExprNode; pos: number }
  | { kind: "binary"; op: string; left: ExprNode; right: ExprNode; pos: number };

class Fail {
  constructor(readonly error: ExprError) {}
}
function fail(code: ExprErrorCode, message: string, pos: number): never {
  throw new Fail({ code, message, pos });
}
function attempt<T>(run: () => T): ExprResult<T> {
  try {
    return { ok: true, value: run() };
  } catch (e) {
    return { ok: false, error: e instanceof Fail ? e.error : { code: "internal", message: e instanceof Error ? e.message : String(e), pos: 0 } };
  }
}

/** The one way anything is read out of an object: own keys only, never a forbidden one, never through an array. */
function own(o: unknown, k: string): unknown {
  if (o === null || typeof o !== "object" || Array.isArray(o) || FORBIDDEN.has(k) || !Object.hasOwn(o, k)) return undefined;
  return (o as Record<string, unknown>)[k];
}

type Tok = { pos: number } & ({ t: "lit"; v: number | string } | { t: "name" | "op"; v: string });
const WORDS: Readonly<Record<string, boolean | null>> = { true: true, false: false, null: null };
const PREC: Readonly<Record<string, number | undefined>> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<=": 3, ">=": 3, "<": 3, ">": 3, "+": 4, "-": 4, "*": 5, "/": 5 };

function tokenize(src: string): Tok[] {
  const token = /(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)|(==|!=|<=|>=|&&|\|\||[-+*/<>!(),])/y;
  const toks: Tok[] = [];
  for (let i = 0; i < src.length; i = token.lastIndex) {
    while (/\s/.test(src.charAt(i))) i++;
    if (i === src.length) break;
    token.lastIndex = i;
    const m = token.exec(src);
    if (!m) fail("syntax", `unexpected ${src.charAt(i)}`, i);
    const [, numeral, text, name, op] = m;
    if (text !== undefined) toks.push({ t: "lit", v: text.replace(/\\(.)/g, "$1"), pos: i });
    else if (op !== undefined) toks.push({ t: "op", v: op, pos: i });
    else if (numeral !== undefined) {
      // A letter here is 1e-9 or 0x10. Read as 1 it would be a silent wrong price.
      if (/[A-Za-z_]/.test(src.charAt(token.lastIndex))) fail("syntax", "a number has no exponent or suffix: write 0.000000001", token.lastIndex);
      if (!Number.isFinite(Number(numeral))) fail("syntax", "this number is too large", i);
      toks.push({ t: "lit", v: Number(numeral), pos: i });
    } else {
      if (name.split(".").some((segment) => FORBIDDEN.has(segment))) fail("forbidden_name", `${name} can never be read`, i);
      toks.push({ t: "name", v: name, pos: i });
    }
  }
  return toks;
}

export function parseExpr(src: string): ExprResult<ExprNode> {
  return attempt(() => {
    if (typeof src !== "string") fail("syntax", "an expression is a string", 0);
    if (src.length > MAX_EXPR_LENGTH) fail("too_long", `an expression is at most ${MAX_EXPR_LENGTH} characters`, MAX_EXPR_LENGTH);
    const toks = tokenize(src);
    let p = 0, depth = 0;
    const here = () => toks[p]?.pos ?? src.length;
    const opAt = () => (toks[p]?.t === "op" ? String(toks[p].v) : "");
    const closeParen = () => (opAt() === ")" ? p++ : fail("syntax", "expected )", here()));

    function binary(min: number): ExprNode {
      let left = unary();
      for (;;) {
        const op = opAt(), prec = PREC[op], pos = here();
        if (prec === undefined || prec <= min) return left;
        p++;
        left = { kind: "binary", op, left, right: binary(prec), pos };
        if (prec === PREC["=="] && PREC[opAt()] === prec) fail("syntax", "comparisons do not chain: use && or parentheses", here());
      }
    }
    function unary(): ExprNode {
      const pos = here(), op = opAt();
      if (++depth > MAX_EXPR_DEPTH) fail("too_deep", `an expression nests at most ${MAX_EXPR_DEPTH} levels`, pos);
      if (op === "-" || op === "!") p++;
      const out: ExprNode = op === "-" || op === "!" ? { kind: "unary", op, operand: unary(), pos } : atom();
      depth--;
      return out;
    }
    function atom(): ExprNode {
      const t = toks[p++];
      if (!t) fail("syntax", "the expression ends too soon", src.length);
      if (t.t === "lit") return { kind: "literal", value: t.v, pos: t.pos };
      if (t.t === "op") {
        if (t.v !== "(") fail("syntax", `unexpected ${t.v}`, t.pos);
        const inner = binary(0);
        closeParen();
        return inner;
      }
      if (opAt() === "(") return call(t.v, t.pos);
      if (Object.hasOwn(WORDS, t.v)) return { kind: "literal", value: WORDS[t.v], pos: t.pos };
      return { kind: "name", path: t.v.split("."), pos: t.pos };
    }
    function call(name: string, pos: number): ExprNode {
      if (!Object.hasOwn(ARITY, name)) fail("unknown_function", `unknown function ${name}`, pos);
      const fn = name as ExprFn, args: ExprNode[] = [];
      p++;
      if (opAt() !== ")") args.push(binary(0));
      while (opAt() === "," && ++p) args.push(binary(0));
      closeParen();
      const [fewest, most] = ARITY[fn];
      if (args.length < fewest || args.length > most) fail("arity", `${fn} cannot take ${args.length} argument(s)`, pos);
      if (FOLDS.has(fn) && args[0].kind !== "name") fail("not_a_list", `${fn} goes over a named list`, args[0].pos);
      const at = tableArg(fn), table = args[at];
      if (at >= 0 && (table.kind !== "literal" || typeof table.value !== "string")) fail("table_not_literal", `${fn} names its table as a 'string'`, table.pos);
      // The strings that name a property to read. A computed one meets own() at evaluation.
      for (const x of at >= 0 || fn === "priceOf" ? args.slice(Math.max(at, 0)) : []) {
        if (x.kind === "literal" && typeof x.value === "string" && FORBIDDEN.has(x.value)) fail("forbidden_name", `${x.value} can never be read`, x.pos);
      }
      return { kind: "call", fn, args, pos };
    }

    const ast = binary(0);
    if (p < toks.length) fail("syntax", "unexpected input after the expression", here());
    return ast;
  });
}

export type StaticList = { as: string; item: StaticScope };
export type StaticShape = "value" | { record: StaticScope } | { list: StaticList };
export type StaticScope = Readonly<Record<string, StaticShape>>;
/** What a definition declares at one place in it. `groups` are readable as lists only, as at evaluation. */
export type StaticEnv = { scope: StaticScope; groups?: Readonly<Record<string, StaticList>>; tables?: Readonly<Record<string, unknown>> };

/** Every unknown name, list and table in a parsed expression, found before the rule meets an input. */
export function checkExpr(ast: ExprNode, env: StaticEnv): ExprError[] {
  const errors: ExprError[] = [];
  const report = (code: ExprErrorCode, message: string, pos: number) => errors.push({ code, message, pos });
  const shapeOf = (path: string[], scope: StaticScope) => {
    let s = own(scope, path[0]) as StaticShape | undefined;
    for (const k of path.slice(1)) s = typeof s === "object" && "record" in s ? (own(s.record, k) as StaticShape | undefined) : undefined;
    return s;
  };
  const walk = (n: ExprNode, scope: StaticScope): void => {
    if (n.kind === "unary") walk(n.operand, scope);
    if (n.kind === "binary") [n.left, n.right].forEach((x) => walk(x, scope));
    if (n.kind === "name" && !shapeOf(n.path, scope)) report("unknown_name", `unknown name ${n.path.join(".")}`, n.pos);
    if (n.kind !== "call") return;
    const table = n.args[tableArg(n.fn)];
    if (table?.kind === "literal" && own(env.tables, String(table.value)) == null) report("unknown_table", `unknown table ${String(table.value)}`, table.pos);
    if (!FOLDS.has(n.fn)) return n.args.forEach((x) => walk(x, scope));
    const name = n.args[0] as NameNode, shape = shapeOf(name.path, scope);
    const list = (own(env.groups, name.path.join(".")) as StaticList | undefined) ?? (typeof shape === "object" && "list" in shape ? shape.list : undefined);
    if (!list) report(shape ? "not_a_list" : "unknown_name", `${name.path.join(".")} is not a list`, name.pos);
    n.args.slice(1).forEach((x) => walk(x, list ? { ...scope, [list.as]: { record: list.item } } : scope));
  };
  const out = attempt(() => walk(ast, env.scope));
  return out.ok ? errors : [...errors, out.error];
}

type Item = Readonly<Record<string, unknown>>;
export type BoundList = { as: string; items: readonly Item[] };
export type ExprEnv = {
  root: Item; // fields, constants, derived values
  scope?: Item; // what a verb has bound (`row`, `prev`, `index`); wins over root
  groups?: Readonly<Record<string, BoundList>>;
  tables?: Readonly<Record<string, Item>>;
  lines?: readonly { qty: number; tags: readonly string[] }[];
  catalog?: Readonly<Record<string, { unitOre: number }>>;
  budget: { left: number }; // spent by this call, left for the next: one evaluation shares one budget
};

const num = (v: unknown, pos: number) => (typeof v === "number" && Number.isFinite(v) ? v : fail("type", "expected a number", pos));
const bool = (v: unknown, pos: number) => (typeof v === "boolean" ? v : fail("type", "expected true or false", pos));
const finite = (v: number, pos: number) => (Number.isFinite(v) ? v : fail("not_finite", "not a finite number: a division by zero or an overflow", pos));
const isList = (v: unknown): v is BoundList => Array.isArray(own(v, "items")) && typeof own(v, "as") === "string";
function spend(env: ExprEnv, amount: number, pos: number) {
  env.budget.left -= amount;
  if (env.budget.left < 0) fail("budget", "the evaluation budget is spent", pos);
}

/** `php_intpow10`. The decimal form is its table up to 1e22, and beyond that the nearest double, which is what libc's pow gave for every power (macOS, measured). */
const pow10 = (p: number) => Number(`1e${p}`);
/** `php_round_helper`, half up. The addition is in binary too: the double just below 0.5 rounds to 1, here as in PHP. */
const halfUp = (v: number) => (v >= 0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5));
const DECADES = Array.from({ length: 31 }, (_, i) => pow10(i - 8));
/** `php_intlog10abs` of a positive number: the exact entry of its table inside that range, floor(log10) outside it, as there. */
const decade = (v: number) => (v < 1e-8 || v > 1e22 ? Math.floor(Math.log10(v)) : DECADES.findLastIndex((power) => power <= v) - 8);
/**
 * As PHP before 8.4 rounds, half up: `_php_math_round` in ext/standard/math.c, the same at PHP-7.4 and PHP-8.3, rewritten at PHP-8.4.
 * It scales in binary on purpose, not through the decimal form: that is where PHP's answers come from. `round` is Math.round on the raw double; real rules need both.
 */
function roundd(value: number, wanted: number): number {
  if (value === 0) return value;
  const places = Math.max(-2147483647, Math.min(2147483647, wanted)); // a C int
  const precision = 14 - decade(Math.abs(value)), f1 = pow10(Math.abs(places));
  let tmp: number;
  if (precision > places && precision - 15 < places) {
    // Pre-round to the 15 digits a double guarantees, then move the point to where the rounding is wanted.
    tmp = halfUp(precision >= 0 ? value * pow10(precision) : value / pow10(-precision)) / pow10(Math.abs(places - precision));
  } else {
    tmp = places >= 0 ? value * f1 : value / f1;
    if (Math.abs(tmp) >= 1e15) return value; // beyond the precision: nothing to round
  }
  tmp = halfUp(tmp);
  if (Math.abs(places) < 23) return places > 0 ? tmp / f1 : tmp * f1;
  // Beyond 1e22 a division adds an error, so PHP prints and parses. What overflows, or what the pre-round took to infinity, keeps its value.
  const out = Number(`${tmp}e${-places}`);
  return Number.isFinite(out) ? out : value;
}

function look(n: NameNode, scope: Item, env: ExprEnv): unknown {
  let v = own(scope, n.path[0]);
  if (v === undefined) v = own(env.root, n.path[0]);
  for (let i = 1; i < n.path.length; i++) v = isList(v) ? undefined : own(v, n.path[i]);
  return v !== undefined ? v : fail("unknown_name", `unknown name ${n.path.join(".")}`, n.pos);
}

const NUMERIC: Readonly<Record<string, (a: number, b: number) => number | boolean>> = {
  "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b,
  "<": (a, b) => a < b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, ">=": (a, b) => a >= b,
};

function ev(n: ExprNode, scope: Item, env: ExprEnv): unknown {
  spend(env, 1, n.pos);
  switch (n.kind) {
    case "literal": return n.value;
    case "name": return look(n, scope, env);
    case "call": return FOLDS.has(n.fn) ? fold(n, scope, env) : call(n, scope, env);
    case "unary": {
      const v = ev(n.operand, scope, env);
      return n.op === "-" ? -num(v, n.operand.pos) : !bool(v, n.operand.pos);
    }
    case "binary": {
      const { op, left, right } = n;
      if (op === "&&") return bool(ev(left, scope, env), left.pos) && bool(ev(right, scope, env), right.pos);
      if (op === "||") return bool(ev(left, scope, env), left.pos) || bool(ev(right, scope, env), right.pos);
      const x = ev(left, scope, env);
      const y = ev(right, scope, env);
      if (op === "==") return x === y;
      if (op === "!=") return x !== y;
      const out = NUMERIC[op](num(x, left.pos), num(y, right.pos));
      return typeof out === "number" ? finite(out, n.pos) : out;
    }
  }
}

function fold(n: CallNode, scope: Item, env: ExprEnv): unknown {
  const name = n.args[0] as NameNode, body = n.args[1];
  const list = own(env.groups, name.path.join(".")) ?? look(name, scope, env);
  if (!isList(list)) fail("not_a_list", `${name.path.join(".")} is not a list`, name.pos);
  const inItem = (item: Item) => ev(body, { ...scope, [list.as]: item }, env);
  const test = (item: Item) => bool(inItem(item), body.pos);
  switch (n.fn) {
    case "sum": return finite(list.items.reduce((total, item) => total + num(inItem(item), body.pos), 0), n.pos);
    case "count": return body ? list.items.filter(test).length : list.items.length;
    case "any": return list.items.some(test);
    default: return list.items.length > 0 ? inItem(list.items[0]) : null;
  }
}

function call(n: CallNode, scope: Item, env: ExprEnv): unknown {
  const a = n.args;
  const val = (x: ExprNode) => ev(x, scope, env);
  const numberOf = (x: ExprNode) => num(val(x), x.pos);
  const table = (x: ExprNode) => own(env.tables, String(val(x))) ?? fail("unknown_table", "unknown table", x.pos);
  const keyPart = (x: ExprNode) => {
    const v = val(x);
    return v !== null && typeof v === "object" ? fail("type", "a key is a number, a string, true, false or null", x.pos) : String(v);
  };
  const key = (from: number) => a.slice(from).map(keyPart).join(":");
  switch (n.fn) {
    case "ceil": case "floor": case "round": return Math[n.fn](numberOf(a[0]));
    case "min": case "max": return Math[n.fn](...a.map(numberOf));
    case "roundd": {
      const x = numberOf(a[0]), places = a[1] ? numberOf(a[1]) : 0;
      return roundd(x, Number.isInteger(places) ? places : fail("not_an_integer", "roundd takes a whole number of places", a[1].pos));
    }
    case "if": return val(bool(val(a[0]), a[0].pos) ? a[1] : a[2]);
    case "coalesce": return a.reduce<unknown>((got, x) => (got !== null ? got : val(x)), null);
    case "lookup": {
      const t = table(a[0]), k = key(1), v = own(t, k);
      return v !== undefined ? v : fail("lookup_miss", `no key ${k} in this table`, n.pos);
    }
    case "lookupOr": {
      const fallback = val(a[0]), v = own(table(a[1]), key(2));
      return v !== undefined ? v : fallback;
    }
    case "hasKey": return own(table(a[0]), key(1)) !== undefined;
    case "qty": case "firstQty": {
      const tag = val(a[0]), lines = env.lines ?? [];
      if (typeof tag !== "string") fail("type", "a tag is a string", a[0].pos);
      spend(env, lines.length, n.pos);
      const tagged = lines.filter((l) => l.tags.includes(tag)).slice(0, n.fn === "firstQty" ? 1 : undefined);
      return tagged.reduce((total, l) => total + (Number.isSafeInteger(l.qty) ? l.qty : fail("not_an_integer", `a line tagged ${tag} has a broken quantity`, n.pos)), 0);
    }
    case "priceOf": {
      const k = keyPart(a[0]), part = own(env.catalog, k);
      return part !== undefined ? num(own(part, "unitOre"), n.pos) : fail("part_unavailable", `part ${k} is not in the catalogue`, n.pos);
    }
  }
}

export function evalExpr(ast: ExprNode, env: ExprEnv): ExprResult<unknown> {
  return attempt(() => ev(ast, env.scope ?? {}, env));
}

/** For a place that demands a whole number: a line's `qty` and `fixedOre`, the amount of `take`, the `qty` of `move`. */
export function evalInteger(ast: ExprNode, env: ExprEnv): ExprResult<number> {
  const out = evalExpr(ast, env);
  if (!out.ok) return out;
  if (typeof out.value === "number" && Number.isSafeInteger(out.value)) return { ok: true, value: out.value };
  return { ok: false, error: { code: "not_an_integer", message: "expected a whole number", pos: ast.pos } };
}
