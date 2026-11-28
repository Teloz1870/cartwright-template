import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXPR_BUDGET,
  EXPR_FUNCTIONS,
  MAX_EXPR_DEPTH,
  MAX_EXPR_LENGTH,
  checkExpr,
  evalExpr,
  evalInteger,
  parseExpr,
  type ExprEnv,
  type ExprErrorCode,
  type ExprNode,
  type StaticEnv,
} from "@/lib/configurator/expr";
import { getModuleManifest, getProfile } from "@/modules/registry";

/**
 * BOM2-a1 — the expression language of a configurator definition. Every noun and number here is
 * invented. The differential at the end runs the interpreter that produced the contract's
 * measurements, copied unchanged but for type annotations, against this one.
 */

const ROWS = [
  { w: 2.5, h: 120, kind: "tall", on: true, note: null, subs: { as: "s", items: [{ v: 1 }, { v: 2.5 }] } },
  { w: 4, h: 80, kind: "low", on: false, note: "x", subs: { as: "s", items: [] } },
  { w: 1.5, h: 120, kind: "tall", on: true, note: null, subs: { as: "s", items: [{ v: 10 }] } },
];
const ROOT = { a: 3, b: 0.5, neg: -2.25, zero: 0, yes: true, no: false, nil: null, colour: "red", size: "120", rec: { x: 1, deep: { y: 2 } } };
const GROUPS = { rows: { as: "row", items: ROWS }, none: { as: "e", items: [] } };
const TABLES = { price: { red: 5, blue: 7.5, "red:120": 11, "120": 13, "0.5": 17, true: 19, null: 23 }, parts: { red: "p-1" }, empty: {} };
const LINES = [
  { qty: 3, tags: ["leg"] },
  { qty: 5, tags: ["leg", "foot"] },
  { qty: 2, tags: ["shelf"] },
];
const CATALOG = { "p-1": { unitOre: 1250 }, "p-2": { unitOre: 99 } };

const env = (over: Partial<ExprEnv> = {}): ExprEnv => ({
  root: ROOT,
  groups: GROUPS,
  tables: TABLES,
  lines: LINES,
  catalog: CATALOG,
  budget: { left: EXPR_BUDGET },
  ...over,
});

function ast(src: string): ExprNode {
  const out = parseExpr(src);
  if (!out.ok) throw new Error(`${src} did not parse: ${out.error.code} at ${out.error.pos}`);
  return out.value;
}
function value(src: string, over?: Partial<ExprEnv>): unknown {
  const out = evalExpr(ast(src), env(over));
  if (!out.ok) throw new Error(`${src} failed: ${out.error.code} at ${out.error.pos}`);
  return out.value;
}
function parseError(src: string) {
  const out = parseExpr(src);
  return out.ok ? "parsed" : { code: out.error.code, pos: out.error.pos };
}
function evalError(src: string, over?: Partial<ExprEnv>) {
  const out = evalExpr(ast(src), env(over));
  return out.ok ? "evaluated" : { code: out.error.code, pos: out.error.pos };
}

describe("the grammar", () => {
  it.each<[string, unknown]>([
    ["0", 0],
    ["007", 7],
    ["1.5", 1.5],
    ["0.000000001", 0.000000001],
    ["'text'", "text"],
    ["''", ""],
    ["'it\\'s'", "it's"],
    ["'a\\\\b'", "a\\b"],
    ["'a\\nb'", "anb"],
    ["true", true],
    ["false", false],
    ["null", null],
    ["a", 3],
    ["rec.x", 1],
    ["rec.deep.y", 2],
    ["(a)", 3],
    ["((a))", 3],
    ["  a  ", 3],
    ["\ta\n+\r1 ", 4],
    ["ceil (1.5)", 2],
    ["min(2 , 1)", 1],
  ])("reads %s", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it.each<[string, number]>([
    ["", 0],
    ["   ", 3],
    ["1 +", 3],
    ["(1", 2],
    ["1)", 1],
    ["()", 1],
    ["1 2", 2],
    ["a b", 2],
    ["a.", 1],
    ["a.1", 1],
    ["a . b", 2],
    [".5", 0],
    ["5.", 1],
    ["1.2.3", 3],
    ['"text"', 0],
    ["'text", 0],
    ["'text\\", 0],
    ["'a\\\nb'", 0],
    ["=", 0],
    ["a=1", 1],
    ["a&b", 1],
    ["a|b", 1],
    ["1%2", 1],
    ["a[0]", 1],
    ["a?1:2", 1],
    ["a;", 1],
    ["`a`", 0],
    ["min(1,)", 6],
    ["min(,1)", 4],
    [",", 0],
    ["!", 1],
    ["-", 1],
    ["ceil(1", 6],
    ["æ", 0],
    ["1 ! 2", 2],
  ])("refuses %j as a syntax error at its position", (src, pos) => {
    expect(parseError(src)).toEqual({ code: "syntax", pos });
  });

  it("holds exactly the closed function list", () => {
    expect([...EXPR_FUNCTIONS].sort()).toEqual(
      ["any", "ceil", "coalesce", "count", "first", "firstQty", "floor", "hasKey", "if", "lookup", "lookupOr", "max", "min", "priceOf", "qty", "round", "roundd", "sum"].sort(),
    );
  });

  it("gives every node its position: the operator for a binary one, the first character otherwise", () => {
    const node = ast("a + -ceil(b)");
    expect(node).toMatchObject({ kind: "binary", pos: 2, left: { kind: "name", pos: 0 }, right: { kind: "unary", pos: 4, operand: { kind: "call", pos: 5, args: [{ pos: 10 }] } } });
    expect(ast("(  'x')")).toMatchObject({ kind: "literal", pos: 3 });
  });

  it("parses the same source to the same tree, and reading it changes nothing but the budget", () => {
    expect(ast("sum(rows,row.w)*lookup('price',colour,size)")).toEqual(ast("sum(rows,row.w)*lookup('price',colour,size)"));
    const frozen = <T>(o: T): T => {
      if (o !== null && typeof o === "object") Object.values(o).forEach(frozen);
      return Object.freeze(o);
    };
    const budget = { left: 1000 };
    const shared = frozen(env({ scope: { row: ROWS[0], prev: null, index: 0 } }));
    const held = { ...shared, budget };
    const src = "sum(rows,row.w*sum(row.subs,s.v))+qty('leg')+priceOf('p-1')+lookup('price',colour)+count(rows,any(rows,row.on))";
    const first = evalExpr(ast(src), held);
    expect(first.ok).toBe(true);
    expect(evalExpr(ast(src), held)).toEqual(first);
    expect(budget.left).toBeLessThan(1000);
  });
});

describe("precedence and associativity", () => {
  it.each<[string, unknown]>([
    ["1+2*3", 7],
    ["(1+2)*3", 9],
    ["2*3+1", 7],
    ["10-3-2", 5],
    ["10-(3-2)", 9],
    ["100/10/5", 2],
    ["100/(10/5)", 50],
    ["2*6/3", 4],
    ["7-2+1", 6],
    // Equal precedence, read left to right: only doubles can tell these from the other grouping.
    ["0.1*3/3", (0.1 * 3) / 3],
    ["0.1+0.2-0.3", 0.1 + 0.2 - 0.3],
    ["-2*3", -6],
    ["2*-3", -6],
    ["--2", 2],
    ["-(1+2)", -3],
    ["1 - -1", 2],
    ["!true||true", true],
    ["!(true||true)", false],
    ["!!true", true],
    ["true||false&&false", true],
    ["(true||false)&&false", false],
    ["false&&true||true", true],
    ["false&&(true||true)", false],
    ["1+1==2", true],
    ["2==1+1", true],
    ["1+2<2*2", true],
    ["1<2&&2<3", true],
    ["1>2||2>=2", true],
    ["1<=1&&2>=2&&1!=2&&1==1", true],
    ["1<1", false],
    ["1>1", false],
    ["2<=1", false],
    ["1>=2", false],
    ["-1<0", true],
    ["(1<2)==true", true],
    ["true==(1<2)", true],
    ["(1==1)==(2==2)", true],
  ])("%s is %j", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it.each<[string, number]>([
    ["1<2<3", 3],
    ["1==1==true", 4],
    ["1<2==true", 3],
    ["true==1<2", 7],
    ["1!=2!=3", 4],
    ["1>=2<=3", 4],
    ["a+1<2>3", 5],
    ["true&&1<2<3", 9],
  ])("comparisons do not chain: %s is refused at the second one", (src, pos) => {
    expect(parseError(src)).toEqual({ code: "syntax", pos });
  });
});

const PHP_VALUES = [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22];
const PHP_POWERS = [1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22];

/**
 * `_php_math_round` from php-src's ext/standard/math.c, half up: the behaviour `roundd` promises. The same at PHP-7.4 and PHP-8.3; PHP-8.4 rewrote it.
 * Written out statement by statement (`php_intlog10abs`'s table and five-step search, `php_intpow10`'s table, `php_round_helper`, the print and parse)
 * and not in the shape of the code it checks, so a slip has to be made twice and differently to pass. Two things stand in for what the C gets from
 * libc: Math.log10 for log10 outside the table, shared with the code on purpose, and the exact power, rounded once, for pow beyond it.
 */
function phpRound(value: number, wanted: number): number {
  const intlog10abs = (input: number): number => {
    const v = Math.abs(input);
    if (v < 1e-8 || v > 1e22) return Math.floor(Math.log10(v));
    let result = 15;
    result += v < PHP_VALUES[result] ? -8 : 8;
    result += v < PHP_VALUES[result] ? -4 : 4;
    result += v < PHP_VALUES[result] ? -2 : 2;
    result += v < PHP_VALUES[result] ? -1 : 1;
    if (v < PHP_VALUES[result]) result -= 1;
    return result - 8;
  };
  const intpow10 = (power: number): number => (power <= 22 ? PHP_POWERS[power] : power > 400 ? Number.POSITIVE_INFINITY : Number(BigInt(10) ** BigInt(power)));
  const helper = (v: number): number => (v >= 0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5));

  if (!Number.isFinite(value) || value === 0) return value;
  // PHP_FUNCTION(round) and the first line of _php_math_round: places is a C int.
  const places = wanted > 2147483647 ? 2147483647 : wanted < -2147483647 ? -2147483647 : wanted;
  const precisionPlaces = 14 - intlog10abs(value);
  const f1 = intpow10(Math.abs(places));
  let tmp: number;
  if (precisionPlaces > places && precisionPlaces - 15 < places) {
    let usePrecision = precisionPlaces;
    let f2 = intpow10(Math.abs(usePrecision));
    tmp = usePrecision >= 0 ? value * f2 : value / f2;
    tmp = helper(tmp);
    usePrecision = places - precisionPlaces;
    f2 = intpow10(Math.abs(usePrecision));
    tmp = tmp / f2;
  } else {
    tmp = places >= 0 ? value * f1 : value / f1;
    if (Math.abs(tmp) >= 1e15) return value;
  }
  tmp = helper(tmp);
  if (Math.abs(places) < 23) return places > 0 ? tmp / f1 : tmp * f1;
  // snprintf(buf, 39, "%15fe%d", tmp, -places) is PHP's own: INF for either infinity, no sign on a zero. zend_strtod skips the padding and reads INF.
  const parsed = Number.isFinite(tmp) ? Number(`${tmp.toFixed(6).padStart(15)}e${-places}`) : Number.POSITIVE_INFINITY;
  return Number.isFinite(parsed) ? parsed : value;
}

/**
 * Printed by the C itself: ext/standard/math.c at PHP-8.3, lines 33 to 205, compiled unchanged on macOS arm64, with shims only for zend_strtod (libc's
 * strtod) and PHP's own snprintf, read from main/snprintf.c. This machine has no PHP binary. Neither the code nor phpRound above produced a number here.
 * Each row is [value, places, result].
 */
const PHP_ROWS: Readonly<Record<string, readonly (readonly [number, number, number])[]>> = {
  "the falsification's six": [
    [50.05499999999995, 2, 50.06], [2238450.499999995, 0, 2238451], [86.44999999999995, 1, 86.5], [1000000000000001, 0, 1000000000000001],
    [123456789012.34567, 4, 123456789012.34567], [0.4999999999999999, 0, 0],
  ],
  "a row sum forced onto a half": [
    [8420.499999999995, 0, 8421], [7253.4999999999945, 0, 7254], [6915.304999999995, 2, 6915.31], [7635.1249999999945, 2, 7635.13],
    [8067.534999999994, 2, 8067.54], [6395.2499999999945, 1, 6395.3], [7334.2499999999945, 1, 7334.3],
  ],
  "within 20 ulps of a half": [
    [0.49999999999999994, 0, 1], [0.5000000000000001, 0, 1], [0.4999999999999989, 0, 0], [0.5000000000000022, 0, 1], [-0.49999999999999994, 0, -1],
    [1.4999999999999998, 0, 2], [1.4999999999999956, 0, 2], [2.4999999999999996, 0, 3], [2.499999999999991, 0, 2], [1000.4999999999999, 0, 1001],
    [1000.4999999999977, 0, 1001], [1000.5000000000023, 0, 1001], [-1000.4999999999977, 0, -1001], [1.0049999999999997, 2, 1.01],
    [1.0049999999999955, 2, 1.01], [1.0050000000000043, 2, 1.01], [-1.0049999999999955, 2, -1.01], [5.054999999999982, 2, 5.05],
    [5.0550000000000175, 2, 5.06], [0.28499999999999887, 2, 0.28], [1.4499999999999955, 1, 1.5], [1.4500000000000044, 1, 1.5],
    [1234.5677999999955, 3, 1234.568], [1249.9999999999998, -2, 1300], [1250.0000000000002, -2, 1300], [1249.9999999999955, -2, 1300],
    [35.49999999999986, 0, 35], [999999999999999.5, 0, 1000000000000000], [99999999999999.48, 0, 100000000000000],
  ],
  "1e15 and above": [
    [1000000000000000, 0, 1000000000000000], [1000000000000000, 2, 1000000000000000], [1000000000000000.2, 0, 1000000000000000.2],
    [1000000000000003, 0, 1000000000000003], [1000000000000001, 2, 1000000000000001], [9007199254740992, 0, 9007199254740992],
    [9007199254740992, -1, 9007199254740990], [1.2345678901234568e18, -3, 1.2345678901234568e18], [1.2345678901234568e18, -4, 1.23456789012346e18],
    [1.2345678901234568e18, -5, 1.2345678901235e18], [1e21, 2, 1e21], [1e22, -20, 1e22], [1e23, -9, 1e23],
    [1.7976931348623157e308, 0, 1.7976931348623157e308], [-1.7976931348623157e308, 0, -1.7976931348623157e308],
    [1.7976931348623157e308, -294, 1.7976931348623157e308], [1.7976931348623157e308, -308, 1.7976931348623157e308],
  ],
  "places beyond the precision": [
    [1.2345678901234567, 15, 1.2345678901234567], [1.2345678901234567, 14, 1.23456789012346], [0.30000000000000004, 16, 0.30000000000000004],
    [0.30000000000000004, 17, 0.30000000000000004], [0.30000000000000004, 15, 0.3], [123.456, 12, 123.456], [123.456, 13, 123.456], [0.1, 16, 0.1],
    [1.5, 15, 1.5], [1.5, 16, 1.5], [1.5, 308, 1.5], [1.5, 309, 1.5], [1.5, 400, 1.5], [-1.5, 400, -1.5], [1.5, 2147483647, 1.5],
    [1.2345678901234568e-5, 20, 1.2345678901234568e-5],
  ],
  "below the rounding unit": [
    [0.004, 2, 0], [-0.004, 2, -0], [0.0049999999999999, 2, 0], [0.004999999999999999, 2, 0.01], [0.005, 2, 0.01], [345, -3, 0], [-345, -3, -0],
    [499.99999999999994, -3, 1000], [500, -3, 1000], [-0.4, 0, -0], [1e-9, 2, 0], [1e-20, 0, 0], [1e-300, 2, 0], [-1e-300, 2, -0], [5e-324, 0, 0],
    [-5e-324, 0, -0], [5e-324, 2, 0], [5e-324, -22, 0], [-5e-324, -22, 0], [1, -1, 0], [1, -20, 0], [1, -22, 0],
  ],
  "beside a power of ten": [
    [999.9999999999999, 2, 1000], [999.9999999999999, 10, 1000], [999.9999999999999, 11, 1000], [999.9999999999994, 11, 1000],
    [1000.0000000000001, 11, 1000], [999.9999999999994, 12, 999.999999999999], [999.9999999999994, 13, 999.9999999999994],
    [0.9999999999999999, 14, 1], [0.9999999999999999, 15, 1], [9.999999999999999e-9, 8, 1e-8], [9.999999999999999e-9, 22, 1e-8],
    [1.0000000000000002e-8, 22, 1e-8], [1e22, 0, 1e22], [1.0000000000000002e22, -8, 1e22], [9.999999999999998e21, -8, 1e22], [1e-8, 8, 1e-8],
  ],
  "the branch that prints and parses": [
    [1e-24, 25, 1e-24], [1.5e-24, 24, 2e-24], [-1.5e-24, 24, -2e-24], [1.25e-23, 24, 1.3e-23], [1e-20, 23, 1e-20], [1.5e-20, 23, 1.5e-20],
    [1e-20, 22, 1e-20], [1e-30, 25, 0], [-1e-30, 25, 0], [1e-30, 30, 1e-30], [123456789, -23, 0], [1.5e23, -23, 2e23], [5e22, -23, 1e23],
    [4.9e22, -23, 0], [3, -30, 0], [-3, -30, 0], [1e300, -300, 1e300], [5e299, -300, 1e300], [1e-300, 300, 1e-300], [-1e-300, 300, -1e-300],
    [1.5, -400, 0], [-1.5, -400, 0], [1.5, -2147483647, 0], [-1.5, -2147483647, 0], [1e-310, 300, 0], [1e-310, 310, 1e-310],
  ],
  "no number to round": [
    [0, 2, 0], [0, -30, 0], [-0, 30, -0], [-0, 0, -0],
  ],
};

/** The double `n` steps from x, away from zero when n is positive. */
function ulps(x: number, n: number): number {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, x);
  bits.setBigInt64(0, bits.getBigInt64(0) + BigInt(n));
  return bits.getFloat64(0);
}

/**
 * The inputs the sweep over decimals does not reach, each class as [value, places]. Places run past what a double holds on both sides, so every
 * branch of the C runs. The classes are aimed with a rough log10, which is good enough to aim: they are inputs, and only phpRound says what is right.
 */
function rounddClasses(rnd: () => number): Record<string, () => readonly [number, number]> {
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const signed = (x: number) => (rnd() < 0.5 ? x : -x);
  const scaled = (exponent: number) => signed(Number(`${int(1, 9)}.${int(0, 10 ** int(1, 15))}e${exponent}`));
  return {
    "within 20 ulps of a half": () => {
      const places = int(-3, 8);
      return [ulps(signed(Number(`${int(0, 10 ** int(1, 13))}5e${-places - 1}`)), int(-20, 20)), places];
    },
    "a row sum forced onto a half": () => {
      const places = int(0, 2), add = (total: number, x: number) => total + x;
      const rows = Array.from({ length: int(2, 60) }, () => int(0, 5000) / 10 ** int(1, 3));
      const total = rows.reduce(add, 0);
      rows.push(Number(((Math.floor(total * 10 ** places) + 0.5) / 10 ** places - total).toFixed(6)));
      return [rows.reduce(add, 0), places];
    },
    "1e15 and above": () => [rnd() < 0.3 ? signed(1e15 + int(0, 100_000)) : scaled(int(15, 307)), int(-30, 6)],
    "places beyond the precision": () => {
      const v = scaled(int(-6, 14));
      return [v, 14 - Math.floor(Math.log10(Math.abs(v))) + int(0, 12)];
    },
    "below the rounding unit": () => {
      const places = int(-20, 20);
      return [rnd() < 0.5 ? signed(ulps(Number(`5e${-places - 1}`), -int(1, 20))) : scaled(-places - int(1, 12)), places];
    },
    "beside a power of ten": () => {
      const exponent = int(-30, 30), v = signed(ulps(Number(`1e${exponent}`), int(-20, 20)));
      return [v, 14 - exponent + int(-17, 3)];
    },
    "the branch that prints and parses": () => {
      const exponent = int(-323, 307), places = signed(int(23, 340));
      return [scaled(exponent), rnd() < 0.5 ? places : Math.max(23, Math.abs(14 - exponent + int(-16, 2))) * (exponent < 0 ? 1 : -1)];
    },
  };
}

describe("roundd rounds as PHP before 8.4, round as Math.round", () => {
  // Rows marked "doc" are the examples on php.net's round() page. Each row also has to agree with phpRound above.
  it.each<[string, number]>([
    ["roundd(1.005,2)", 1.01], // the double is 1.00499999999999989…; 15 digits make it 1.005
    ["roundd(2.5)", 3],
    ["roundd(-2.5)", -3], // Math.round says -2
    ["roundd(0.5)", 1],
    ["roundd(-0.5)", -1],
    ["roundd(3.4)", 3], // doc
    ["roundd(3.5)", 4], // doc
    ["roundd(3.6)", 4], // doc
    ["roundd(3.6,0)", 4], // doc
    ["roundd(1.955,2)", 1.96],
    ["roundd(1.95583,2)", 1.96],
    ["roundd(5.045,2)", 5.05], // doc
    ["roundd(5.055,2)", 5.06], // doc
    ["roundd(1.55,1)", 1.6], // doc
    ["roundd(-1.55,1)", -1.6], // doc
    ["roundd(1241757,-3)", 1242000],
    ["roundd(345,-2)", 300], // doc
    ["roundd(345,-3)", 0], // doc
    ["roundd(678,-2)", 700], // doc
    ["roundd(678,-3)", 1000], // doc
    ["roundd(135.79,3)", 135.79], // doc
    ["roundd(135.79,2)", 135.79], // doc
    ["roundd(135.79,1)", 135.8], // doc
    ["roundd(135.79,0)", 136], // doc
    ["roundd(135.79,-1)", 140], // doc
    ["roundd(135.79,-2)", 100], // doc
    ["roundd(135.79,-3)", 0], // doc
    ["roundd(9.5)", 10], // doc
    ["roundd(8.5)", 9], // doc
    ["roundd(-3.5)", -4], // doc
    ["roundd(0.285,2)", 0.29],
    // The 15-digit boundary. Sixteen digits: the pre-round lifts it to 1.5. Fifteen digits: it stays below.
    ["roundd(1.499999999999999)", 2],
    ["roundd(-1.499999999999999)", -2],
    ["roundd(1.49999999999999)", 1],
    ["roundd(35.49999999999999)", 36],
    ["roundd(1.005*100)", 101], // 100.49999999999999 as a double
    ["roundd(1234567.891,2)", 1234567.89],
    ["roundd(0.0000015,6)", 0.000002], // a value String() writes with an exponent
    ["roundd(1000000000000000000000,2)", 1e21], // and a large one
    ["roundd(-0.4)", -0], // PHP's sign, which == and a key cannot see
  ])("%s is %d", (src, want) => {
    expect(value(src)).toBe(want);
    const [, x, places] = src.match(/^roundd\((.*?)(?:,(-?\d+))?\)$/) ?? [];
    expect(phpRound(value(x ?? "") as number, Number(places ?? 0))).toBe(want);
  });

  const rounddOf = (x: number, n: number) => evalExpr(ast("roundd(x,n)"), env({ root: { x, n } }));

  describe.each(Object.entries(PHP_ROWS))("what the C prints: %s", (_name, rows) => {
    it.each(rows)("roundd(%d, %d) is %d", (x, places, want) => {
      expect(rounddOf(x, places)).toEqual({ ok: true, value: want });
      expect(Object.is(phpRound(x, places), want), "the oracle").toBe(true);
    });
  });

  // PHP_FUNCTION(round) takes a long and clamps it to a C int, so what the C prints at the limit holds beyond it.
  it.each<[number, number, number]>([
    [1.5, 1e24, 1.5],
    [-1.5, 1e24, -1.5],
    [1.5, -1e24, 0],
    [-1.5, -1e24, 0],
    [1e-300, 2147483648, 1e-300],
    [1e300, -2147483648, 0],
  ])("roundd(%d, %d), places past a C int, is %d", (x, places, want) => {
    expect(rounddOf(x, places)).toEqual({ ok: true, value: want });
    expect(Object.is(phpRound(x, places), want), "the oracle").toBe(true);
  });

  it.each<[string, number]>([
    ["round(2.5)", 3],
    ["round(-2.5)", -2],
    ["round(1.499999999999999)", 1],
    ["round(1.005*100)", 100],
    ["round(0.5)", 1],
    ["round(-0.5)", -0],
    ["ceil(1.2)", 2],
    ["ceil(-1.2)", -1],
    ["floor(1.8)", 1],
    ["floor(-1.2)", -2],
    // Doubles, not decimals: this pair is why a rule's own correction stays one visible token.
    ["ceil(3.45/1.15)", 4],
    ["ceil(3.45/1.15-0.000000001)", 3],
  ])("%s is %d", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it("agrees with the PHP algorithm on 20,000 decimals", () => {
    const rnd = seeded(20261031);
    const compiled = [0, 1, 2, 3, 4, -1, -2].map((n) => [n, ast(`roundd(x,${n})`)] as const);
    for (let i = 0; i < 20_000; i++) {
      const [places, node] = compiled[Math.floor(rnd() * compiled.length)];
      let x = Number(`${Math.floor(rnd() * 10 ** (1 + Math.floor(rnd() * 8)))}e-${Math.floor(rnd() * 7)}`);
      if (rnd() < 0.3) x *= Number(`${Math.floor(rnd() * 1000)}e-2`);
      if (rnd() < 0.2) x = -x;
      if (x === 0) continue;
      const got = evalExpr(node, env({ root: { x } }));
      expect(got.ok && Object.is(got.value, phpRound(x, places)), `roundd(${x},${places})`).toBe(true);
    }
  });

  // The floor says the class reaches what it is for: inputs where the prototype's decimal route leaves PHP, measured with this seed. A row sum
  // has no floor: it leaves that route about once in 100,000, so the table above holds the ones it found.
  it.each<[string, number]>([
    ["within 20 ulps of a half", 400],
    ["a row sum forced onto a half", 0],
    ["1e15 and above", 2000],
    ["places beyond the precision", 14_000],
    ["below the rounding unit", 1300],
    ["beside a power of ten", 4500],
    ["the branch that prints and parses", 5500],
  ])("agrees with the PHP algorithm on 30,000 generated: %s", (name, floor) => {
    const source = "roundd(x,n)", node = ast(source), next = rounddClasses(seeded(20261101))[name];
    const wrong: string[] = [];
    let leftPhp = 0;
    for (let i = 0; i < 30_000; i++) {
      const [x, n] = next();
      const want = phpRound(x, n), got = evalExpr(node, env({ root: { x, n } })), old = protoRun(source, env({ root: { x, n } }));
      if (!got.ok || !Object.is(got.value, want)) wrong.push(`roundd(${x},${n}) is ${got.ok ? String(got.value) : got.error.code}, PHP ${want}`);
      // Places of 0 and up only: below that the prototype answers NaN, a difference of its own. !== on purpose: the sign of a zero is the other exception, below.
      if (n >= 0 && (!old.ok || old.value !== want)) leftPhp++;
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(leftPhp).toBeGreaterThanOrEqual(floor);
  });

  it.each<[string, ExprErrorCode, number]>([
    ["roundd(1.5,0.5)", "not_an_integer", 11],
    ["roundd(1.5,'2')", "type", 11],
    ["roundd('1.5')", "type", 7],
    ["roundd(null)", "type", 7],
  ])("%s is refused", (src, code, pos) => {
    expect(evalError(src)).toEqual({ code, pos });
  });
});

describe("__proto__, constructor and prototype can never be read", () => {
  // Own keys: JSON.parse makes `__proto__` an own property, the shape a stored definition or input has.
  const hostile = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"name":"x"},"prototype":{"a":1},"ok":1,"inner":{"__proto__":{"a":1},"constructor":{"a":1}}}');
  const hostileEnv = () => env({ root: hostile, scope: hostile, tables: { ...TABLES, h: hostile }, catalog: hostile });

  it.each<[string, number]>([
    ["__proto__", 0],
    ["constructor", 0],
    ["prototype", 0],
    ["inner.__proto__", 0],
    ["inner.constructor", 0],
    ["inner.prototype", 0],
    ["__proto__.polluted", 0],
    ["constructor.name", 0],
    ["inner.constructor.name", 0],
    ["1+inner.__proto__", 2],
    ["__proto__(1)", 0],
    ["constructor(1)", 0],
    ["inner.constructor(1)", 0],
    ["sum(__proto__,1)", 4],
    ["count(inner.constructor)", 6],
    ["sum(rows,row.__proto__)", 9],
    ["lookup('__proto__','a')", 7],
    ["lookup('constructor','a')", 7],
    ["lookup('prototype','a')", 7],
    ["hasKey('__proto__','a')", 7],
    ["lookupOr(0,'constructor','a')", 11],
    ["lookup('h','__proto__')", 11],
    ["lookup('h','constructor')", 11],
    ["lookup('h','a','prototype')", 15],
    ["hasKey('h','constructor')", 11],
    ["lookupOr(0,'h','__proto__')", 15],
    ["priceOf('__proto__')", 8],
    ["priceOf('constructor')", 8],
    ["priceOf('prototype')", 8],
    // A backslash escape decodes to the same name.
    ["lookup('h','\\_\\_proto\\_\\_')", 11],
    ["lookup('\\constructor','a')", 7],
    ["priceOf('proto\\type')", 8],
  ])("%s is refused at parse", (src, pos) => {
    expect(parseError(src)).toEqual({ code: "forbidden_name", pos });
  });

  it("a key computed at evaluation is a miss, even when the object owns it", () => {
    for (const k of ["__proto__", "constructor", "prototype"]) {
      const computed = () => hostileEnv();
      const scope = { k };
      expect(evalError("lookup('h',k)", { ...computed(), scope })).toEqual({ code: "lookup_miss", pos: 0 });
      expect(value("lookupOr('fallback','h',k)", { ...computed(), scope })).toBe("fallback");
      expect(value("hasKey('h',k)", { ...computed(), scope })).toBe(false);
      expect(evalError("priceOf(k)", { ...computed(), scope })).toEqual({ code: "part_unavailable", pos: 0 });
      expect(evalError("priceOf(k)", { scope })).toEqual({ code: "part_unavailable", pos: 0 });
    }
  });

  it("an inherited property is not there either", () => {
    expect(evalError("toString")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("rec.toString")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("rec.hasOwnProperty")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("colour.length")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("lookup('toString','a')")).toEqual({ code: "unknown_table", pos: 7 });
    expect(evalError("lookup('price','toString')")).toEqual({ code: "lookup_miss", pos: 0 });
    expect(value("hasKey('price','toString')")).toBe(false);
    expect(value("lookupOr(1,'price','valueOf')")).toBe(1);
    expect(evalError("priceOf('toString')")).toEqual({ code: "part_unavailable", pos: 0 });
    expect(evalError("sum(toString,1)")).toEqual({ code: "unknown_name", pos: 4 });
    const inheriting = (from: object, rest: object) => Object.assign(Object.create(from), rest);
    expect(evalError("sum(x,1)", { root: { x: inheriting({ as: "y" }, { items: [] }) } })).toEqual({ code: "not_a_list", pos: 4 });
    expect(evalError("sum(x,1)", { root: { x: inheriting({ items: [] }, { as: "y" }) } })).toEqual({ code: "not_a_list", pos: 4 });
    expect(evalError("priceOf('x')", { catalog: { x: inheriting({ unitOre: 5 }, {}) } })).toEqual({ code: "type", pos: 0 });
  });

  it("a list and its internals are not readable through a path, nor is an array", () => {
    const scope = { list: { as: "x", items: [{ v: 1 }] }, arr: [1, 2], row: ROWS[0] };
    expect(evalError("list.items", { scope })).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("list.as", { scope })).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("list.items.length", { scope })).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("row.subs.items", { scope })).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("arr.length", { scope })).toEqual({ code: "unknown_name", pos: 0 });
  });
});

describe("unknown names and unknown functions", () => {
  it.each(["alert(1)", "eval('1')", "Function('x')", "require('fs')", "process.exit(1)", "toString(1)", "hasOwnProperty('a')", "valueOf()", "Math.floor(1)", "row.ceil(1)", "CEIL(1)", "ceil2(1)", "true(1)", "null(1)"])(
    "%s is an unknown function at parse, reached or not",
    (src) => {
      expect(parseError(src)).toEqual({ code: "unknown_function", pos: 0 });
      expect(parseError(`false&&${src}`)).toEqual({ code: "unknown_function", pos: 7 });
    },
  );

  it.each(["new Function('x')", "a.b c", "this", "globalThis", "window", "process", "undefined", "NaN", "Infinity"])("%s reads no global", (src) => {
    const parsed = parseExpr(src);
    if (!parsed.ok) return expect(parsed.error.code).toBe("syntax");
    expect(evalExpr(parsed.value, env())).toMatchObject({ ok: false, error: { code: "unknown_name" } });
  });

  it("an unknown name is an error at evaluation", () => {
    expect(evalError("nope")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("1+nope")).toEqual({ code: "unknown_name", pos: 2 });
    expect(evalError("rec.nope")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("a.x")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("rec.deep.nope")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("nil.x")).toEqual({ code: "unknown_name", pos: 0 });
    expect(evalError("rows")).toEqual({ code: "unknown_name", pos: 0 });
  });

  it("a value stored as undefined is not a value", () => {
    expect(evalError("x", { root: { x: undefined } })).toEqual({ code: "unknown_name", pos: 0 });
  });

  it("a bound name wins over the root, and a null there is a value", () => {
    expect(value("a", { scope: { a: 9 } })).toBe(9);
    expect(value("a", { scope: { a: null } })).toBe(null);
    expect(value("a", { scope: {} })).toBe(3);
    expect(evalError("prev.w", { scope: { prev: null } })).toEqual({ code: "unknown_name", pos: 0 });
    expect(value("prev!=null&&prev.w==1", { scope: { prev: null } })).toBe(false);
  });

  const declared: StaticEnv = {
    scope: { a: "value", rec: { record: { x: "value", deep: { record: { y: "value" } } } }, bound: { list: { as: "g", item: { v: "value" } } } },
    groups: { rows: { as: "row", item: { w: "value", subs: { list: { as: "s", item: { v: "value" } } } } } },
    tables: { price: {} },
  };
  const check = (src: string) => checkExpr(ast(src), declared).map((e) => [e.code, e.pos]);

  it.each([
    "1",
    "'x'",
    "null",
    "a+1",
    "-a",
    "!a",
    "rec",
    "rec.x",
    "rec.deep.y",
    "bound",
    "if(a>1,rec.x,0)",
    "count(rows)",
    "sum(rows,row.w)",
    "sum(rows,a*row.w)",
    "sum(rows,sum(row.subs,s.v*row.w))",
    "count(bound,g.v>0)",
    "first(rows,row.w)",
    "any(rows,row.w==a)",
    "lookup('price',a)",
    "lookup('price',a,rec.x)",
    "lookupOr(0,'price',a)",
    "hasKey('price',a)",
    "qty('leg')",
    "priceOf('p')",
    "coalesce(a,0)",
  ])("the static check passes %s", (src) => {
    expect(check(src)).toEqual([]);
  });

  it.each<[string, [ExprErrorCode, number][]]>([
    ["nope", [["unknown_name", 0]]],
    ["toString", [["unknown_name", 0]]],
    ["rec.nope", [["unknown_name", 0]]],
    ["rec.toString", [["unknown_name", 0]]],
    ["rec.deep.nope", [["unknown_name", 0]]],
    ["a.x", [["unknown_name", 0]]],
    ["bound.v", [["unknown_name", 0]]],
    ["-nope", [["unknown_name", 1]]],
    ["1+nope", [["unknown_name", 2]]],
    ["nope+1", [["unknown_name", 0]]],
    ["ceil(nope)", [["unknown_name", 5]]],
    ["if(nope,1,2)", [["unknown_name", 3]]],
    ["rows", [["unknown_name", 0]]],
    ["row.w", [["unknown_name", 0]]],
    ["s.v", [["unknown_name", 0]]],
    ["sum(rows,row.nope)", [["unknown_name", 9]]],
    ["sum(rows,s.v)", [["unknown_name", 9]]],
    ["sum(row.subs,1)", [["unknown_name", 4]]],
    ["sum(nope,1)", [["unknown_name", 4]]],
    ["sum(toString,1)", [["unknown_name", 4]]],
    ["count(hasOwnProperty)", [["unknown_name", 6]]],
    ["sum(rows.w,1)", [["unknown_name", 4]]],
    ["sum(a,1)", [["not_a_list", 4]]],
    ["count(rec)", [["not_a_list", 6]]],
    ["any(rec.x,true)", [["not_a_list", 4]]],
    ["lookup('nope',a)", [["unknown_table", 7]]],
    ["hasKey('toString',a)", [["unknown_table", 7]]],
    ["lookupOr(0,'nope',a)", [["unknown_table", 11]]],
    ["lookup('price',nope)", [["unknown_name", 15]]],
    ["lookupOr(nope,'price',a)", [["unknown_name", 9]]],
    // Every finding, in source order but a call's table before its arguments, and a fold that failed still reads its body.
    ["nope+rec.nope+lookup('nope',row.w)", [["unknown_name", 0], ["unknown_name", 5], ["unknown_table", 21], ["unknown_name", 28]]],
    ["min(nope,nada)", [["unknown_name", 4], ["unknown_name", 9]]],
    ["lookupOr(nope,'nada',a)", [["unknown_table", 14], ["unknown_name", 9]]],
    ["sum(a,row.w)", [["not_a_list", 4], ["unknown_name", 6]]],
  ])("the static check finds %s", (src, want) => {
    expect(check(src)).toEqual(want);
  });

  it("a name the static check passes is found at evaluation too, and one it refuses is not", () => {
    const scope = { bound: { as: "g", items: [{ v: 1 }] } };
    for (const src of ["a+1", "rec.deep.y", "sum(rows,sum(row.subs,s.v*row.w))", "count(bound,g.v>0)", "lookup('price','red')"]) {
      expect(checkExpr(ast(src), declared)).toEqual([]);
      expect(evalExpr(ast(src), env({ scope })).ok).toBe(true);
    }
    for (const src of ["nope", "rec.nope", "rows", "row.w", "sum(rows,row.nope)", "sum(a,1)", "lookup('nope','red')", "sum(toString,1)", "count(hasOwnProperty)", "sum(rows.w,1)"]) {
      expect(checkExpr(ast(src), declared)).not.toEqual([]);
      expect(evalExpr(ast(src), env({ scope })).ok).toBe(false);
    }
  });

  it("a group wins over a bound list of the same name, in the static check as at evaluation", () => {
    const both: StaticEnv = { scope: { rows: { list: { as: "row", item: { z: "value" } } } }, groups: { rows: { as: "row", item: { w: "value" } } } };
    const over = { scope: { rows: { as: "row", items: [{ z: 1 }] } }, groups: { rows: { as: "row", items: [{ w: 2 }] } } };
    expect(checkExpr(ast("sum(rows,row.w)"), both)).toEqual([]);
    expect(value("sum(rows,row.w)", over)).toBe(2);
    expect(checkExpr(ast("sum(rows,row.z)"), both)).toMatchObject([{ code: "unknown_name", pos: 9 }]);
    expect(evalError("sum(rows,row.z)", over)).toEqual({ code: "unknown_name", pos: 9 });
  });

  const declaredAB: StaticEnv["groups"] = { "a.b": { as: "e", item: { v: "value" } } };
  const boundAB: ExprEnv["groups"] = { "a.b": { as: "e", items: [{ v: 1 }, { v: 2 }] } };

  it("a group is found by its whole dotted name and by nothing less or more, in the static check as at evaluation", () => {
    const dotted: StaticEnv = { scope: {}, groups: declaredAB };
    const over = { root: {}, groups: boundAB };
    for (const [src, want] of [["count(a.b)", 2], ["sum(a.b,e.v)", 3]] as const) {
      expect(checkExpr(ast(src), dotted)).toEqual([]);
      expect(value(src, over)).toBe(want);
    }
    for (const [src, pos] of [["a.b", 0], ["count(a)", 6], ["count(b)", 6], ["count(a.b.c)", 6], ["sum(a.b,e.z)", 8]] as const) {
      expect(checkExpr(ast(src), dotted)).toMatchObject([{ code: "unknown_name", pos }]);
      expect(evalError(src, over)).toEqual({ code: "unknown_name", pos });
    }
  });

  it("a dotted group wins over a list its path also reaches, in the static check as at evaluation", () => {
    const both: StaticEnv = { scope: { a: { record: { b: { list: { as: "x", item: { z: "value" } } } } } }, groups: declaredAB };
    const over = { root: { a: { b: { as: "x", items: [{ z: 9 }] } } }, groups: boundAB };
    expect(checkExpr(ast("sum(a.b,e.v)"), both)).toEqual([]);
    expect(value("sum(a.b,e.v)", over)).toBe(3);
    expect(checkExpr(ast("sum(a.b,x.z)"), both)).toMatchObject([{ code: "unknown_name", pos: 8 }]);
    expect(evalError("sum(a.b,x.z)", over)).toEqual({ code: "unknown_name", pos: 8 });
  });

  it("a group stored as null is no group, in the static check as at evaluation", () => {
    const groups = { l: null as never };
    expect(checkExpr(ast("sum(l,x.z)"), { scope: { l: { list: { as: "x", item: { z: "value" } } } }, groups })).toEqual([]);
    expect(value("sum(l,x.z)", { scope: { l: { as: "x", items: [{ z: 4 }] } }, groups })).toBe(4);
    expect(checkExpr(ast("sum(l,1)"), { scope: {}, groups })).toMatchObject([{ code: "unknown_name", pos: 4 }]);
    expect(evalError("sum(l,1)", { groups })).toEqual({ code: "unknown_name", pos: 4 });
  });

  it("a message names the whole dotted path, in the static check as at evaluation", () => {
    for (const [src, message] of [["rec.nope", "unknown name rec.nope"], ["sum(rec.x,1)", "rec.x is not a list"]] as const) {
      expect(checkExpr(ast(src), declared)).toMatchObject([{ message }]);
      expect(evalExpr(ast(src), env())).toMatchObject({ ok: false, error: { message } });
    }
  });

  it("an element shadows a name and the outer one comes back, in the static check as at evaluation", () => {
    const shadowed: StaticEnv = { scope: { a: { record: { z: "value" } } }, groups: { l: { as: "a", item: { v: "value" } } } };
    const over = { root: { a: { z: 10 } }, groups: { l: { as: "a", items: [{ v: 1 }] } } };
    expect(checkExpr(ast("sum(l,a.v)+a.z"), shadowed)).toEqual([]);
    expect(value("sum(l,a.v)+a.z", over)).toBe(11);
    for (const [src, pos] of [["sum(l,a.z)", 6], ["sum(l,a.v)+a.v", 11]] as const) {
      expect(checkExpr(ast(src), shadowed)).toMatchObject([{ code: "unknown_name", pos }]);
      expect(evalError(src, over)).toEqual({ code: "unknown_name", pos });
    }
  });

  it("a table stored as null is no table, in the static check as at evaluation", () => {
    expect(checkExpr(ast("lookup('t',a)"), { scope: { a: "value" }, tables: { t: null } })).toMatchObject([{ code: "unknown_table", pos: 7 }]);
    expect(evalError("lookup('t',a)", { tables: { t: null as never } })).toEqual({ code: "unknown_table", pos: 7 });
  });

  it("a table's name is one whole string, whatever dots it holds, in the static check as at evaluation", () => {
    const tables = { "a.b": { k: 1 } };
    expect(checkExpr(ast("lookup('a.b','k')"), { scope: {}, tables })).toEqual([]);
    expect(value("lookup('a.b','k')", { tables })).toBe(1);
    expect(checkExpr(ast("lookup('a','k')"), { scope: {}, tables })).toMatchObject([{ code: "unknown_table", pos: 7 }]);
    expect(evalError("lookup('a','k')", { tables })).toEqual({ code: "unknown_table", pos: 7 });
  });

  it("a fault in what it was given comes back as a finding", () => {
    const scope = {
      get a(): "value" {
        throw new Error("boom");
      },
    };
    expect(checkExpr(ast("nope+a"), { scope })).toEqual([
      { code: "unknown_name", message: "unknown name nope", pos: 0 },
      { code: "internal", message: "boom", pos: 0 },
    ]);
  });

  it("reads the longest chain a parse accepts", () => {
    const longest = `1${"+1".repeat(Math.floor((MAX_EXPR_LENGTH - 1) / 2))}`;
    expect(checkExpr(ast(longest), declared)).toEqual([]);
  });

  it("works without tables or groups declared", () => {
    expect(checkExpr(ast("lookup('price',a)"), { scope: { a: "value" } })).toMatchObject([{ code: "unknown_table" }]);
    expect(checkExpr(ast("sum(rows,1)"), { scope: {} })).toMatchObject([{ code: "unknown_name" }]);
    expect(evalError("sum(rows,1)", { groups: undefined })).toEqual({ code: "unknown_name", pos: 4 });
  });
});

describe("the budget bounds parsing and evaluation", () => {
  const deep = MAX_EXPR_DEPTH;

  it("is the contract's numbers", () => {
    expect(EXPR_BUDGET).toBe(100_000);
    expect(MAX_EXPR_LENGTH).toBe(2048);
    expect(MAX_EXPR_DEPTH).toBe(256);
  });

  it("refuses long input, to the character", () => {
    expect(parseError(`${" ".repeat(MAX_EXPR_LENGTH - 1)}1`)).toBe("parsed");
    expect(parseError(`${" ".repeat(MAX_EXPR_LENGTH)}1`)).toEqual({ code: "too_long", pos: MAX_EXPR_LENGTH });
    expect(parseError("1+".repeat(1_000_000))).toEqual({ code: "too_long", pos: MAX_EXPR_LENGTH });
  });

  it.each<[string, (n: number) => string]>([
    ["parentheses", (n) => `${"(".repeat(n)}1${")".repeat(n)}`],
    ["minus signs", (n) => `${"-".repeat(n)}1`],
    ["negations", (n) => `${"!".repeat(n)}true`],
    ["calls", (n) => `${"ceil(".repeat(n)}1${")".repeat(n)}`],
    ["right operands", (n) => `${"1+(".repeat(n)}1${")".repeat(n)}`],
  ])("refuses deep %s, to the level", (_what, nest) => {
    expect(parseError(nest(deep - 1))).toBe("parsed");
    expect(parseError(nest(deep))).toMatchObject({ code: "too_deep" });
    expect(parseError(nest(deep + 1))).toMatchObject({ code: "too_deep" });
  });

  it("says where it gave up", () => {
    expect(parseError(`${"(".repeat(deep)}1`)).toEqual({ code: "too_deep", pos: deep });
    expect(parseError(`${"(".repeat(4000)}`)).toEqual({ code: "too_long", pos: MAX_EXPR_LENGTH });
  });

  it("the longest chain a parse accepts evaluates without reaching the stack limit", () => {
    const terms = Math.floor((MAX_EXPR_LENGTH + 1) / 2);
    expect(value(`1${"+1".repeat(terms - 1)}`)).toBe(terms);
    expect(value(`${"-".repeat(deep - 1)}1`)).toBe(deep % 2 === 0 ? -1 : 1);
    expect(value(`${"ceil(".repeat(deep - 1)}1${")".repeat(deep - 1)}`)).toBe(1);
    expect(value(`${"(".repeat(deep - 1)}1${")".repeat(deep - 1)}`)).toBe(1);
    expect(evalError(`a${".a".repeat(terms - 1)}`)).toEqual({ code: "unknown_name", pos: 0 });
    expect(value(`max(${"1,".repeat(terms - 3)}2)`)).toBe(2);
  });

  it("counts node visits: exactly what is spent, and no further", () => {
    const src = "1+2"; // three nodes
    const run = (left: number) => {
      const budget = { left };
      return { out: evalExpr(ast(src), env({ budget })), left: budget.left };
    };
    expect(run(3)).toEqual({ out: { ok: true, value: 3 }, left: 0 });
    expect(run(2).out).toMatchObject({ ok: false, error: { code: "budget" } });
    expect(run(0).out).toMatchObject({ ok: false, error: { code: "budget", pos: 1 } });
  });

  it("is shared by every expression of one evaluation", () => {
    const budget = { left: 5 };
    expect(evalExpr(ast("1+2"), env({ budget })).ok).toBe(true);
    expect(budget.left).toBe(2);
    expect(evalExpr(ast("1+2"), env({ budget }))).toMatchObject({ ok: false, error: { code: "budget" } });
  });

  it("nested folds over long lists stop at the budget instead of running on", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ v: i }));
    const groups = { l: { as: "x", items } };
    const budget = { left: EXPR_BUDGET };
    const out = evalExpr(ast("sum(l,sum(l,sum(l,sum(l,sum(l,x.v)))))"), env({ groups, budget }));
    expect(out).toMatchObject({ ok: false, error: { code: "budget" } });
    expect(budget.left).toBeLessThan(0);
  });

  it("a walk over the lines is charged, so qty inside a fold cannot multiply unpaid work", () => {
    const budget = { left: 100 };
    expect(evalExpr(ast("qty('leg')"), env({ budget }))).toEqual({ ok: true, value: 8 });
    expect(budget.left).toBe(100 - 2 - LINES.length);
    const lines = Array.from({ length: 1000 }, () => ({ qty: 1, tags: ["t"] }));
    expect(evalExpr(ast("sum(rows,qty('t'))"), env({ lines, budget: { left: 2000 } }))).toMatchObject({ ok: false, error: { code: "budget" } });
    expect(evalExpr(ast("sum(rows,firstQty('t'))"), env({ lines, budget: { left: 2000 } }))).toMatchObject({ ok: false, error: { code: "budget" } });
  });
});

describe("argument counts", () => {
  const list = "rows";
  const shapes: Record<string, { fewest: string[]; most: string[] | null }> = {
    ceil: { fewest: ["1"], most: ["1"] },
    floor: { fewest: ["1"], most: ["1"] },
    round: { fewest: ["1"], most: ["1"] },
    roundd: { fewest: ["1"], most: ["1", "2"] },
    min: { fewest: ["1"], most: null },
    max: { fewest: ["1"], most: null },
    if: { fewest: ["true", "1", "2"], most: ["true", "1", "2"] },
    coalesce: { fewest: ["1"], most: null },
    lookup: { fewest: ["'price'", "'red'"], most: null },
    lookupOr: { fewest: ["1", "'price'", "'red'"], most: null },
    hasKey: { fewest: ["'price'", "'red'"], most: null },
    sum: { fewest: [list, "1"], most: [list, "1"] },
    count: { fewest: [list], most: [list, "true"] },
    any: { fewest: [list, "true"], most: [list, "true"] },
    first: { fewest: [list, "1"], most: [list, "1"] },
    qty: { fewest: ["'leg'"], most: ["'leg'"] },
    firstQty: { fewest: ["'leg'"], most: ["'leg'"] },
    priceOf: { fewest: ["'p-1'"], most: ["'p-1'"] },
  };

  it("names a shape for every function", () => {
    expect(Object.keys(shapes).sort()).toEqual([...EXPR_FUNCTIONS].sort());
  });

  it.each(Object.entries(shapes))("%s takes what it says and refuses one less and one more", (fn, { fewest, most }) => {
    expect(parseError(`${fn}(${fewest.join(",")})`)).toBe("parsed");
    expect(parseError(`${fn}(${fewest.slice(0, -1).join(",")})`)).toEqual({ code: "arity", pos: 0 });
    if (most) {
      expect(parseError(`${fn}(${most.join(",")})`)).toBe("parsed");
      expect(parseError(`${fn}(${[...most, "1"].join(",")})`)).toEqual({ code: "arity", pos: 0 });
    } else {
      expect(parseError(`${fn}(${[...fewest, "'a'", "'b'", "'c'"].join(",")})`)).toBe("parsed");
    }
  });

  it("says so inside an expression, reached or not", () => {
    expect(parseError("1+ceil()")).toEqual({ code: "arity", pos: 2 });
    expect(parseError("false&&any(rows)")).toEqual({ code: "arity", pos: 7 });
    expect(parseError("if(true,1)")).toEqual({ code: "arity", pos: 0 });
  });

  it.each<[string, ExprErrorCode, number]>([
    ["sum(1,2)", "not_a_list", 4],
    ["count('rows')", "not_a_list", 6],
    ["any(ceil(1),true)", "not_a_list", 4],
    ["first((1),2)", "not_a_list", 7],
    ["lookup(colour,'a')", "table_not_literal", 7],
    ["lookup(1,'a')", "table_not_literal", 7],
    ["hasKey(null,'a')", "table_not_literal", 7],
    ["lookupOr('price',colour,'a')", "table_not_literal", 17],
    ["lookup(if(true,'price','price'),'a')", "table_not_literal", 7],
  ])("%s has the wrong kind of argument", (src, code, pos) => {
    expect(parseError(src)).toEqual({ code, pos });
  });
});

describe("no exponent", () => {
  it.each<[string, number]>([
    ["1e5", 1],
    ["1E5", 1],
    ["1e-9", 1],
    ["1e+9", 1],
    ["1.5e3", 3],
    ["2e", 1],
    ["0x10", 1],
    ["1_000", 1],
    ["2**3", 2],
    ["2^3", 1],
    ["2 ** 3", 3],
    ["pow(2,3)", -1],
  ])("%s is no number and no power", (src, pos) => {
    const got = parseError(src);
    if (pos < 0) return expect(got).toEqual({ code: "unknown_function", pos: 0 });
    expect(got).toEqual({ code: "syntax", pos });
  });

  it("a decimal stays a decimal", () => {
    expect(value("0.000000001")).toBe(1e-9);
    expect(parseError("1 e")).toEqual({ code: "syntax", pos: 2 });
    expect(parseExpr("1e-9")).toMatchObject({ ok: false, error: { message: expect.stringContaining("0.000000001") } });
  });

  it("a number too long to hold is refused, not read as infinity", () => {
    expect(parseError(`1${"0".repeat(400)}`)).toEqual({ code: "syntax", pos: 0 });
  });
});

describe("nothing is coerced", () => {
  it.each<[string, ExprErrorCode, number]>([
    ["1+'1'", "type", 2],
    ["'1'+1", "type", 0],
    ["'a'+'b'", "type", 0],
    ["nil+1", "type", 0],
    ["1+nil", "type", 2],
    ["yes+1", "type", 0],
    ["1-true", "type", 2],
    ["'2'*2", "type", 0],
    ["2/'2'", "type", 2],
    ["'a'<'b'", "type", 0],
    ["1<null", "type", 2],
    ["null<=1", "type", 0],
    ["true>false", "type", 0],
    ["1>='1'", "type", 3],
    ["-'a'", "type", 1],
    ["-null", "type", 1],
    ["!1", "type", 1],
    ["!null", "type", 1],
    ["!'true'", "type", 1],
    ["1&&true", "type", 0],
    ["true&&1", "type", 6],
    ["null||true", "type", 0],
    ["false||1", "type", 7],
    ["if(1,2,3)", "type", 3],
    ["if(null,2,3)", "type", 3],
    ["if('true',2,3)", "type", 3],
    ["ceil('1')", "type", 5],
    ["floor(null)", "type", 6],
    ["round(true)", "type", 6],
    ["min(1,'2')", "type", 6],
    ["max(null,1)", "type", 4],
    ["sum(rows,row.kind)", "type", 9],
    ["count(rows,row.w)", "type", 11],
    ["any(rows,row.note)", "type", 9],
    ["qty(5)", "type", 4],
    ["firstQty(null)", "type", 9],
    ["lookup('price',rec)", "type", 15],
    ["lookupOr(1,'price',rec)", "type", 19],
    ["hasKey('price',rec)", "type", 15],
    ["priceOf(rec)", "type", 8],
  ])("%s is a type error", (src, code, pos) => {
    expect(evalError(src)).toEqual({ code, pos });
  });

  it.each<[string, unknown]>([
    ["1=='1'", false],
    ["1!='1'", true],
    ["null==0", false],
    ["null==false", false],
    ["''==false", false],
    ["0==false", false],
    ["null==null", true],
    ["nil==null", true],
    ["nil!=null", false],
    ["1==1.0", true],
    ["colour=='red'", true],
    ["size==120", false],
    ["rec==rec", true],
    ["rec==rec.deep", false],
    ["rec!=null", true],
    ["-0==0", true],
  ])("%s is %j: == is strict", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it("null is a value, not a number, and coalesce or a guard is how a rule says so", () => {
    expect(evalError("nil<=140")).toEqual({ code: "type", pos: 0 });
    expect(value("nil!=null&&nil<=140")).toBe(false);
    expect(value("coalesce(nil,0)<=140")).toBe(true);
    expect(value("coalesce(nil,null)")).toBe(null);
    expect(value("coalesce(0,5)")).toBe(0);
    expect(value("coalesce(false,true)")).toBe(false);
    expect(value("coalesce('',5)")).toBe("");
    expect(value("coalesce(nil,nil,3)")).toBe(3);
  });

  it.each<[string, number]>([
    ["1/0", 1],
    ["0/0", 1],
    ["-1/zero", 2],
    ["a/(1-1)", 1],
    ["sum(rows,1/zero)", 10],
    ["999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999*999999999999999999999", 307],
  ])("%s is an error, never a value that is no number", (src, pos) => {
    expect(evalError(src)).toEqual({ code: "not_finite", pos });
  });

  it("an overflow in a sum is caught at the sum", () => {
    const big = 1.7e308;
    const groups = { l: { as: "x", items: [{ v: big }, { v: big }] } };
    expect(evalError("sum(l,x.v)", { groups })).toEqual({ code: "not_finite", pos: 0 });
  });

  it("a stored infinity or NaN is no number either", () => {
    for (const x of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      expect(evalError("x+1", { root: { x } })).toEqual({ code: "type", pos: 0 });
    }
  });
});

describe("only what is needed is evaluated", () => {
  const broken = "1+'x'";

  it.each<[string, unknown]>([
    [`if(true,1,${broken})`, 1],
    [`if(false,${broken},2)`, 2],
    [`coalesce(1,${broken})`, 1],
    [`false&&(${broken}==1)`, false],
    [`true||(${broken}==1)`, true],
    [`first(none,${broken})`, null],
    [`any(none,${broken}==1)`, false],
    [`sum(none,${broken})`, 0],
    [`count(none,${broken}==1)`, 0],
    [`any(rows,row.on||${broken}==1)`, true],
  ])("%s is %j", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it.each([`if(false,1,${broken})`, `if(true,${broken},2)`, `coalesce(null,${broken})`, `true&&(${broken}==1)`, `false||(${broken}==1)`, `first(rows,${broken})`, `sum(rows,${broken})`, `count(rows,${broken}==1)`, `any(rows,${broken}==1)`, `lookupOr(${broken},'price','red')`])(
    "%s reaches the error",
    (src) => {
      expect(evalExpr(ast(src), env())).toMatchObject({ ok: false, error: { code: "type" } });
    },
  );

  it("any stops at the first true, count does not", () => {
    const spent = (src: string) => {
      const budget = { left: 1000 };
      expect(evalExpr(ast(src), env({ budget })).ok).toBe(true);
      return 1000 - budget.left;
    };
    expect(spent("any(rows,row.on)")).toBe(2);
    expect(spent("count(rows,row.on)")).toBe(4);
  });
});

describe("lists", () => {
  it.each<[string, unknown]>([
    ["sum(rows,row.w)", 8],
    ["sum(none,1)", 0],
    ["sum(rows,a)", 9],
    ["sum(rows,row.w*a)", 24],
    ["sum(rows,sum(row.subs,s.v*row.w))", 2.5 + 6.25 + 15],
    ["count(rows)", 3],
    ["count(none)", 0],
    ["count(rows,row.on)", 2],
    ["count(rows,row.h>100)", 2],
    ["count(rows,false)", 0],
    ["any(rows,row.w>3)", true],
    ["any(rows,row.w>9)", false],
    ["first(rows,row.w)", 2.5],
    ["first(rows,row.kind)", "tall"],
    ["first(none,e.v)", null],
    ["coalesce(first(none,e.v),false)", false],
    ["count(rows,count(row.subs)>0)", 2],
    ["first(rows,sum(row.subs,s.v))", 3.5],
  ])("%s is %j", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it("the element is bound inside the fold and gone after it", () => {
    expect(evalError("sum(rows,row.w)+row.w")).toEqual({ code: "unknown_name", pos: 16 });
    expect(value("sum(rows,row.w)+row.w", { scope: { row: { w: 100 } } })).toBe(108);
  });

  it("the element shadows a name, and the outer one comes back", () => {
    const groups = { l: { as: "a", items: [{ v: 1 }, { v: 2 }] } };
    expect(value("sum(l,a.v)+a", { groups, root: { a: 10 } })).toBe(13);
    expect(value("sum(l,a.v)+a", { groups, root: {}, scope: { a: 20 } })).toBe(23);
  });

  it("takes a list bound to a name, as line.holes, and an inner fold sees the outer element", () => {
    const line = { holes: { as: "g", items: [{ w: 1 }, { w: 2 }] }, k: 10 };
    const scope = { line };
    expect(value("sum(line.holes,g.w*line.k)", { scope })).toBe(30);
    expect(value("count(line.holes)", { scope })).toBe(2);
    expect(value("any(line.holes,g.w==2)", { scope })).toBe(true);
    expect(value("first(line.holes,g.w)", { scope })).toBe(1);
  });

  it("a group wins over a bound name of the same name", () => {
    const scope = { rows: { as: "r", items: [] } };
    expect(value("count(rows)", { scope })).toBe(3);
  });

  it.each<[string, ExprErrorCode, number]>([
    ["sum(a,1)", "not_a_list", 4],
    ["count(rec)", "not_a_list", 6],
    ["any(rec.deep,true)", "not_a_list", 4],
    ["first(colour,1)", "not_a_list", 6],
    ["sum(nope,1)", "unknown_name", 4],
    ["sum(rec.nope,1)", "unknown_name", 4],
    ["sum(rows.w,1)", "unknown_name", 4],
  ])("%s is refused", (src, code, pos) => {
    expect(evalError(src)).toEqual({ code, pos });
  });

  it("a thing with items but no name for its element is no list", () => {
    expect(evalError("sum(x,1)", { root: { x: { items: [] } } })).toEqual({ code: "not_a_list", pos: 4 });
    expect(evalError("sum(x,1)", { root: { x: { as: "y", items: "no" } } })).toEqual({ code: "not_a_list", pos: 4 });
  });
});

describe("tables", () => {
  it.each<[string, unknown]>([
    ["lookup('price','red')", 5],
    ["lookup('price',colour)", 5],
    ["lookup('price',colour,size)", 11],
    ["lookup('price',size)", 13],
    ["lookup('price',120)", 13],
    ["lookup('price',0.5)", 17],
    ["lookup('price',b)", 17],
    ["lookup('price',true)", 19],
    ["lookup('price',null)", 23],
    ["lookupOr(1,'price','red')", 5],
    ["lookupOr(1,'price','nope')", 1],
    ["lookupOr(1,'price',colour,size)", 11],
    ["lookupOr(1,'empty','red')", 1],
    ["lookupOr(nil,'empty','red')", null],
    ["hasKey('price','red')", true],
    ["hasKey('price','nope')", false],
    ["hasKey('price',colour,size)", true],
    ["hasKey('empty','red')", false],
    ["hasKey('price',zero)", false],
  ])("%s is %j", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it("a stored null is a hit", () => {
    const tables = { t: { k: null } };
    expect(value("lookup('t','k')", { tables })).toBe(null);
    expect(value("lookupOr(1,'t','k')", { tables })).toBe(null);
    expect(value("hasKey('t','k')", { tables })).toBe(true);
  });

  it.each<[string, ExprErrorCode, number]>([
    ["lookup('price','nope')", "lookup_miss", 0],
    ["1+lookup('price',zero)", "lookup_miss", 2],
    ["lookup('price','red','120','x')", "lookup_miss", 0],
    ["lookup('nope','red')", "unknown_table", 7],
    ["lookupOr(1,'nope','red')", "unknown_table", 11],
    ["hasKey('nope','red')", "unknown_table", 7],
  ])("%s is refused: a missing key is never a quiet default", (src, code, pos) => {
    expect(evalError(src)).toEqual({ code, pos });
  });

  it("works with no tables at all", () => {
    expect(evalError("lookup('price','red')", { tables: undefined })).toEqual({ code: "unknown_table", pos: 7 });
  });
});

describe("qty, firstQty, priceOf", () => {
  it.each<[string, number]>([
    ["qty('leg')", 8],
    ["qty('foot')", 5],
    ["qty('shelf')", 2],
    ["qty('nope')", 0],
    ["firstQty('leg')", 3],
    ["firstQty('foot')", 5],
    ["firstQty('nope')", 0],
    ["priceOf('p-1')", 1250],
    ["priceOf(lookup('parts',colour))", 1250],
  ])("%s is %d", (src, want) => {
    expect(value(src)).toBe(want);
  });

  it("works with no lines at all", () => {
    expect(value("qty('leg')", { lines: undefined })).toBe(0);
    expect(value("firstQty('leg')", { lines: [] })).toBe(0);
  });

  it("refuses a line whose quantity is not whole, only when it counts it", () => {
    const lines = [{ qty: 1.5, tags: ["bad"] }, { qty: 2, tags: ["good"] }];
    expect(evalError("qty('bad')", { lines })).toEqual({ code: "not_an_integer", pos: 0 });
    expect(evalError("firstQty('bad')", { lines })).toEqual({ code: "not_an_integer", pos: 0 });
    expect(value("qty('good')", { lines })).toBe(2);
    expect(value("firstQty('good')", { lines })).toBe(2);
    expect(evalError("1+qty('x')", { lines: [{ qty: Number.NaN, tags: ["x"] }] })).toEqual({ code: "not_an_integer", pos: 2 });
  });

  it("a part outside the catalogue is its own error, so a rule can tell it from a mistake", () => {
    expect(evalError("priceOf('nope')")).toEqual({ code: "part_unavailable", pos: 0 });
    expect(evalError("1+priceOf('nope')")).toEqual({ code: "part_unavailable", pos: 2 });
    expect(evalError("priceOf('p-1')", { catalog: undefined })).toEqual({ code: "part_unavailable", pos: 0 });
    expect(evalError("priceOf('x')", { catalog: { x: {} as { unitOre: number } } })).toEqual({ code: "type", pos: 0 });
  });
});

describe("evalInteger: where a whole number is demanded", () => {
  const integer = (src: string, over?: Partial<ExprEnv>) => evalInteger(ast(src), env(over));

  it.each<[string, number]>([
    ["1", 1],
    ["0", 0],
    ["ceil(1.2)", 2],
    ["-3", -3],
    ["2.5*2", 5],
    ["9007199254740991", 9007199254740991],
  ])("%s is %d", (src, want) => {
    expect(integer(src)).toEqual({ ok: true, value: want });
  });

  it.each<[string, number]>([
    ["1.5", 0],
    ["a/2", 1],
    ["0.1+0.2", 3],
    ["'1'", 0],
    ["true", 0],
    ["null", 0],
    ["nil", 0],
    ["rec", 0],
    ["9007199254740992", 0],
  ])("%s is refused", (src, pos) => {
    expect(integer(src)).toMatchObject({ ok: false, error: { code: "not_an_integer", pos } });
  });

  it("hands on an error from the expression", () => {
    expect(integer("nope")).toMatchObject({ ok: false, error: { code: "unknown_name" } });
    expect(integer("1/0")).toMatchObject({ ok: false, error: { code: "not_finite" } });
    expect(integer("priceOf('nope')")).toMatchObject({ ok: false, error: { code: "part_unavailable" } });
  });
});

describe("errors are values", () => {
  it("every exported function answers a hostile source without throwing", () => {
    const hostile = [
      "(".repeat(100_000),
      ")".repeat(100_000),
      "-".repeat(1_000_000),
      "(".repeat(MAX_EXPR_LENGTH),
      "-".repeat(MAX_EXPR_LENGTH),
      "!".repeat(MAX_EXPR_LENGTH),
      `${"ceil(".repeat(400)}`,
      `${"if(true,".repeat(250)}`,
      "'".repeat(MAX_EXPR_LENGTH),
      `'${"x".repeat(MAX_EXPR_LENGTH - 1)}`,
      `'${"\\".repeat(MAX_EXPR_LENGTH - 1)}`,
      "a.".repeat(1000),
      "\u0000",
      "\ud83d",
      "😀",
      "${a}",
      "<script>",
      "a\\u005f",
      `${"sum(rows,".repeat(200)}1${")".repeat(200)}`,
    ];
    for (const src of hostile) {
      const parsed = parseExpr(src);
      if (!parsed.ok) {
        expect(parsed.error.pos, src.slice(0, 30)).toBeGreaterThanOrEqual(0);
        expect(parsed.error.pos, src.slice(0, 30)).toBeLessThanOrEqual(src.length);
        expect(typeof parsed.error.message).toBe("string");
        continue;
      }
      expect(typeof evalExpr(parsed.value, env()).ok).toBe("boolean");
    }
  });

  it("a source that is not a string is an error, not a crash", () => {
    for (const src of [1, null, undefined, {}, ["1"], true]) {
      expect(parseExpr(src as unknown as string)).toMatchObject({ ok: false, error: { code: "syntax", pos: 0 } });
    }
  });

  it("a fault in the data becomes a value too, with no stack in it", () => {
    const root = {
      get x(): number {
        throw new Error("boom");
      },
    };
    const out = evalExpr(ast("x+1"), env({ root }));
    expect(out).toEqual({ ok: false, error: { code: "internal", message: "boom", pos: 0 } });
    const thrown = {
      get x(): number {
        throw "text";
      },
    };
    expect(evalInteger(ast("x"), env({ root: thrown }))).toEqual({ ok: false, error: { code: "internal", message: "text", pos: 0 } });
  });

  it("no error carries more than a code, a message and a position", () => {
    for (const out of [parseExpr("1+"), evalExpr(ast("nope"), env()), evalInteger(ast("1.5"), env())]) {
      expect(out.ok).toBe(false);
      if (!out.ok) expect(Object.keys(out.error).sort()).toEqual(["code", "message", "pos"]);
    }
  });
});

describe("what the language is built from", () => {
  const source = readFileSync(path.resolve(__dirname, "../../lib/configurator/expr.ts"), "utf8");

  it("imports nothing, and has no eval, Function or server-only", () => {
    expect(source).not.toMatch(/^\s*import\s+(?!type\b)/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(/);
    expect(source).not.toMatch(/server-only/);
  });

  it("is claimed by the webshop module, which the site profile leaves out", () => {
    expect(getModuleManifest("webshop")?.files.map((f) => f.path)).toContain("lib/configurator");
    expect(getProfile("site")?.modules).not.toContain("webshop");
  });
});

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Appendix A of the contract's spec, section A: the interpreter behind its measurements. Unchanged but for type annotations, less its template helper. */
const proto = (() => {
  class RuleError extends Error { code: string; constructor(code: string, d: any) { super(`${code}: ${d}`); this.code = code; } }
  class Refusal extends Error { code: string; detail: any; constructor(code: string, d: any) { super(code); this.code = code; this.detail = d; } }
  const TOK = /\s*(?:(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)|(==|!=|<=|>=|&&|\|\||[-+*\/<>!(),]))/y;
  const PREC: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6 };
  const CACHE = new Map();
  function parse(src: string): any {
    if (CACHE.has(src)) return CACHE.get(src);
    const t: any[] = []; let i = 0;
    while (i < src.length && src.slice(i).trim() !== '') {
      TOK.lastIndex = i; const m = TOK.exec(src);
      if (!m) throw new RuleError('syntax', `${src} @${i}`);
      i = TOK.lastIndex;
      if (m[1] !== undefined) t.push(['n', Number(m[1])]); else if (m[2] !== undefined) t.push(['s', m[2].replace(/\\(.)/g, '$1')]);
      else if (m[3] !== undefined) t.push(['i', m[3]]); else t.push(['o', m[4]]);
    }
    let p = 0;
    const isOp = (x: any) => t[p] && t[p][0] === 'o' && t[p][1] === x;
    const need = (x: any) => { if (!isOp(x)) throw new RuleError('syntax', `${src}: expected ${x}`); p++; };
    const atom = (): any => {
      const k = t[p]; if (!k) throw new RuleError('syntax', `${src}: unexpected end`);
      if (isOp('-') || isOp('!')) { p++; return ['un', k[1], atom()]; }
      if (isOp('(')) { p++; const e = bin(0); need(')'); return e; }
      if (k[0] === 'n' || k[0] === 's') { p++; return ['lit', k[1]]; }
      if (k[0] === 'i') {
        p++;
        if (k[1] === 'true') return ['lit', true]; if (k[1] === 'false') return ['lit', false]; if (k[1] === 'null') return ['lit', null];
        if (isOp('(')) { p++; const a = []; if (!isOp(')')) { a.push(bin(0)); while (isOp(',')) { p++; a.push(bin(0)); } } need(')'); return ['call', k[1], a]; }
        return ['var', k[1]];
      }
      throw new RuleError('syntax', `${src}: unexpected ${k[1]}`);
    };
    const bin = (m: any): any => { let l = atom(); for (;;) { const k = t[p]; if (!k || k[0] !== 'o' || !Object.hasOwn(PREC, k[1]) || PREC[k[1]] <= m) return l; p++; l = ['bin', k[1], l, bin(PREC[k[1]])]; } };
    const ast = bin(0); if (p !== t.length) throw new RuleError('syntax', `${src}: trailing input`);
    CACHE.set(src, ast); return ast;
  }
  const num = (v: any) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new RuleError('type', `number expected, got ${v}`); return v; };
  const bool = (v: any) => { if (typeof v !== 'boolean') throw new RuleError('type', `boolean expected, got ${v}`); return v; };
  function look(name: any, c: any) {
    const [h, ...rest] = name.split('.'); let v;
    if (Object.hasOwn(c.scope, h)) v = c.scope[h]; else if (Object.hasOwn(c.root, h)) v = c.root[h]; else throw new RuleError('unknown_name', name);
    for (const k of rest) { if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k)) throw new RuleError('unknown_name', name); v = v[k]; }
    return v;
  }
  // roundd = half away from zero after 15-digit pre-rounding (PHP < 8.4 `round`); round = Math.round on the raw double.
  function roundd(x: any, n = 0) {
    const pre = Number(num(x).toPrecision(15)), s = String(pre);
    if (s.includes('e')) return Math.round(pre * 10 ** n) / 10 ** n;
    const sh = Number(`${s}e${n}`); const r = Math.sign(sh) * Math.round(Math.abs(sh));
    return Number(`${r}e-${n}`);
  }
  const listOf = (a: any, c: any) => { if (a[0] === 'var') { if (Object.hasOwn(c.groups, a[1])) return c.groups[a[1]]; const v = look(a[1], c); if (v && Array.isArray(v.items)) return v; } throw new RuleError('unknown_list', JSON.stringify(a)); };
  const within = (g: any, it: any, x: any, c: any) => { const s = c.scope; c.scope = { ...s, [g.as]: it }; try { return ev(x, c); } finally { c.scope = s; } };
  const tkey = (a: any, c: any) => a.map((x: any) => String(ev(x, c))).join(':');
  const tbl = (a: any, c: any) => { const n = ev(a, c), t = c.def.tables ?? {}; if (!Object.hasOwn(t, n)) throw new RuleError('unknown_table', n); return t[n]; };
  const taggedLines = (a: any, c: any) => { const tag = ev(a, c); return c.lines.filter((l: any) => l.tags.includes(tag)); };
  const FN: Record<string, (a: any, c: any) => any> = {
    ceil: (a, c) => Math.ceil(num(ev(a[0], c))), floor: (a, c) => Math.floor(num(ev(a[0], c))),
    round: (a, c) => Math.round(num(ev(a[0], c))), roundd: (a, c) => roundd(ev(a[0], c), a[1] ? num(ev(a[1], c)) : 0),
    min: (a, c) => Math.min(...a.map((x: any) => num(ev(x, c)))), max: (a, c) => Math.max(...a.map((x: any) => num(ev(x, c)))),
    if: (a, c) => (bool(ev(a[0], c)) ? ev(a[1], c) : ev(a[2], c)),
    coalesce: (a, c) => { for (const x of a) { const v = ev(x, c); if (v !== null) return v; } return null; },
    lookup: (a, c) => { const t = tbl(a[0], c), k = tkey(a.slice(1), c); if (!Object.hasOwn(t, k)) throw new RuleError('lookup_miss', k); return t[k]; },
    lookupOr: (a, c) => { const d = ev(a[0], c), t = tbl(a[1], c), k = tkey(a.slice(2), c); return Object.hasOwn(t, k) ? t[k] : d; },
    hasKey: (a, c) => Object.hasOwn(tbl(a[0], c), tkey(a.slice(1), c)),
    sum: (a, c) => { const g = listOf(a[0], c); let t = 0; for (const it of g.items) t += num(within(g, it, a[1], c)); return t; },
    count: (a, c) => { const g = listOf(a[0], c); return a[1] ? g.items.filter((it: any) => bool(within(g, it, a[1], c))).length : g.items.length; },
    any: (a, c) => listOf(a[0], c).items.some((it: any) => bool(within(listOf(a[0], c), it, a[1], c))),
    first: (a, c) => { const g = listOf(a[0], c); return g.items.length ? within(g, g.items[0], a[1], c) : null; },
    priceOf: (a, c) => { const k = String(ev(a[0], c)), p = c.catalog[k]; if (!p) throw new Refusal('part_unavailable', k); return p.unitOre; },
    qty: (a, c) => taggedLines(a[0], c).reduce((s: any, l: any) => s + l.qty, 0),
    firstQty: (a, c) => taggedLines(a[0], c)[0]?.qty ?? 0,
  };
  function ev(a: any, c: any): any {
    if (--c.budget < 0) throw new RuleError('budget', 'evaluation budget exhausted');
    switch (a[0]) {
      case 'lit': return a[1];
      case 'var': return look(a[1], c);
      case 'un': { const v = ev(a[2], c); return a[1] === '-' ? -num(v) : !bool(v); }
      case 'call': if (!Object.hasOwn(FN, a[1])) throw new RuleError('unknown_function', a[1]); return FN[a[1]](a[2], c);
      default: {
        const o = a[1];
        if (o === '&&') return bool(ev(a[2], c)) && bool(ev(a[3], c));
        if (o === '||') return bool(ev(a[2], c)) || bool(ev(a[3], c));
        const x = ev(a[2], c), y = ev(a[3], c);
        if (o === '==') return x === y; if (o === '!=') return x !== y;
        num(x); num(y);
        switch (o) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y; case '<': return x < y; case '<=': return x <= y; case '>': return x > y; default: return x >= y; }
      }
    }
  }
  const E = (src: any, c: any) => ev(parse(String(src)), c);
  return { E, parse, RuleError, Refusal };
})();
/* eslint-enable @typescript-eslint/no-explicit-any */

type Outcome = { ok: true; value: unknown; spent: number } | { ok: false; code: string };

function protoRun(src: string, e: ExprEnv): Outcome {
  const left = e.budget.left;
  const c = { def: { tables: e.tables }, catalog: e.catalog, root: e.root, scope: e.scope ?? {}, groups: e.groups, lines: e.lines, budget: left };
  try {
    const value = proto.E(src, c);
    return { ok: true, value, spent: left - c.budget };
  } catch (err) {
    if (err instanceof proto.RuleError || err instanceof proto.Refusal) return { ok: false, code: err.code };
    return { ok: false, code: `crash: ${String(err)}` };
  }
}
function portRun(src: string, e: ExprEnv): Outcome {
  const left = e.budget.left;
  const parsed = parseExpr(src);
  if (!parsed.ok) return { ok: false, code: parsed.error.code };
  const budget = { left };
  const out = evalExpr(parsed.value, { ...e, budget });
  return out.ok ? { ok: true, value: out.value, spent: left - budget.left } : { ok: false, code: out.error.code };
}
/** The port's name for what the prototype reports. */
const SAME_ERROR: Record<string, string> = { unknown_list: "not_a_list" };

/**
 * The named exception in the differential: roundd of a negative number that rounds to zero. PHP answers -0 and the prototype's String() drops the sign. Nothing in
 * the language can see it (`==`, `<`, a key, a sum with anything but a zero), and the generator divides only by non-zero literals, so it stays a zero.
 */
const sameButRounddsZero = (src: string, a: unknown, b: unknown) => Object.is(a, b) || (a === 0 && b === 0 && src.includes("roundd("));

type Piece = { s: string; cmp: boolean }; // cmp: holds a comparison outside any parentheses

const NUM_LITERALS = ["0", "1", "2", "3", "7", "10", "0.5", "1.5", "2.25", "120", "1000", "0.01", "3.45", "1.15"];
const ROUNDD_LITERALS = ["1.005", "2.5", "-2.5", "0.285", "1.45", "5.055", "35.5", "1000.5", "0.125", "-0.5", "1.499999999999999"];

/**
 * Well-typed expressions with a few wrong atoms mixed in, covering the whole function list. Parentheses
 * are sprinkled at random to exercise precedence, and required only where they keep comparisons from
 * chaining: the prototype reads a chain, the contract's grammar does not (pinned below). Denominators are
 * non-zero literals, for the same reason: `1/0` is pinned below too. And roundd only gets what its two lists above and their
 * products can make, where the prototype's decimal route and PHP agree but for the sign of a zero: proved below over all of them.
 */
function generator(rnd: () => number) {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const chance = (p: number) => rnd() < p;
  const raw = (s: string): Piece => ({ s, cmp: false });
  const sp = () => (chance(0.15) ? " " : "");
  const operand = (x: Piece) => (x.cmp || chance(0.15) ? `(${x.s})` : x.s);
  const arith = (x: Piece, op: string, y: Piece) => raw(`${operand(x)}${sp()}${op}${sp()}${operand(y)}`);
  const compare = (x: Piece, op: string, y: Piece): Piece => ({ s: `${operand(x)}${sp()}${op}${sp()}${operand(y)}`, cmp: true });
  const logic = (x: Piece, op: string, y: Piece): Piece => ({ s: `${x.s}${sp()}${op}${sp()}${y.s}`, cmp: x.cmp || y.cmp });
  const fn = (name: string, ...args: Piece[]) => raw(`${name}(${args.map((a) => a.s).join(",")})`);
  type Binds = readonly string[];
  const wrong = () => raw(pick(["nil", "colour", "yes", "'x'", "null", "nope", "rec.nope", "rows", "row.nope", "true"]));
  const list = (b: Binds) => (b.includes("row") && chance(0.3) ? "row.subs" : pick(["rows", "rows", "none", "a", "nope"]));
  const inner = (name: string, b: Binds): Binds => (name === "rows" ? [...b, "row"] : name === "row.subs" ? [...b, "s"] : name === "none" ? [...b, "e"] : b);
  const numLeaf = (b: Binds) => {
    const names = ["a", "b", "neg", "zero", "rec.x", "rec.deep.y", ...(b.includes("row") ? ["row.w", "row.h"] : []), ...(b.includes("s") ? ["s.v"] : []), ...(b.includes("e") ? ["e.v"] : [])];
    return raw(chance(0.5) ? pick(names) : pick(NUM_LITERALS));
  };
  const key = (b: Binds, d: number) => (chance(0.5) ? raw(pick(["'red'", "'blue'", "'120'", "'nope'", "colour", "size", "120", "0.5", "true", "null", "nil"])) : chance(0.5) ? num(d - 1, b) : str(b));
  const str = (b: Binds) => raw(pick(["colour", "size", "'red'", "'tall'", "''", "'it\\'s'", ...(b.includes("row") ? ["row.kind"] : [])]));
  const table = () => pick(["'price'", "'price'", "'price'", "'empty'", "'nope'"]);
  function num(d: number, b: Binds): Piece {
    if (d <= 0 || chance(0.15)) return numLeaf(b);
    if (chance(0.03)) return wrong();
    const n = () => num(d - 1, b);
    const q = () => bool(d - 1, b);
    switch (Math.floor(rnd() * 16)) {
      case 0: return arith(n(), pick(["+", "-", "*"]), n());
      case 1: return arith(n(), pick(["+", "-", "*"]), n());
      case 2: return arith(n(), "/", raw(pick(["2", "0.5", "3", "7", "1000", "0.01", "1.15"])));
      case 3: return raw(`-${operand(n())}`);
      case 4: return fn(pick(["ceil", "floor", "round"]), n());
      case 5: {
        const small = raw(chance(0.5) ? pick(ROUNDD_LITERALS) : `${numLeaf(b).s}*${numLeaf(b).s}`);
        return chance(0.5) ? fn("roundd", small) : fn("roundd", small, raw(pick(["0", "1", "2", "3", "4"])));
      }
      case 6: return fn(pick(["min", "max"]), ...Array.from({ length: 1 + Math.floor(rnd() * 3) }, n));
      case 7: return fn("if", q(), n(), n());
      case 8: return chance(0.5) ? fn("coalesce", raw("nil"), n()) : fn("coalesce", n(), n());
      case 9: return fn("lookup", raw(table()), key(b, d));
      case 10: return fn("lookupOr", n(), raw(table()), key(b, d), ...(chance(0.3) ? [key(b, d)] : []));
      case 11: {
        const l = list(b);
        return fn("sum", raw(l), num(d - 1, inner(l, b)));
      }
      case 12: {
        const l = list(b);
        return chance(0.5) ? fn("count", raw(l)) : fn("count", raw(l), bool(d - 1, inner(l, b)));
      }
      case 13: {
        const l = list(b);
        return fn("first", raw(l), num(d - 1, inner(l, b)));
      }
      case 14: return fn(pick(["qty", "firstQty"]), raw(pick(["'leg'", "'foot'", "'shelf'", "'nope'"])));
      default: return fn("priceOf", raw(pick(["'p-1'", "'p-2'", "'nope'"])));
    }
  }
  function bool(d: number, b: Binds): Piece {
    if (d <= 0 || chance(0.15)) return raw(pick(["true", "false", "yes", "no", ...(b.includes("row") ? ["row.on"] : [])]));
    if (chance(0.03)) return wrong();
    const n = () => num(d - 1, b);
    const q = () => bool(d - 1, b);
    switch (Math.floor(rnd() * 8)) {
      case 0: return logic(q(), pick(["&&", "||"]), q());
      case 1: return raw(`!${operand(q())}`);
      case 2: return compare(n(), pick(["<", "<=", ">", ">="]), n());
      case 3: return compare(n(), pick(["==", "!="]), n());
      case 4: return compare(any(d - 1, b), pick(["==", "!="]), any(d - 1, b));
      case 5: {
        const l = list(b);
        return fn("any", raw(l), bool(d - 1, inner(l, b)));
      }
      case 6: return fn("hasKey", raw(table()), key(b, d));
      default: return fn("if", q(), q(), q());
    }
  }
  function any(d: number, b: Binds): Piece {
    if (chance(0.2)) return raw(pick(["null", "nil", "rec", ...(b.includes("row") ? ["row", "row.note"] : []), "prev", "index"]));
    if (chance(0.25)) return str(b);
    return chance(0.5) ? num(d, b) : bool(d, b);
  }
  return { expression: (d: number) => (chance(0.6) ? num(d, []).s : chance(0.7) ? bool(d, []).s : any(d, []).s) };
}

describe("against the prototype that produced the measurements", () => {
  const scoped = { row: ROWS[0], prev: ROWS[1], index: 1 };

  it("agrees on 25,000 generated expressions: value to the bit but for roundd's zero, error by kind, nodes visited to the node", () => {
    const rnd = seeded(31102026);
    const { expression } = generator(rnd);
    const kinds: Record<string, number> = {};
    const reached = new Set<string>();
    let okExpressions = 0;
    for (let i = 0; i < 25_000; i++) {
      const src = expression(1 + Math.floor(rnd() * 5));
      const over = i % 2 === 0 ? {} : { scope: scoped };
      // With no lines a qty costs the same on both sides, so the node count can be compared too.
      for (const lines of [LINES, []]) {
        const e = env({ ...over, lines });
        const old = protoRun(src, e);
        const port = portRun(src, e);
        if (old.ok && port.ok) {
          expect(sameButRounddsZero(src, port.value, old.value), `${src}: ${String(port.value)} vs ${String(old.value)}`).toBe(true);
          if (lines.length === 0) expect(port.spent, src).toBe(old.spent);
        } else if (!old.ok && !port.ok) {
          expect(port.code, src).toBe(SAME_ERROR[old.code] ?? old.code);
        } else {
          expect.fail(`${src}: the prototype says ${JSON.stringify(old)}, the port ${JSON.stringify(port)}`);
        }
        const kind = port.ok ? "ok" : port.code;
        kinds[kind] = (kinds[kind] ?? 0) + 1;
        if (port.ok) {
          okExpressions++;
          for (const fn of EXPR_FUNCTIONS) if (src.includes(`${fn}(`)) reached.add(fn);
        }
      }
    }
    // Not vacuous: most evaluate, every function ran to a value, and every kind of error came up.
    expect(okExpressions).toBeGreaterThan(25_000);
    expect([...reached].sort()).toEqual([...EXPR_FUNCTIONS].sort());
    for (const kind of ["type", "unknown_name", "not_a_list", "unknown_table", "lookup_miss", "part_unavailable"]) {
      expect(kinds[kind] ?? 0, kind).toBeGreaterThan(50);
    }
    expect(kinds.not_finite).toBeUndefined();
  });

  it("gives roundd only inputs where the two agree but for the sign of a zero: all of them, not a sample", () => {
    const names = [ROOT.a, ROOT.b, ROOT.neg, ROOT.zero, ROOT.rec.x, ROOT.rec.deep.y, ...ROWS.flatMap((r) => [r.w, r.h, ...r.subs.items.map((s) => s.v)])];
    const leaves = [...names, ...NUM_LITERALS.map(Number)];
    const inputs = [...ROUNDD_LITERALS.map(Number), ...leaves.flatMap((x) => leaves.map((y) => x * y))];
    let signs = 0;
    for (const x of inputs) {
      for (const src of ["roundd(x)", "roundd(x,0)", "roundd(x,1)", "roundd(x,2)", "roundd(x,3)", "roundd(x,4)"]) {
        const old = protoRun(src, env({ root: { x } }));
        const port = portRun(src, env({ root: { x } }));
        expect(old.ok && port.ok && sameButRounddsZero(src, port.value, old.value), `${src} with x=${x}: ${JSON.stringify([old, port])}`).toBe(true);
        if (old.ok && port.ok && !Object.is(port.value, old.value)) signs++;
      }
    }
    expect(inputs.length).toBeGreaterThan(500);
    expect(signs).toBeGreaterThan(0);
  });

  it("spends the budget node for node: enough evaluates, one less stops, on both sides", () => {
    const rnd = seeded(7);
    const { expression } = generator(rnd);
    let checked = 0;
    for (let i = 0; i < 3000; i++) {
      const src = expression(3);
      const run = protoRun(src, env({ lines: [], scope: scoped }));
      if (!run.ok) continue;
      checked++;
      expect(protoRun(src, env({ lines: [], scope: scoped, budget: { left: run.spent } })).ok, src).toBe(true);
      expect(portRun(src, env({ lines: [], scope: scoped, budget: { left: run.spent } })).ok, src).toBe(true);
      expect(protoRun(src, env({ lines: [], scope: scoped, budget: { left: run.spent - 1 } })), src).toEqual({ ok: false, code: "budget" });
      expect(portRun(src, env({ lines: [], scope: scoped, budget: { left: run.spent - 1 } })), src).toEqual({ ok: false, code: "budget" });
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it("reads the same language on 30,000 strings of random tokens, less what is refused on purpose", () => {
    const rnd = seeded(424242);
    const tokens = ["1", "0", "2.5", "1e5", "1.", ".5", "'x'", "'", "\"", "a", "rec.x", "rec.", "row", "true", "false", "null", "(", ")", ",", "+", "-", "*", "/", "**", "^", "%", "<", "<=", ">", ">=", "==", "!=", "=", "!", "&&", "||", "&", "|", "?", ":", "[", "]", ".", ";", "ceil(", "min(", "if(", "sum(rows,", "lookup('price',", "nope(", "sum(1,2)", "lookup(a,1)", "ceil()", "if(true)", "nope(1)", "1<2<3", "__proto__", " ", "\n", "\\", "æ"];
    const onPurpose: ExprErrorCode[] = ["forbidden_name", "unknown_function", "arity", "not_a_list", "table_not_literal"];
    const refusedOnPurpose = new Set<string>();
    let both = 0;
    for (let i = 0; i < 30_000; i++) {
      const src = Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => tokens[Math.floor(rnd() * tokens.length)]).join("");
      const port = parseExpr(src);
      let oldParses = true;
      try {
        proto.parse(src);
      } catch {
        oldParses = false;
      }
      if (port.ok) {
        expect(oldParses, `${src} parses here and not in the prototype`).toBe(true);
        both++;
        expect(typeof evalExpr(port.value, env()).ok).toBe("boolean");
        continue;
      }
      expect(port.error.pos, src).toBeGreaterThanOrEqual(0);
      expect(port.error.pos, src).toBeLessThanOrEqual(src.length);
      if (!oldParses) continue;
      const known = onPurpose.includes(port.error.code) || port.error.message.includes("do not chain");
      expect(known, `${src} parses in the prototype and is refused here with ${port.error.code}: ${port.error.message}`).toBe(true);
      refusedOnPurpose.add(port.error.code);
    }
    expect(both).toBeGreaterThan(500);
    expect([...refusedOnPurpose].sort()).toEqual([...onPurpose, "syntax"].sort());
  });

  it("reads a group by its whole dotted name, as the prototype does: the generator names no such group", () => {
    const e = env({ root: {}, groups: { "a.b": { as: "e", items: [{ v: 1 }, { v: 2 }] } } });
    expect(protoRun("sum(a.b,e.v)", e)).toMatchObject({ ok: true, value: 3 });
    for (const src of ["count(a.b)", "sum(a.b,e.v)", "sum(a.b,e.z)", "a.b", "count(a)", "count(a.b.c)"]) expect(portRun(src, e), src).toEqual(protoRun(src, e));
  });

  // Where the contract or its falsification tells the port to differ. Each row runs both, so the prototype's side is measured too.
  it.each<[string, string, unknown, ExprErrorCode | { value: unknown }]>([
    ["a comparison chain, read by the prototype", "1<2==true", true, "syntax"],
    ["a chain of equalities", "1==1==true", true, "syntax"],
    ["a chain that only failed on its type", "1<2<3", { error: "type" }, "syntax"],
    ["a division by zero", "1/0", Number.POSITIVE_INFINITY, "not_finite"],
    ["zero over zero", "0/0", Number.NaN, "not_finite"],
    ["no arguments to min", "min()", Number.POSITIVE_INFINITY, "arity"],
    ["no arguments to coalesce", "coalesce()", null, "arity"],
    ["too few to if", "if(true,1)", 1, "arity"],
    ["extra arguments ignored", "ceil(1,2)", 1, "arity"],
    ["any without a condition, the crash the contract names", "any(rows)", { crash: true }, "arity"],
    ["an unknown function nobody reached", "false&&nope(1)", false, "unknown_function"],
    ["a table named by an expression", "lookup(colour,'a')", { error: "unknown_table" }, "table_not_literal"],
    ["a record as a key", "lookup('price',rec)", { error: "lookup_miss" }, "type"],
    ["a record as a key, with a default", "lookupOr(1,'price',rec)", 1, "type"],
    ["priceOf reading through the prototype chain", "priceOf('constructor')", undefined, "forbidden_name"],
    ["a list's internals", "line.holes.items.length", 0, "unknown_name"],
    ["a number as a tag", "qty(5)", 0, "type"],
    ["fractional places", "roundd(1.5,0.5)", Number.NaN, "not_an_integer"],
    ["negative places, NaN there, PHP's answer here", "roundd(1241757,-3)", Number.NaN, { value: 1242000 }],
    ["half away from zero below 1e-6", "roundd(-0.0000005,6)", -0, { value: -0.000001 }],
    ["a double just below a half, rounded down there", "roundd(50.05499999999995,2)", 50.05, { value: 50.06 }],
    ["the same at 0 places", "roundd(2238450.499999995)", 2238450, { value: 2238451 }],
    ["a row sum that lands there", "roundd(86.44999999999995,1)", 86.4, { value: 86.5 }],
    ["a whole number above 1e15, changed there", "roundd(1000000000000001)", 1000000000000000, { value: 1000000000000001 }],
    ["places beyond the precision, cut to 15 digits there", "roundd(123456789012.34567,4)", 123456789012.346, { value: 123456789012.34567 }],
    ["no pre-round below the unit, lifted to a half there", "roundd(0.4999999999999999)", 1, { value: 0 }],
    ["places no double can scale by, NaN there", "roundd(1.5,400)", Number.NaN, { value: 1.5 }],
    ["the sign of a zero", "roundd(-0.4)", 0, { value: -0 }],
    ["a number too long to hold", `1${"0".repeat(400)}`, Number.POSITIVE_INFINITY, "syntax"],
    ["__proto__ owned by a JSON document", "__proto__", 1, "forbidden_name"],
  ])("differs on purpose: %s", (_why, src, oldValue, portWant) => {
    const e = env({ root: { ...ROOT, ...JSON.parse('{"__proto__":1}') }, scope: { line: { holes: { as: "g", items: [] } } } });
    const old = protoRun(src, e);
    if (oldValue !== null && typeof oldValue === "object" && "error" in oldValue) expect(old).toEqual({ ok: false, code: oldValue.error });
    else if (oldValue !== null && typeof oldValue === "object" && "crash" in oldValue) expect(old).toMatchObject({ ok: false, code: expect.stringContaining("crash") });
    else expect(old).toMatchObject({ ok: true, value: oldValue });
    const port = portRun(src, e);
    if (typeof portWant === "object") expect(port).toMatchObject({ ok: true, value: portWant.value });
    else expect(port).toEqual({ ok: false, code: portWant });
  });
});
