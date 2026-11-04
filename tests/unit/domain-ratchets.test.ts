import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import { FEATURE_MANIFEST } from "@/lib/feature-flags/manifest";
import { CODE_EXT, REPO_ROOT, isEngineCheckout, walkCode } from "../helpers/claims";

/**
 * docs/domain-model.md gives each aggregate one write door. Not all of them are
 * built, and until they are the same write lives in many places. These ratchets
 * pin how many, so each number can only fall. A slice that routes a duplicate
 * through its door lowers the number; the slice that lands it lowers the pin
 * too, or a later change can climb back up to the old figure unnoticed.
 *
 * HOW EACH NUMBER IS COUNTED. Every `.ts`/`.tsx` file under SOURCE_ROOTS and in
 * the repo root is read from disk with the TypeScript parser, so a comment or a
 * string never counts and a call split over several lines does. `scripts/`,
 * `prisma/seed.ts` and `tests/` are left out: they do not run in a shop's
 * requests.
 *
 *  - statusWriters: call sites of `<x>.order.<write>(…)` that set Order.status.
 *    Every create and upsert (a new order always gets a status), and every update
 *    whose `data` names `status` or cannot be read: a variable, a spread or computed
 *    key inside it, or one after it, which can replace it (one before it cannot). Also
 *    `prisma.order` or `prisma.order.update` handed around as a value, since what it
 *    does next is unknown. A value counts on a client's name only (PRISMA_CLIENT_NAMES).
 *  - inlineUnitPrices: the rule `<…>variant?.priceDkk ?? <…>product.priceDkk`, the
 *    same with `||` or after something else is tried first (`x ?? variant… ?? product…`),
 *    or the same choice as a ternary with its branches either way round, anywhere but
 *    lib/pricing.ts, its door.
 *  - productWriterFiles / brandingWriterFiles: files with at least one
 *    `<x>.product.<write>(…)` / `<x>.brandingSettings.<write>(…)`, or that hand
 *    the delegate or a write method around as a value (lib/translations.ts does).
 *    Here and in statusWriters, a cast or parentheses between the delegate, its
 *    method and the call change nothing: the method's name decides.
 *  - staticRuntimeFlagReads: a flag whose tier in lib/feature-flags/manifest.ts is
 *    "runtime", read from the compile-time `brand` of brand.config, imported or
 *    awaited. `brand` may sit behind a cast; `brand.features` may sit behind a cast
 *    or `?? {}`, or go through a local alias or a destructure. TypeScript's binder
 *    says what a name refers to, so a local of the same name is not the config. A
 *    switch in /admin/features cannot reach such a read. Not counted: a read written
 *    as a fallback, meaning the flag's own value on the right side of `??` or in a
 *    default (a parameter's or a destructured prop's). The count cannot see whether a
 *    caller threads the resolved value in: components/ProductCard.tsx's defaults are
 *    spared, though plugins/wishlist/pages/WishlistPage.tsx passes none, so the slice
 *    that takes this number to zero reads those by hand. A cast, `Boolean()` or
 *    `cap &&` around it changes nothing; a read something is worked out from there (a
 *    conditional, a call, a function) counts.
 *
 * Known limits, stated rather than hidden. Not counted: raw SQL (`$executeRaw`), a
 * nested write through a relation, a client destructured or reached by a bracket
 * (`const { order } = prisma`, `prisma["order"]`), a unit price chosen any other way
 * (over two statements, under other names, with something tried between the two, or
 * the holder first: `(variant ?? product).priceDkk`), the features object handed on
 * whole (`render(brand.features)`, `brand.features[k]`), and the config reached any
 * other way (`const b = brand`, `(brand ?? {}).features`, `const { features } = brand`,
 * `import * as`, `(await import(…)).brand`). On the tree these were measured on, the
 * only raw write in these roots goes to ProductEmbedding, only the code that resolves
 * flags hands the object on whole, and none of the other shapes occurs. For the unit
 * price, tests/unit/unit-price-ratchet.test.ts casts a wider net, with a regex.
 *
 * WHY THE PINS ARE `<=` AND ENGINE-ONLY. A profile only removes files, so a
 * scaffold can never exceed what the engine has. But this file ships, and a
 * customer's own `prisma.product.update` is theirs to write: it must not turn
 * their `pnpm test` red. So the pins and the naming rule skip outside the engine
 * (the repo-hygiene probe) and report as SKIPPED. The first block below tests the
 * counting itself on inline fixtures, and that runs everywhere.
 */

/** Measured on the tree of 2026-10-31. Lower a pin in the slice that lowers its number. */
const PINS = {
  statusWriters: 4,
  inlineUnitPrices: 0,
  productWriterFiles: 16,
  brandingWriterFiles: 19,
  staticRuntimeFlagReads: 12,
} as const;

const SOURCE_ROOTS = [
  "app",
  "components",
  "designs",
  "i18n",
  "industry-templates",
  "lib",
  "modules",
  "plugins",
  "verticals",
];

/** The one file the unit-price rule may live in. */
const UNIT_PRICE_DOOR = "lib/pricing.ts";

// ── Reading a source file ────────────────────────────────────────────────────

function parse(text: string, file = "fixture.ts"): ts.SourceFile {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function eachNode(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  ts.forEachChild(root, (child) => eachNode(child, visit));
}

const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

const isCast = (
  node: ts.Node,
): node is ts.ParenthesizedExpression | ts.AsExpression | ts.NonNullExpression | ts.SatisfiesExpression =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isSatisfiesExpression(node);

function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (isCast(cur)) cur = cur.expression;
  return cur;
}

/** `unwrap` going up: the expression with every cast and parenthesis around it. */
function withCasts(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (isCast(cur.parent)) cur = cur.parent;
  return cur;
}

// ── Writes through a Prisma delegate ─────────────────────────────────────────

const WRITE_METHODS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);
const CREATING_METHODS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

/**
 * A delegate handed around counts only on these names: `client.order` or `db.product`
 * can as well be a field on a row. A call says what it does, so that counts on any name.
 */
const PRISMA_CLIENT_NAMES = new Set(["prisma", "tx", "trx"]);

type WriteSite = { node: ts.Node; method: string | null; firstArg: ts.Expression | undefined };

function isPrismaClient(expr: ts.Expression): boolean {
  const client = unwrap(expr);
  if (ts.isIdentifier(client)) return PRISMA_CLIENT_NAMES.has(client.text);
  return ts.isPropertyAccessExpression(client) && PRISMA_CLIENT_NAMES.has(client.name.text);
}

/**
 * `<x>.<model>.<write>(…)` calls, plus `<client>.<model>` (method null) or
 * `<client>.<model>.<write>` (no argument to read) handed around as a value. A cast
 * or parentheses on the way change nothing: `(x.order as T).update(…)`, `x.order!.update(…)`
 * and `(x.order.update as T)(…)` are the same call, and the method's name decides.
 */
function writeSites(sf: ts.SourceFile, model: string): WriteSite[] {
  const sites: WriteSite[] = [];
  eachNode(sf, (node) => {
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== model) return;
    const delegate = withCasts(node);
    const parent = delegate.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === delegate) {
      if (!WRITE_METHODS.has(parent.name.text)) return; // a read, or a field on a row
      const method = withCasts(parent);
      const call = method.parent;
      if (ts.isCallExpression(call) && call.expression === method) {
        sites.push({ node: call, method: parent.name.text, firstArg: call.arguments[0] });
      } else if (isPrismaClient(node.expression)) {
        sites.push({ node: parent, method: parent.name.text, firstArg: undefined });
      }
      return;
    }
    if (isPrismaClient(node.expression)) sites.push({ node, method: null, firstArg: undefined });
  });
  return sites;
}

/** A property's name when the source spells it out. A spread or a computed key has none to read. */
function plainName(prop: ts.ObjectLiteralElementLike): string | null {
  return prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) ? prop.name.text : null;
}

function propertyNamed(obj: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
  return obj.properties.find((p) => plainName(p) === name);
}

/** The `data` a call ends up with: nothing readable if a spread or computed key after it can replace it. */
function finalData(args: ts.ObjectLiteralExpression): ts.ObjectLiteralElementLike | undefined {
  const last = args.properties.findLast((p) => plainName(p) === null || plainName(p) === "data");
  return last && plainName(last) === "data" ? last : undefined;
}

/** True unless the call is plainly a write that leaves Order.status alone. */
function setsOrderStatus(site: WriteSite): boolean {
  if (site.method === null || CREATING_METHODS.has(site.method)) return true;
  if (site.method.startsWith("delete")) return false;
  if (!site.firstArg || !ts.isObjectLiteralExpression(site.firstArg)) return true;
  const data = finalData(site.firstArg);
  if (!data || !ts.isPropertyAssignment(data) || !ts.isObjectLiteralExpression(data.initializer)) return true;
  return data.initializer.properties.some((p) => plainName(p) === null || plainName(p) === "status");
}

function statusWriterLines(sf: ts.SourceFile): number[] {
  return writeSites(sf, "order")
    .filter(setsOrderStatus)
    .map((site) => lineOf(sf, site.node));
}

// ── The inline unit price ────────────────────────────────────────────────────

/** Is `expr` `<…><owner>.priceDkk`, for an owner whose last name segment matches? */
function isPriceOf(expr: ts.Expression, owner: RegExp): boolean {
  const price = unwrap(expr);
  if (!ts.isPropertyAccessExpression(price) || price.name.text !== "priceDkk") return false;
  const holder = unwrap(price.expression);
  if (ts.isIdentifier(holder)) return owner.test(holder.text);
  return ts.isPropertyAccessExpression(holder) && owner.test(holder.name.text);
}

const VARIANT = /variant$/i;
const PRODUCT = /product$/i;

const isOrElse = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) &&
  (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
    node.operatorToken.kind === ts.SyntaxKind.BarBarToken);

/**
 * What a chain tries last, which is what the next `??` falls back from. These operators
 * associate left: `x ?? a ?? b` parses as `(x ?? a) ?? b`, so before `b` that is `a`.
 */
function lastTried(expr: ts.Expression): ts.Expression {
  const inner = unwrap(expr);
  return isOrElse(inner) ? lastTried(inner.right) : inner;
}

function inlineUnitPriceLines(sf: ts.SourceFile): number[] {
  const lines: number[] = [];
  eachNode(sf, (node) => {
    // `??` and `||` try their left side first, so only the variant first is the rule.
    const variantFirst =
      isOrElse(node) && isPriceOf(lastTried(node.left), VARIANT) && isPriceOf(node.right, PRODUCT);
    // A ternary's condition says which branch is which, so either order is the rule.
    const ternary =
      ts.isConditionalExpression(node) &&
      ((isPriceOf(node.whenTrue, VARIANT) && isPriceOf(node.whenFalse, PRODUCT)) ||
        (isPriceOf(node.whenTrue, PRODUCT) && isPriceOf(node.whenFalse, VARIANT)));
    if (variantFirst || ternary) lines.push(lineOf(sf, node));
  });
  return lines;
}

// ── Static reads of runtime flags ────────────────────────────────────────────

const isConfigPath = (node: ts.Node | undefined): boolean =>
  node !== undefined && ts.isStringLiteralLike(node) && /(^|\/)brand\.config(\.ts)?$/.test(node.text);

/** `await import("@/brand.config")` */
function awaitsConfig(expr: ts.Expression): boolean {
  const awaited = unwrap(expr);
  if (!ts.isAwaitExpression(awaited) || !ts.isCallExpression(awaited.expression)) return false;
  const call = awaited.expression;
  return call.expression.kind === ts.SyntaxKind.ImportKeyword && isConfigPath(call.arguments[0]);
}

/** The names `brand` from brand.config goes by in this file, imported or awaited. */
function brandImports(sf: ts.SourceFile): ts.Identifier[] {
  const names: ts.Identifier[] = [];
  eachNode(sf, (node) => {
    if (ts.isImportDeclaration(node) && isConfigPath(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly && (element.propertyName ?? element.name).text === "brand") names.push(element.name);
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      awaitsConfig(node.initializer)
    ) {
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name;
        if (ts.isIdentifier(key) && key.text === "brand" && ts.isIdentifier(element.name)) names.push(element.name);
      }
    }
  });
  return names;
}

/**
 * What a name refers to, answered by TypeScript's own binder, so a local of the
 * same name is another thing however it is declared. The program holds this one
 * file: an import stays unresolved, and all this asks of it is its own identity.
 */
function symbolsOf(sf: ts.SourceFile): (name: ts.Identifier) => ts.Symbol | undefined {
  const host: ts.CompilerHost = {
    getSourceFile: () => sf,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (file) => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (file) => file === sf.fileName,
    readFile: () => undefined,
  };
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] };
  const checker = ts.createProgram([sf.fileName], options, host).getTypeChecker();
  return (name) => checker.getSymbolAtLocation(name);
}

/** `(x as T)`, `x!`, `x satisfies T`, `x ?? {}`: still the same object. */
function isPassThrough(parent: ts.Node, child: ts.Node): boolean {
  if (isCast(parent)) return true;
  return (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    parent.left === child
  );
}

/** `cap && x`, `Boolean(x)`: if this gives a flag at all, it gives x's. */
function keepsValue(parent: ts.Node, child: ts.Node): boolean {
  if (ts.isBinaryExpression(parent)) {
    return parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === child;
  }
  return (
    ts.isCallExpression(parent) &&
    ts.isIdentifier(parent.expression) &&
    parent.expression.text === "Boolean" &&
    parent.arguments[0] === child
  );
}

/**
 * The right side of `??`, or a default (`x = …`, `{ x = … }`): a value resolved at
 * runtime comes first. Only the flag's own value is a fallback, so this looks no
 * further than casts, `Boolean()` and `cap &&`. A read something is worked out from
 * there (a conditional, a call, a function) is a read like any other.
 */
function isFallback(node: ts.Node): boolean {
  let child = node;
  while (isPassThrough(child.parent, child) || keepsValue(child.parent, child)) child = child.parent;
  const parent = child.parent;
  // The walk has already stepped past a left side of `??`, so this can only be the right.
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return true;
  return (ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.initializer === child;
}

function staticFlagReads(sf: ts.SourceFile, runtimeFlags: ReadonlySet<string>): { flag: string; line: number }[] {
  const imported = brandImports(sf);
  if (imported.length === 0) return [];
  const symbolOf = symbolsOf(sf);
  const brand = new Set(imported.flatMap((name) => symbolOf(name) ?? []));
  const reads: { flag: string; line: number }[] = [];
  const followed = new Set<ts.Symbol>();
  const record = (flag: string, node: ts.Node) => {
    if (runtimeFlags.has(flag)) reads.push({ flag, line: lineOf(sf, node) });
  };

  /** `start` is the features object or an alias of it: what is done with it? */
  function follow(start: ts.Node): void {
    let object = start;
    while (isPassThrough(object.parent, object)) object = object.parent;
    const parent = object.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === object) {
      if (!isFallback(parent)) record(parent.name.text, parent);
    } else if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === object &&
      ts.isStringLiteralLike(parent.argumentExpression)
    ) {
      if (!isFallback(parent)) record(parent.argumentExpression.text, parent);
    } else if (ts.isVariableDeclaration(parent) && parent.initializer === object) {
      followBinding(parent.name);
    }
  }

  /** `name` now holds the features object: an alias, or a destructure of it. */
  function followBinding(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) {
      const symbol = symbolOf(name);
      if (!symbol || followed.has(symbol)) return;
      followed.add(symbol);
      eachNode(sf, (candidate) => {
        if (ts.isIdentifier(candidate) && candidate !== name && candidate.text === name.text && symbolOf(candidate) === symbol) {
          follow(candidate);
        }
      });
    } else if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        const key = element.propertyName ?? element.name;
        if (element.dotDotDotToken) followBinding(element.name);
        else if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) record(key.text, element);
      }
    }
  }

  eachNode(sf, (node) => {
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== "features") return;
    const root = unwrap(node.expression);
    if (!ts.isIdentifier(root)) return;
    const symbol = symbolOf(root);
    if (symbol && brand.has(symbol) && !isFallback(node)) follow(node);
  });
  return reads;
}

// ── The tree ─────────────────────────────────────────────────────────────────

type Scan = {
  files: string[];
  statusWriters: string[];
  inlineUnitPrices: string[];
  productWriterFiles: string[];
  brandingWriterFiles: string[];
  staticRuntimeFlagReads: string[];
};

let scanned: Scan | null = null;

const emptyScan = (files: string[] = []): Scan => ({
  files,
  statusWriters: [],
  inlineUnitPrices: [],
  productWriterFiles: [],
  brandingWriterFiles: [],
  staticRuntimeFlagReads: [],
});

/** One file's share of each number. Every file is parsed: no search of its text decides first. */
function scanFile(scan: Scan, file: string, text: string, runtimeFlags: ReadonlySet<string>): Scan {
  const sf = parse(text, file);
  scan.statusWriters.push(...statusWriterLines(sf).map((line) => `${file}:${line}`));
  if (file !== UNIT_PRICE_DOOR) {
    scan.inlineUnitPrices.push(...inlineUnitPriceLines(sf).map((line) => `${file}:${line}`));
  }
  if (writeSites(sf, "product").length > 0) scan.productWriterFiles.push(file);
  if (writeSites(sf, "brandingSettings").length > 0) scan.brandingWriterFiles.push(file);
  scan.staticRuntimeFlagReads.push(
    ...staticFlagReads(sf, runtimeFlags).map(({ flag, line }) => `${file}:${line} ${flag}`),
  );
  return scan;
}

function runtimeFlagKeys(): ReadonlySet<string> {
  return new Set<string>(FEATURE_MANIFEST.filter((d) => d.tier === "runtime").map((d) => d.key));
}

function scanTree(): Scan {
  if (scanned) return scanned;
  const files = [
    ...SOURCE_ROOTS.flatMap((root) => walkCode(root)),
    ...readdirSync(REPO_ROOT).filter((entry) => CODE_EXT.test(entry)),
  ];
  const runtimeFlags = runtimeFlagKeys();
  const scan = emptyScan(files);
  for (const file of files) scanFile(scan, file, readFileSync(path.join(REPO_ROOT, file), "utf8"), runtimeFlags);
  scanned = scan;
  return scan;
}

// ── The naming rule ──────────────────────────────────────────────────────────

type ToolRow = { name: string; scope: string; pack: string };

/**
 * A tool is named `<prefix>.<verb>` and lives in the pack its prefix names,
 * `lib/tools/<prefix>.ts`, so a name says where the code is. These sixteen do
 * not, and they stay as they are: nothing is renamed. The list may only shrink.
 */
const FROZEN_PACK_EXCEPTIONS: readonly string[] = [
  // lib/tools/compose.ts
  "chrome.set",
  "composition.apply",
  "composition.export",
  "design.set_slug",
  "magic.compose_look",
  "vertical.apply",
  // lib/tools/customer.ts, the storefront chat's pack
  "cart.add",
  "cart.get_summary",
  "cart.remove",
  "cart.update_quantity",
  "discounts.try_apply",
  "orders.create",
  "user.get_last_shipping",
  // lib/tools/import.ts
  "content.import_site",
  // lib/tools/three-d.ts
  "three.configure",
  "three.get",
];

/**
 * A pack split in two on purpose. The tools that read a WooCommerce shop go
 * through lib/woo, which belongs to the webshop module, so they reach the
 * registry through the commerce seam (lib/tools/packs/commerce.ts). The name
 * still says `migration`, and a pack may be split like this again.
 */
const SPLIT_PACKS: Readonly<Record<string, string>> = { "migration-woo": "migration", "orders-statuses": "orders" };

/** One scope domain per prefix. These five span two; the list may only shrink. */
const FROZEN_TWO_DOMAIN_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  discounts: ["cart", "discounts"],
  gdpr: ["customer", "settings"],
  images: ["catalog", "settings"],
  magic: ["pages", "settings"],
  products: ["catalog", "products"],
};

/** The form only: whether the part after the dot really is a verb stays a matter for review. */
const TOOL_NAME = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/;

function namingProblems(
  tools: readonly ToolRow[],
  frozenPacks: readonly string[],
  frozenDomains: Readonly<Record<string, readonly string[]>>,
): string[] {
  const problems: string[] = [];
  const domains = new Map<string, Set<string>>();
  const deviating = new Set<string>();

  for (const { name, scope, pack } of tools) {
    if (!TOOL_NAME.test(name)) problems.push(`${name} is not <prefix>.<verb>`);
    const prefix = name.split(".")[0];
    if ((SPLIT_PACKS[pack] ?? pack) !== prefix) deviating.add(name);
    const domain = scope.split(":")[0];
    domains.set(prefix, (domains.get(prefix) ?? new Set()).add(domain));
  }
  for (const name of deviating) {
    if (!frozenPacks.includes(name)) problems.push(`${name} does not live in lib/tools/${name.split(".")[0]}.ts`);
  }
  for (const name of frozenPacks) {
    if (!deviating.has(name)) problems.push(`${name} no longer deviates: strike it from the frozen list`);
  }
  for (const [prefix, seen] of domains) {
    const observed = [...seen].sort();
    const frozen = frozenDomains[prefix];
    if (!frozen && observed.length > 1) problems.push(`${prefix}.* spans scope domains ${observed.join(", ")}`);
    if (frozen && observed.join() !== frozen.join()) {
      problems.push(`${prefix}.* spans ${observed.join(", ")}, frozen at ${frozen.join(", ")}: update the frozen list only downward`);
    }
  }
  for (const prefix of Object.keys(frozenDomains)) {
    if (!domains.has(prefix)) problems.push(`${prefix}.* has no tools left: strike it from the frozen list`);
  }
  return problems;
}

/** Every tool definition at the top level of lib/tools: its name, and the pack file holding it. */
function toolPacks(): Map<string, string> {
  const packs = new Map<string, string>();
  const dir = path.join(REPO_ROOT, "lib", "tools");
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".ts")) continue;
    const sf = parse(readFileSync(path.join(dir, entry), "utf8"), entry);
    eachNode(sf, (node) => {
      if (!ts.isObjectLiteralExpression(node) || !propertyNamed(node, "handler")) return;
      const name = propertyNamed(node, "name");
      if (name && ts.isPropertyAssignment(name) && ts.isStringLiteralLike(name.initializer)) {
        packs.set(name.initializer.text, entry.replace(/\.ts$/, ""));
      }
    });
  }
  return packs;
}

// ── The counting itself (runs everywhere: pure functions on inline text) ─────

describe("how the ratchets count", () => {
  const statusWrites = (text: string) => statusWriterLines(parse(text)).length;
  const inlinePrices = (text: string) => inlineUnitPriceLines(parse(text)).length;
  const writesModel = (text: string, model: string) => writeSites(parse(text), model).length;
  const flagReads = (text: string, file?: string) =>
    staticFlagReads(parse(text, file), new Set(["blog", "reviews"])).map((r) => r.flag);
  const brandImport = `import { brand } from "@/brand.config";\n`;

  it("a status write counts, on any client and split over lines", () => {
    expect(statusWrites(`prisma.order.update({ where: { id }, data: { status: "paid" } });`)).toBe(1);
    expect(statusWrites(`await tx.order.updateMany({ where, data: { paidAt, "status": to } });`)).toBe(1);
    expect(statusWrites(`await prisma\n  .order\n  .update({ where, data: { status } });`)).toBe(1);
  });

  it("a create and an upsert always set a status", () => {
    expect(statusWrites(`tx.order.create({ data: { email } });`)).toBe(1);
    expect(statusWrites(`prisma.order.upsert({ where, create, update });`)).toBe(1);
  });

  it("a data it cannot read counts, and so does the delegate handed around", () => {
    expect(statusWrites(`prisma.order.update({ where, data: patch });`)).toBe(1);
    expect(statusWrites(`prisma.order.update({ where, data });`)).toBe(1);
    expect(statusWrites(`prisma.order.update({ where, data: { ...patch } });`)).toBe(1);
    expect(statusWrites(`prisma.order.update({ where, data: { [key]: value } });`)).toBe(1);
    expect(statusWrites(`prisma.order.update(args);`)).toBe(1);
    expect(statusWrites(`const orders = prisma.order;`)).toBe(1);
  });

  it("a spread or computed key after `data` can replace it, so that `data` cannot be read", () => {
    expect(statusWrites(`prisma.order.update({ where, data: { carrier }, ...overrides });`)).toBe(1);
    expect(statusWrites(`prisma.order.updateMany({ data: { carrier }, ...(c ? { data: { status } } : {}), where });`)).toBe(1);
    expect(statusWrites(`prisma.order.update({ where, data: { carrier }, [key]: value });`)).toBe(1);
    // Before `data` neither can, and a named key after it is some other argument.
    expect(statusWrites(`prisma.order.update({ ...base, where, data: { carrier } });`)).toBe(0);
    expect(statusWrites(`prisma.order.update({ [key]: value, data: { carrier } });`)).toBe(0);
    expect(statusWrites(`prisma.order.update({ ...base, data: { carrier }, where, select });`)).toBe(0);
    expect(statusWrites(`prisma.order.update({ ...base, data: { status } });`)).toBe(1);
  });

  it("anything else on Order does not count", () => {
    expect(statusWrites(`prisma.order.update({ where, data: { carrier } });`)).toBe(0);
    expect(statusWrites(`prisma.order.update({ "where": where, "data": { "carrier": carrier } });`)).toBe(0);
    expect(statusWrites(`prisma.order.findMany({ where: { status: "paid" } });`)).toBe(0);
    expect(statusWrites(`prisma.order.deleteMany({ where });`)).toBe(0);
    expect(statusWrites(`prisma.orderNote.create({ data: { status: "x" } });`)).toBe(0);
    expect(statusWrites(`item.order;`)).toBe(0);
    expect(statusWrites(`order.update({ data: { status: "paid" } });`)).toBe(0);
  });

  it("a comment or a string never counts", () => {
    expect(statusWrites(`// prisma.order.update({ data: { status: "paid" } })`)).toBe(0);
    expect(statusWrites("const s = `prisma.order.update({ data: { status } })`;")).toBe(0);
  });

  it("a write method handed around counts, since what it does next is unknown", () => {
    expect(statusWrites(`const u = prisma.order.update; await u({ where, data: { status: "paid" } });`)).toBe(1);
    expect(statusWrites(`run(prisma.order.update as Fn);`)).toBe(1);
    expect(statusWrites(`run(tx.order.upsert);`)).toBe(1);
    expect(writesModel(`const u = tx.product.createMany;`, "product")).toBe(1);
    expect(writesModel(`const u = prisma.product.update.bind(other);`, "product")).toBe(1);
    expect(writesModel(`run(prisma.brandingSettings.upsert);`, "brandingSettings")).toBe(1);
  });

  it("a handed-around method that writes no status, a read method or a row's field does not", () => {
    expect(statusWrites(`run(prisma.order.deleteMany);`)).toBe(0);
    expect(statusWrites(`const q = prisma.order.findMany;`)).toBe(0);
    expect(statusWrites(`const u = item.order.update;`)).toBe(0);
    expect(writesModel(`const q = prisma.product.findMany;`, "product")).toBe(0);
  });

  it("a field on a value that merely has a client's sort of name is a read", () => {
    expect(statusWrites(`function format(client: any) { return client.order; }`)).toBe(0);
    expect(statusWrites(`fn(db.order);`)).toBe(0);
    expect(writesModel(`fn(client.product);`, "product")).toBe(0);
    expect(writesModel(`const p = db.product;`, "product")).toBe(0);
    expect(writesModel(`const u = client.product.update;`, "product")).toBe(0);
  });

  it("a call says what it does, so a write counts through any name", () => {
    expect(statusWrites(`client.order.update({ where, data: { status } });`)).toBe(1);
    expect(statusWrites(`await db.order.create({ data });`)).toBe(1);
    expect(writesModel(`db.product.update({ where, data });`, "product")).toBe(1);
    expect(writesModel(`client.brandingSettings.upsert({ where, create, update });`, "brandingSettings")).toBe(1);
  });

  it("a delegate on a real client's name counts when handed around, also behind a property", () => {
    expect(writesModel(`const map = { product: tx.product };`, "product")).toBe(1);
    expect(writesModel(`fn(trx.product);`, "product")).toBe(1);
    expect(statusWrites(`fn(ctx.prisma.order);`)).toBe(1);
    expect(writesModel(`fn((prisma as Db).product);`, "product")).toBe(1);
    expect(statusWrites(`const u = (tx as Db).order.update;`)).toBe(1);
  });

  it("a cast between the delegate, its method and the call changes nothing: the method's name decides", () => {
    // A call, on any name, with its `data` read as ever.
    expect(statusWrites(`(db.order as any).update({ where, data: { status } });`)).toBe(1);
    expect(statusWrites(`db.order!.update({ where, data: { status } });`)).toBe(1);
    expect(statusWrites(`(db.order satisfies Db).update({ where, data: { status } });`)).toBe(1);
    expect(statusWrites(`(db.order).update({ where, data: { status } });`)).toBe(1);
    expect(statusWrites(`(db.order.update as Fn)({ where, data: { status } });`)).toBe(1);
    expect(statusWrites(`((db.order as any).update as Fn)!({ where, data: { status } });`)).toBe(1);
    expect(writesModel(`(client.product as any).update({ where, data });`, "product")).toBe(1);
    expect(writesModel(`db.brandingSettings!.upsert({ where, create, update });`, "brandingSettings")).toBe(1);
    expect(statusWrites(`(db.order as any).update({ where, data: { carrier } });`)).toBe(0);
    expect(statusWrites(`(prisma.order as any).update({ where, data: { carrier } });`)).toBe(0);
    expect(statusWrites(`(prisma.order.update as Fn)({ where, data: { carrier } });`)).toBe(0);
    expect(statusWrites(`(prisma.order as any).deleteMany({ where });`)).toBe(0);
    // A read stays a read, on a client's name too.
    expect(statusWrites(`(prisma.order as any).findMany({ where });`)).toBe(0);
    expect(writesModel(`prisma.product!.findMany();`, "product")).toBe(0);
    expect(writesModel(`const q = (prisma.product as any).findMany;`, "product")).toBe(0);
    // Not called: handed around, which counts on a client's name only.
    expect(statusWrites(`const u = (prisma.order as any).update;`)).toBe(1);
    expect(statusWrites(`run(prisma.order!.upsert);`)).toBe(1);
    expect(statusWrites(`fn(prisma.order as any);`)).toBe(1);
    expect(statusWrites(`const u = (db.order as any).update;`)).toBe(0);
    expect(statusWrites(`fn(db.order as any);`)).toBe(0);
  });

  it("no search of a file's text decides ahead of the parser", () => {
    const scan = (text: string) => scanFile(emptyScan(), "lib/x.ts", text, new Set());
    // A dot before the newline, or a comment after it: a search for `.order` finds neither.
    expect(scan(`prisma.\n  order.update({ where, data: { status: "paid" } });`).statusWriters).toEqual(["lib/x.ts:1"]);
    expect(scan(`prisma. /* the door */ order.update({ where, data: { status } });`).statusWriters).toEqual(["lib/x.ts:1"]);
    expect(scan(`tx.\n  product.update({ where, data });`).productWriterFiles).toEqual(["lib/x.ts"]);
    expect(scan(`tx.\n  brandingSettings.upsert({ where, create, update });`).brandingWriterFiles).toEqual(["lib/x.ts"]);
  });

  it("the unit-price rule may live in its door, and nowhere else", () => {
    const rule = `const p = i.variant?.priceDkk ?? i.product.priceDkk;`;
    expect(scanFile(emptyScan(), "lib/x.ts", rule, new Set()).inlineUnitPrices).toEqual(["lib/x.ts:1"]);
    expect(scanFile(emptyScan(), UNIT_PRICE_DOOR, rule, new Set()).inlineUnitPrices).toEqual([]);
  });

  it("the inline unit price counts as `??`, `||` or a ternary, on any path ending in variant and product", () => {
    expect(inlinePrices(`const p = i.variant?.priceDkk ?? i.product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = (item.variant?.priceDkk ?? item.product.priceDkk) * qty;`)).toBe(1);
    expect(inlinePrices(`const p = variant?.priceDkk ?? product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = line.selectedVariant?.priceDkk ?? line.baseProduct.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = i.variant?.priceDkk || i.product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = i.variant ? i.variant.priceDkk : i.product.priceDkk;`)).toBe(1);
  });

  it("a ternary's condition says which branch is which, so either order is the same rule", () => {
    expect(inlinePrices(`const p = variant == null ? product.priceDkk : variant.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = !i.variant ? i.product.priceDkk : i.variant.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = !line.selectedVariant\n  ? line.baseProduct.priceDkk\n  : line.selectedVariant!.priceDkk;`)).toBe(1);
  });

  it("other prices do not count", () => {
    expect(inlinePrices(`const p = selectedVariant?.priceDkk ?? basePriceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = variant.priceDkk;`)).toBe(0);
    expect(inlinePrices(`// i.variant?.priceDkk ?? i.product.priceDkk`)).toBe(0);
    expect(inlinePrices(`const p = c ? variant.priceDkk : basePriceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = c ? basePriceDkk : variant.priceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = c ? a.variant.priceDkk : b.variant.priceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = c ? a.product.priceDkk : b.product.priceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = hasVariants ? Math.min(...prices) : product.priceDkk;`)).toBe(0);
    expect(inlinePrices(`const extra = variant.priceDkk - product.priceDkk;`)).toBe(0);
  });

  it("the product first is another rule: its price is always there, so the variant never wins", () => {
    expect(inlinePrices(`const p = product.priceDkk ?? variant?.priceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = product.priceDkk || variant?.priceDkk;`)).toBe(0);
  });

  it("`??` and `||` associate left, so the rule at the end of a longer chain is the same rule", () => {
    expect(inlinePrices(`const p = x ?? variant?.priceDkk ?? product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = line.stored ?? line.variant?.priceDkk ?? line.product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = x || variant?.priceDkk || product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = a ?? b ?? variant?.priceDkk ?? product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = (x ?? variant?.priceDkk) ?? product.priceDkk;`)).toBe(1);
    expect(inlinePrices(`const p = (x || (y || variant?.priceDkk)) ?? product.priceDkk;`)).toBe(1);
    // Once, wherever the chain goes on.
    expect(inlinePrices(`const p = variant?.priceDkk ?? product.priceDkk ?? 0;`)).toBe(1);
    expect(inlinePrices(`const p = x ?? variant?.priceDkk ?? product.priceDkk ?? 0;`)).toBe(1);
    // The variant has to come straight before the product, in the same kind of chain.
    expect(inlinePrices(`const p = variant?.priceDkk ?? x ?? product.priceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = x ?? product.priceDkk ?? variant?.priceDkk;`)).toBe(0);
    expect(inlinePrices(`const p = (cap && variant?.priceDkk) ?? product.priceDkk;`)).toBe(0);
  });

  it("a write to the model counts, and so does its delegate handed around", () => {
    expect(writesModel(`prisma.product.update({ where, data });`, "product")).toBe(1);
    expect(writesModel(`tx.product.createMany({ data });`, "product")).toBe(1);
    expect(writesModel(`const map = { product: prisma.product };`, "product")).toBe(1);
    expect(writesModel(`prisma.brandingSettings.upsert({ where, create, update });`, "brandingSettings")).toBe(1);
  });

  it("a read, a row's field or a mention does not", () => {
    expect(writesModel(`prisma.product.findMany();`, "product")).toBe(0);
    expect(writesModel(`const p = item.product;`, "product")).toBe(0);
    expect(writesModel(`// prisma.product.update()`, "product")).toBe(0);
    expect(writesModel(`type U = typeof prisma.product;`, "product")).toBe(0);
    expect(writesModel(`prisma.productVariant.update({ where, data });`, "product")).toBe(0);
  });

  it("a runtime flag read from the compile-time config counts, however it is reached", () => {
    expect(flagReads(`${brandImport}if (brand.features.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}if ((brand.features as { blog?: boolean }).blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}if ((brand.features ?? {}).blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const f = brand.features as R;\nif (f.blog && f.reviews) x();`)).toEqual([
      "blog",
      "reviews",
    ]);
    expect(flagReads(`${brandImport}const { blog, reviews: r } = brand.features;`)).toEqual(["blog", "reviews"]);
    expect(flagReads(`import { brand as cfg } from "../brand.config";\nif (cfg.features.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const on = brand.features["reviews"];`)).toEqual(["reviews"]);
  });

  it("`brand` behind a cast is still the config, and a local behind a cast is still a local", () => {
    expect(flagReads(`${brandImport}if ((brand as Cfg).features.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}if (brand!.features.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}if ((brand satisfies Cfg).features.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}if (((brand as Cfg)!).features.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const { reviews } = (brand as Cfg).features;`)).toEqual(["reviews"]);
    expect(flagReads(`${brandImport}const f = (brand as Cfg).features;\nif (f.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const on = fromDb ?? (brand as Cfg).features.blog;`)).toEqual([]);
    expect(flagReads(`${brandImport}function f(brand) { return (brand as Cfg).features.blog; }`)).toEqual([]);
    expect(flagReads(`${brandImport}function f(brand) { return brand!.features.blog; }`)).toEqual([]);
    expect(flagReads(`${brandImport}if ((other as Cfg).features.blog) x();`)).toEqual([]);
  });

  it("a read the runtime can reach does not count", () => {
    expect(flagReads(`${brandImport}async function f() { const brand = await getBrand(); return brand.features.blog; }`)).toEqual([]);
    expect(flagReads(`${brandImport}function f(brand) { return brand.features.blog; }`)).toEqual([]);
    expect(flagReads(`const brand = await getBrand();\nif (brand.features.blog) x();`)).toEqual([]);
    expect(flagReads(`${brandImport}const on = fromDb ?? brand.features.blog;`)).toEqual([]);
    expect(flagReads(`${brandImport}const on = fromDb ?? (cap && Boolean(brand.features.blog));`)).toEqual([]);
    expect(flagReads(`${brandImport}function Card({ blog = brand.features.blog }) { return blog; }`)).toEqual([]);
  });

  it("an alias is followed wherever it goes: through a destructure, a cast, another alias", () => {
    expect(flagReads(`${brandImport}const f = brand.features;\nconst { blog } = f;`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const f = brand.features;\nconst r = (f as any).reviews;`)).toEqual(["reviews"]);
    expect(flagReads(`${brandImport}const f = brand.features;\nif ((f ?? {}).blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const f = brand.features;\nconst g = f as R;\nif (g.blog) x();`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const { blog, ...rest } = brand.features;\nif (rest.reviews) x();`)).toEqual(["blog", "reviews"]);
    expect(flagReads(`${brandImport}const { "blog": on } = brand.features;`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const f = brand.features;\nconst on = fromDb ?? f.blog;`)).toEqual([]);
    // Two aliases that refer to each other end, and a read through them counts once.
    expect(flagReads(`${brandImport}var a = brand.features;\nvar b = a;\nvar a = b;\nif (a.blog) x();`)).toEqual(["blog"]);
  });

  it("an alias is one binding: a local of the same name is another, however it is declared", () => {
    const alias = `${brandImport}const f = brand.features;\n`;
    expect(flagReads(`${alias}async function g() { const f = await getFeatures(); return f.blog; }`)).toEqual([]);
    expect(flagReads(`${alias}function g(f) { return f.blog; }`)).toEqual([]);
    expect(flagReads(`${alias}list.filter((f) => f.blog);`)).toEqual([]);
    expect(flagReads(`${alias}for (const f of list) x(f.blog);`)).toEqual([]);
    expect(flagReads(`${alias}try { x(); } catch (f) { y(f.blog); }`)).toEqual([]);
    expect(flagReads(`${alias}function g() { if (c) { var f = load(); } return f.blog; }`)).toEqual([]);
    expect(flagReads(`${brandImport}function page() { if (c) { const f = brand.features; } return list.filter((f) => f.blog); }`)).toEqual([]);
    expect(flagReads(`${brandImport}function page() { if (c) { const f = brand.features; } return f.blog; }`)).toEqual([]);
    // The same name, and the alias itself: it reaches into any scope that does not hide it.
    expect(flagReads(`${alias}function g() { return f.blog; }`)).toEqual(["blog"]);
    expect(flagReads(`${alias}function g() { { const f = load(); } return f.reviews; }`)).toEqual(["reviews"]);
    expect(flagReads(`${brandImport}function g() { const f = brand.features; return () => f.blog; }`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}function g() { if (c) { const f = brand.features; return f.blog; } }`)).toEqual(["blog"]);
  });

  it("a local `brand` hides the import, however it is declared", () => {
    expect(flagReads(`${brandImport}for (const brand of brands) x(brand.features.blog);`)).toEqual([]);
    expect(flagReads(`${brandImport}try { x(); } catch (brand) { y(brand.features.blog); }`)).toEqual([]);
    expect(flagReads(`${brandImport}function g() { if (c) { var brand = load(); } return brand.features.blog; }`)).toEqual([]);
    expect(flagReads(`${brandImport}const g = ({ brand }) => brand.features.blog;`)).toEqual([]);
    // Only inside its own scope: the import is back outside it.
    expect(flagReads(`${brandImport}function g() { { const brand = load(); } return brand.features.blog; }`)).toEqual(["blog"]);
  });

  it("a dynamic import of the config is the same config", () => {
    expect(flagReads(`async function f() { const { brand } = await import("@/brand.config"); return brand.features.blog; }`)).toEqual(["blog"]);
    expect(flagReads(`async function f() { const { brand: cfg } = await import("../brand.config"); return (cfg.features as R).blog; }`)).toEqual(["blog"]);
    expect(flagReads(`async function f() { { const { brand } = await import("@/brand.config"); } return brand.features.blog; }`)).toEqual([]);
    expect(flagReads(`async function f() { const { brand } = await import("@/lib/brand"); return brand.features.blog; }`)).toEqual([]);
    expect(flagReads(`async function f() { const { brand } = await load("@/brand.config"); return brand.features.blog; }`)).toEqual([]);
    expect(flagReads(`async function f() { const { other: brand } = await import("@/brand.config"); return brand.features.blog; }`)).toEqual([]);
  });

  it("the binder works on a real path, in a tsx file", () => {
    const tsx = `${brandImport}export default function Page() { const f = brand.features; return <div>{f.blog ? "a" : "b"}</div>; }`;
    expect(flagReads(tsx, "app/[locale]/(shop)/page.tsx")).toEqual(["blog"]);
  });

  it("a read inside an unrelated `??` or default still counts: it is the flag's own value that is spared", () => {
    expect(flagReads(`${brandImport}const label = user.title ?? (brand.features.blog ? "A" : "M");`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const items = cached ?? buildMenu(brand.features.blog);`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const render = override ?? (() => brand.features.blog && x);`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const on = fromDb ?? (brand.features.blog && cap);`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}function f(cb = () => brand.features.blog) { return cb(); }`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}function f(x = buildMenu(brand.features.blog)) { return x; }`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}function Card({ x = brand.features.blog ? 1 : 2 }) { return x; }`)).toEqual(["blog"]);
    expect(flagReads(`${brandImport}const on = brand.features.blog ?? false;`)).toEqual(["blog"]);
  });

  it("the flag's own value behind a cast, `Boolean()` or a capability is still a fallback", () => {
    expect(flagReads(`${brandImport}const on = fromDb ?? (brand.features as R).blog;`)).toEqual([]);
    expect(flagReads(`${brandImport}const on = fromDb ?? Boolean(brand.features.blog);`)).toEqual([]);
    expect(flagReads(`${brandImport}const on = fromDb ?? (a && b && brand.features.blog);`)).toEqual([]);
    expect(flagReads(`${brandImport}const on = fromDb ?? (brand.features.blog ?? false);`)).toEqual([]);
    expect(flagReads(`${brandImport}const on = (fromDb ?? brand.features).blog;`)).toEqual([]);
    expect(flagReads(`${brandImport}function f(on: boolean = brand.features.blog) { return on; }`)).toEqual([]);
  });

  it("a flag of another tier or an unnamed read does not count", () => {
    expect(flagReads(`${brandImport}if (brand.features.webshop) x();`)).toEqual([]);
    expect(flagReads(`${brandImport}const f = (k) => brand.features[k];`)).toEqual([]);
    expect(flagReads(`${brandImport}render(brand.features);`)).toEqual([]);
    expect(flagReads(`${brandImport}// brand.features.blog`)).toEqual([]);
  });

  it("the naming rule: a new deviation is a problem, a frozen one is not, and a frozen one that moved must be struck", () => {
    const tool = (name: string, pack: string, scope = "settings:read"): ToolRow => ({ name, scope, pack });
    expect(namingProblems([tool("mockup.set", "mockup")], [], {})).toEqual([]);
    expect(namingProblems([tool("migration.woo_plan", "migration-woo")], [], {})).toEqual([]);
    expect(namingProblems([tool("cart.add", "customer")], ["cart.add"], {})).toEqual([]);

    expect(namingProblems([tool("cart.add", "customer")], [], {})).toEqual(["cart.add does not live in lib/tools/cart.ts"]);
    expect(namingProblems([tool("cartAdd", "cartAdd")], [], {})[0]).toContain("is not <prefix>.<verb>");
    expect(namingProblems([tool("a.b.c", "a")], [], {})[0]).toContain("is not <prefix>.<verb>");
    expect(namingProblems([tool("cart.add", "cart")], ["cart.add"], {})).toEqual([
      "cart.add no longer deviates: strike it from the frozen list",
    ]);
  });

  it("the naming rule: one scope domain per prefix, the frozen ones may not grow", () => {
    const tool = (name: string, scope: string): ToolRow => ({ name, scope, pack: name.split(".")[0] });
    const two = [tool("x.get", "catalog:read"), tool("x.set", "settings:write")];
    expect(namingProblems(two, [], {})[0]).toContain("spans scope domains catalog, settings");
    expect(namingProblems(two, [], { x: ["catalog", "settings"] })).toEqual([]);
    expect(namingProblems([...two, tool("x.go", "pages:write")], [], { x: ["catalog", "settings"] })[0]).toContain("frozen at");
    expect(namingProblems([tool("x.get", "catalog:read")], [], { x: ["catalog", "settings"] })[0]).toContain("frozen at");
  });

  it("the naming rule: a frozen prefix with no tools left must be struck too", () => {
    const tool: ToolRow = { name: "y.get", scope: "catalog:read", pack: "y" };
    expect(namingProblems([], [], { x: ["catalog", "settings"] })).toEqual([
      "x.* has no tools left: strike it from the frozen list",
    ]);
    expect(namingProblems([tool], [], { x: ["catalog", "settings"] })).toEqual([
      "x.* has no tools left: strike it from the frozen list",
    ]);
    expect(namingProblems([tool], [], {})).toEqual([]);
  });
});

// ── The pins (engine only) ───────────────────────────────────────────────────

describe.skipIf(!isEngineCheckout)("the known duplicates only fall (engine)", () => {
  // Reading the whole tree can outlast a test's 5 s on a busy machine.
  beforeAll(() => void scanTree(), 120_000);

  function expectAtMost(sites: readonly string[], pin: number, what: string, door: string): void {
    expect(
      sites.length,
      [`${what}: ${sites.length} found, pinned at ${pin} or fewer. ${door}`, ...sites.map((s) => `  ${s}`)].join("\n"),
    ).toBeLessThanOrEqual(pin);
  }

  it("the walk reads the real tree", () => {
    // A broken walk would pass every `<=` below on zero files.
    const { files } = scanTree();
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain("lib/orders/status.ts");
    expect(files).toContain("app/api/webhook/stripe/route.ts");
    expect(files).toContain("proxy.ts");
    // Written out, so a root dropped from the walk goes red here and not only as a lower count.
    for (const root of ["app", "components", "designs", "i18n", "industry-templates", "lib", "modules", "plugins", "verticals"]) {
      expect(files.some((f) => f.startsWith(`${root}/`)), root).toBe(true);
    }
    expect(files.some((f) => f.startsWith("app/generated/"))).toBe(false);
  });

  it("the flags it counts are the manifest's runtime flags, and a read reaches the number", () => {
    const flags = runtimeFlagKeys();
    expect(flags.size).toBeGreaterThan(0);
    const [flag] = flags;
    const read = `import { brand } from "@/brand.config";\nexport const on = brand.features.${flag};\n`;
    expect(scanFile(emptyScan(), "lib/x.ts", read, flags).staticRuntimeFlagReads).toEqual([`lib/x.ts:2 ${flag}`]);
  });

  it("every write method counts", () => {
    // Written out, so a method dropped from the set goes red here.
    for (const method of ["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]) {
      expect(writeSites(parse(`prisma.product.${method}({ where });`), "product").length, method).toBe(1);
    }
  });

  it("the writes it pins are still found", () => {
    // These three cannot reach zero while orders, products and settings exist.
    // The other two can, so their counting is proved by the fixtures above.
    const { statusWriters, productWriterFiles, brandingWriterFiles } = scanTree();
    expect(statusWriters.length).toBeGreaterThan(0);
    expect(productWriterFiles.length).toBeGreaterThan(0);
    expect(brandingWriterFiles.length).toBeGreaterThan(0);
  });

  it("writers of Order.status", () => {
    expectAtMost(
      scanTree().statusWriters,
      PINS.statusWriters,
      "Writes to Order.status",
      "A status write on an existing order goes through transitionOrder in lib/orders/lifecycle.ts.",
    );
  });

  it("the inline unit price", () => {
    expectAtMost(
      scanTree().inlineUnitPrices,
      PINS.inlineUnitPrices,
      "Inline `variant?.priceDkk ?? product.priceDkk`",
      "Call unitPriceDkk from lib/pricing.ts instead.",
    );
  });

  it("files that write Product", () => {
    expectAtMost(
      scanTree().productWriterFiles,
      PINS.productWriterFiles,
      "Files writing Product",
      "Use the tools in lib/tools/products.ts rather than adding a writer.",
    );
  });

  it("files that write BrandingSettings", () => {
    expectAtMost(
      scanTree().brandingWriterFiles,
      PINS.brandingWriterFiles,
      "Files writing BrandingSettings",
      "Use the tools in lib/tools/settings.ts rather than adding a writer.",
    );
  });

  it("static reads of runtime flags", () => {
    expectAtMost(
      scanTree().staticRuntimeFlagReads,
      PINS.staticRuntimeFlagReads,
      "Runtime flags read from brand.config",
      "A switch in /admin/features cannot reach these: read getFeatures() from lib/brand.ts instead.",
    );
  });
});

describe.skipIf(!isEngineCheckout)("a new tool is named <prefix>.<verb> (engine)", () => {
  let tools: ToolRow[] = [];
  let unlocated: string[] = [];

  beforeAll(async () => {
    const { listTools } = await import("@/lib/tools/registry");
    const packs = toolPacks();
    const registered = listTools();
    unlocated = registered.filter((t) => !packs.has(t.name)).map((t) => t.name);
    tools = registered.map((t) => ({ name: t.name, scope: t.scope, pack: packs.get(t.name) ?? "" }));
  }, 120_000);

  it("every registered tool is found in a pack file", () => {
    // Otherwise a tool defined somewhere new would be read as deviating from
    // nothing, and a broken walk would flag all of them.
    expect(tools.length).toBeGreaterThan(50);
    expect(unlocated).toEqual([]);
  });

  it("holds for every tool but the frozen ones, and the frozen lists only shrink", () => {
    expect(namingProblems(tools, FROZEN_PACK_EXCEPTIONS, FROZEN_TWO_DOMAIN_PREFIXES)).toEqual([]);
  });

  it("freezes no more than the sixteen known exceptions", () => {
    expect(FROZEN_PACK_EXCEPTIONS.length).toBeLessThanOrEqual(16);
    expect(new Set(FROZEN_PACK_EXCEPTIONS).size).toBe(FROZEN_PACK_EXCEPTIONS.length);
  });
});
