/**
 * ORD0-b — the bar this slice exists for: one door for Order.status on an order that
 * exists (lib/orders/lifecycle.ts). A new path (PAY-F1's Frisbii webhook) cannot
 * write the column beside it without this going red. It reads the sources from disk
 * with the TypeScript parser, so a comment or a string never counts, a call split
 * over several lines does, and it holds without git.
 *
 * What counts: `<x>.order.<write>(…)` that sets the status. Every create and upsert
 * (a new order always has one), and every update whose `data` names `status` or
 * cannot be read: a variable, a spread. Also `prisma.order` or `tx.order` handed
 * around as a value, since what it does next is unknown. Not counted, as in the DOM1
 * ratchet: raw SQL, a nested write through a relation, and a client destructured
 * (`const { order } = prisma`).
 *
 * Its second bar: a file that can report `paid` through the door calls onOrderPaid.
 * The type cannot hold this: `to: ok ? "paid" : "flagged_review"` compiles. So what it
 * cannot read counts as `paid`, as above: a `to` that is not a plain string, a move in
 * a variable or a spread, the door reached under another name or handed around. A plain
 * other status does not count, and nor does an operator's move, which fires nothing.
 * Not counted: `lifecycle["transitionOrder"](…)`.
 *
 * It walks the disk and reads only what exists: tests/unit ships into customer
 * scaffolds, which have no git and may have modules pruned. A fork's own write of the
 * status goes red too, and names the line, as ORD0-a's and MONEY1's ratchets do: the
 * races this door closes are the fork's as well. The exact counts are engine-only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, isEngineCheckout, walkCode } from "../../helpers/claims";

const WRITE_METHODS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);
const CREATING_METHODS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

/** A delegate handed around counts on these names only: `client.order` can as well be a field. */
const CLIENT_NAMES = new Set(["prisma", "tx", "trx"]);

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

const nameOf = (property: ts.ObjectLiteralElementLike): string | null =>
  property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
    ? property.name.text
    : null;

/** True unless the call is plainly a write that leaves the status alone. */
function setsStatus(method: string, firstArg: ts.Expression | undefined): boolean {
  if (CREATING_METHODS.has(method)) return true;
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return true;
  if (firstArg.properties.some((p) => nameOf(p) === null)) return true; // a spread can replace `data`
  const data = firstArg.properties.find((p) => nameOf(p) === "data");
  if (!data || !ts.isPropertyAssignment(data) || !ts.isObjectLiteralExpression(data.initializer)) return true;
  return data.initializer.properties.some((p) => nameOf(p) === null || nameOf(p) === "status");
}

/** The lines of a source that write Order.status. */
function statusWrites(text: string, file?: string): number[] {
  const sf = parse(text, file);
  const lines: number[] = [];
  eachNode(sf, (node) => {
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== "order") return;
    const client = node.expression;
    const named = ts.isIdentifier(client) && CLIENT_NAMES.has(client.text);
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
      if (!WRITE_METHODS.has(parent.name.text)) return; // a read, or a field on a row
      const call = parent.parent;
      if (ts.isCallExpression(call) && call.expression === parent) {
        if (setsStatus(parent.name.text, call.arguments[0])) lines.push(lineOf(sf, call));
      } else if (named) {
        lines.push(lineOf(sf, parent));
      }
    } else if (named) {
      lines.push(lineOf(sf, node));
    }
  });
  return lines;
}

/**
 * What `key` ends up as in this object, when the source says so plainly. Null when it
 * does not: a variable, a ternary, an `as`, shorthand, no such key, or a spread or
 * computed key after it, since what comes later in an object wins.
 */
function plainValue(object: ts.ObjectLiteralExpression, key: string): string | null {
  for (const property of [...object.properties].reverse()) {
    const name = nameOf(property);
    if (name === null) return null;
    if (name !== key) continue;
    return ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)
      ? property.initializer.text
      : null;
  }
  return null;
}

/** Can this mention of the door report `paid`? Yes, unless it plainly cannot. */
function mayReportPaid(door: ts.Identifier): boolean {
  const parent = door.parent;
  if (ts.isFunctionDeclaration(parent)) return false; // the door's own signatures
  if (ts.isImportSpecifier(parent)) return parent.propertyName === door; // an alias's calls go by another name
  const callee = ts.isPropertyAccessExpression(parent) && parent.name === door ? parent : door;
  const call = callee.parent;
  if (!ts.isCallExpression(call) || call.expression !== callee) return true; // handed around
  const move = call.arguments[0];
  if (!move || !ts.isObjectLiteralExpression(move)) return true;
  if (plainValue(move, "kind") === "operator") return false; // it fires nothing: see onOrderPaid's doc
  const to = plainValue(move, "to");
  return to === null || to === "paid";
}

/** Can this source hand the door a report of `paid`? */
function recordsPaid(text: string, file?: string): boolean {
  let found = false;
  eachNode(parse(text, file), (node) => {
    if (ts.isIdentifier(node) && node.text === "transitionOrder" && mayReportPaid(node)) found = true;
  });
  return found;
}

/** Does this source call onOrderPaid? */
function callsOnOrderPaid(text: string, file?: string): boolean {
  let found = false;
  eachNode(parse(text, file), (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "onOrderPaid") {
      found = true;
    }
  });
  return found;
}

/** The bar: this source can report `paid`, and never fires what follows. */
function isSilent(text: string, file?: string): boolean {
  return recordsPaid(text, file) && !callsOnOrderPaid(text, file);
}

describe("what counts as writing Order.status", () => {
  it.each([
    ["a status write", `await prisma.order.update({ where: { id }, data: { status: "paid" } });`],
    ["through a transaction", `await tx.order.updateMany({ where: { id }, data: { status } });`],
    ["on any client name", `await client.order.updateMany({ where: { id }, data: { status: to, paidAt } });`],
    ["split over lines", `await prisma.order\n  .update({\n    where: { id },\n    data: {\n      status: "x",\n    },\n  })\n  .catch(log);`],
    ["a data it cannot read", `await prisma.order.update({ where: { id }, data });`],
    ["a variable data", `await prisma.order.update({ where: { id }, data: next });`],
    ["a spread in data", `await prisma.order.update({ where: { id }, data: { ...next } });`],
    ["a computed key in data", `await prisma.order.update({ where: { id }, data: { [key]: value } });`],
    ["a spread beside data", `await prisma.order.update({ where: { id }, data: { carrier }, ...rest });`],
    ["no object to read", `await prisma.order.update(args);`],
    ["a create", `await tx.order.create({ data: { email } });`],
    ["an upsert", `await db.order.upsert({ where: { id }, create: {}, update: {} });`],
    ["the delegate handed around", `const orders = prisma.order;`],
    ["a write method handed around", `const write = tx.order.update;`],
  ])("%s counts", (_what, code) => {
    expect(statusWrites(code)).toHaveLength(1);
  });

  it.each([
    ["a column beside the status", `await prisma.order.update({ where: { id }, data: { confirmationEmailSentAt: now } });`],
    ["a read", `await prisma.order.findUnique({ where: { id } });`],
    ["a delete", `await prisma.order.deleteMany();`],
    ["a comment", `// await prisma.order.update({ where: { id }, data: { status: "paid" } });`],
    ["a string", `const hint = "prisma.order.update({ data: { status } })";`],
    ["another model", `await prisma.return.update({ where: { id }, data: { status: "approved" } });`],
    ["a field on a row", `const value = row.order.total;`],
  ])("%s does not", (_what, code) => {
    expect(statusWrites(code)).toEqual([]);
  });

  it("it reads a .tsx as one, and says which line", () => {
    const code = `const a = <b>{x}</b>;\n\nawait prisma.order.update({ data: { status } });`;
    expect(statusWrites(code, "page.tsx")).toEqual([3]);
    // Text in JSX is text. Read as plain .ts, this is a type assertion around a call.
    expect(statusWrites(`const hint = <code>prisma.order.update(x)</code>;`, "page.tsx")).toEqual([]);
  });
});

describe("what counts as recording paid through the door", () => {
  it.each([
    ["the plain word", `await transitionOrder({ client, kind: "fact", ...WHO, to: "paid", from });`],
    ["a quoted key", `await transitionOrder({ client, kind: "fact", ...WHO, "to": "paid", from });`],
    ["a template without a hole", "await transitionOrder({ client, kind: 'fact', ...WHO, to: `paid`, from });"],
    ["a fact that says its kind last", `await transitionOrder({ client, ...WHO, kind: "fact", from, to: "paid" });`],
    // A `to` it cannot read may be paid. tsc takes all of these against FactMove.
    ["a ternary", `await transitionOrder({ client, kind: "fact", ...WHO, from, to: ok ? "paid" : "flagged_review" });`],
    ["a ternary, with its kind last", `await transitionOrder({ client, ...WHO, kind: "fact", from, to: ok ? "paid" : "flagged_review" });`],
    ["a variable", `await transitionOrder({ client, kind: "fact", ...WHO, from, to: next });`],
    ["shorthand", `const to = pick();\nawait transitionOrder({ client, kind: "fact", ...WHO, from, to });`],
    ["an as const", `await transitionOrder({ client, kind: "fact", ...WHO, from, to: "paid" as const });`],
    ["a satisfies", `await transitionOrder({ client, kind: "fact", ...WHO, from, to: "paid" satisfies Status });`],
    ["brackets", `await transitionOrder({ client, kind: "fact", ...WHO, from, to: ("paid") });`],
    ["a template with a hole", "await transitionOrder({ client, kind: 'fact', ...WHO, from, to: `${next}` });"],
    ["a computed key", `await transitionOrder({ client, kind: "fact", ...WHO, from, ["to"]: "paid" });`],
    // A move it cannot read may say anything.
    ["a move in a variable", `await transitionOrder(move);`],
    ["a move with an as around it", `await transitionOrder({ client, kind: "fact", to: "refunded", from: null } as FactMove);`],
    ["arguments in a spread", `await transitionOrder(...args);`],
    ["no argument", `await transitionOrder();`],
    ["no to", `await transitionOrder({ client, kind: "fact", from });`],
    ["to only in a spread", `await transitionOrder({ client, kind: "fact", ...move });`],
    ["everything in a spread", `await transitionOrder({ ...move });`],
    // What comes later in an object wins, so these can replace what they follow.
    ["a spread after another status", `await transitionOrder({ client, kind: "fact", to: "refunded", from: null, ...rest });`],
    ["a computed key after another status", `await transitionOrder({ client, kind: "fact", to: "refunded", from: null, [key]: value });`],
    ["a spread after an operator's kind", `await transitionOrder({ client, kind: "operator", ...move });`],
    ["a computed key after an operator's kind", `await transitionOrder({ client, kind: "operator", [key]: value });`],
    ["a kind it cannot read", `await transitionOrder({ client, kind: pick(), ...move });`],
    // The door under any other way of reaching it.
    ["a namespace", `await lifecycle.transitionOrder({ client, kind: "fact", ...WHO, to: "paid", from });`],
    ["a namespace and a move in a variable", `await lifecycle.transitionOrder(move);`],
    ["an alias", `import { transitionOrder as record } from "@/lib/orders/lifecycle";`],
    ["an alias when it is destructured", `const { transitionOrder: record } = lifecycle;`],
    ["an alias when it is exported", `export { transitionOrder as record } from "@/lib/orders/lifecycle";`],
    ["the door handed around", `const door = transitionOrder;`],
    ["the door as an argument", `await Promise.all(moves.map(transitionOrder));`],
    ["the door as a later argument", `await retry({ to: "refunded" }, transitionOrder);`],
    ["the door through .call", `await transitionOrder.call({ to: "refunded" }, move);`],
    ["a namespace handed around", `const door = lifecycle.transitionOrder;`],
  ])("%s counts", (_what, code) => {
    expect(recordsPaid(code)).toBe(true);
  });

  it.each([
    ["another status", `await transitionOrder({ client, kind: "fact", ...WHO, to: "disputed", from: null });`],
    ["another status after a spread", `await transitionOrder({ client: tx, kind: "fact", ...by, orderId, from: "pending_payment", to: "cancelled" });`],
    ["another status after a computed key", `await transitionOrder({ [key]: value, to: "refunded", from: null });`],
    ["another status through a namespace", `await lifecycle.transitionOrder({ client, kind: "fact", ...WHO, to: "disputed", from: null });`],
    // An operator's move fires nothing, whatever the status: see onOrderPaid's doc.
    ["an operator's move to paid", `await transitionOrder({ client, ...WHO, kind: "operator", from, to: "paid" });`],
    ["an operator's move to a status it cannot read", `await transitionOrder({ client, ...WHO, kind: "operator", from, to: next });`],
    ["an operator's move with the rest in a spread", `return transitionOrder({ client: tx, source: "operator", ...input, kind: "operator" });`],
    ["a plain import", `import { transitionOrder } from "@/lib/orders/lifecycle";`],
    ["the door's own signature", `export function transitionOrder(move: OperatorMove): Promise<void>;`],
    ["another object that says paid", `const tab = { to: "paid" };`],
    ["another call that says paid", `notify({ to: "paid" });`],
    ["another function", `await transitionOrders(move);`],
    ["a comment", `// await transitionOrder(move);`],
    ["a doc comment", `/** {@link transitionOrder} */\nconst x = 1;`],
    ["a string", `const hint = "transitionOrder(move)";`],
  ])("%s does not", (_what, code) => {
    expect(recordsPaid(code)).toBe(false);
  });

  it("calling onOrderPaid is the call, not a mention of it", () => {
    expect(callsOnOrderPaid(`await onOrderPaid({ order });`)).toBe(true);
    expect(callsOnOrderPaid(`import { onOrderPaid } from "@/lib/orders/on-paid";`)).toBe(false);
    expect(callsOnOrderPaid(`// await onOrderPaid({ order });`)).toBe(false);
    expect(callsOnOrderPaid(`const hint = "onOrderPaid()";`)).toBe(false);
    expect(callsOnOrderPaid(`await notifyOwner({ order });`)).toBe(false);
  });

  it("the bar is the pair: it can report paid, and it never calls onOrderPaid", () => {
    expect(isSilent(`await transitionOrder(move);`)).toBe(true);
    expect(isSilent(`await transitionOrder(move);\nawait onOrderPaid({ order });`)).toBe(false);
    expect(isSilent(`await transitionOrder({ client, kind: "fact", ...WHO, to: "disputed", from: null });`)).toBe(false);
  });
});

describe("one door — on the tree", () => {
  const SOURCE_ROOTS = ["app", "components", "designs", "i18n", "industry-templates", "lib", "modules", "plugins", "verticals"];
  const SOURCES = SOURCE_ROOTS.flatMap((root) => walkCode(root)).map((file) => ({
    file,
    text: readFileSync(path.join(REPO_ROOT, file), "utf8"),
  }));

  const DOOR = "lib/orders/lifecycle.ts";
  /** The door, and creation, which is not a move: an order has to start somewhere. */
  const ALLOWED = ["lib/orders/create-acp.ts", "lib/orders/create.ts", DOOR];

  const writesIn = (file: string, text: string) => statusWrites(text, file).map((line) => `${file}:${line}`);

  it("nothing but the door and the two create paths writes Order.status", () => {
    const outside = SOURCES.filter(({ file }) => !ALLOWED.includes(file)).flatMap(({ file, text }) => writesIn(file, text));
    expect(outside, "write it through transitionOrder in lib/orders/lifecycle.ts").toEqual([]);
  });

  it("the check is not blind: it sees the door's own writes", () => {
    const door = SOURCES.find(({ file }) => file === DOOR);
    expect(door, "this test ships with the door").toBeDefined();
    expect(statusWrites(door?.text ?? "", DOOR).length).toBeGreaterThan(0);
  });

  it.skipIf(!isEngineCheckout)("the door writes it in two places, and each create path in one", () => {
    const sites = Object.fromEntries(
      SOURCES.filter(({ file, text }) => writesIn(file, text).length > 0).map(({ file, text }) => [
        file,
        writesIn(file, text).length,
      ]),
    );
    expect(sites).toEqual({
      "lib/orders/create-acp.ts": 1,
      "lib/orders/create.ts": 1,
      [DOOR]: 2,
    });
  });

  // ORD0-a's ratchet (orders/on-paid.test.ts) reads `status: "paid"` in a path's own
  // text. A path that records paid through the door no longer says that, so this
  // holds the same bar for it: whoever reports `paid` fires what follows.
  it("a file that records paid through the door calls onOrderPaid", () => {
    const silent = SOURCES.filter(({ file, text }) => isSilent(text, file));
    expect(
      silent.map(({ file }) => file),
      "call onOrderPaid when the write landed; a `to` that is never paid must be a plain string",
    ).toEqual([]);
  });

  it.skipIf(!isEngineCheckout)("that check is not blind either: the webhook and the cron record paid", () => {
    expect(SOURCES.filter(({ file, text }) => recordsPaid(text, file)).map(({ file }) => file).sort()).toEqual([
      "app/api/cron/reconcile-stripe/route.ts",
      "app/api/webhook/stripe/route.ts",
    ]);
  });
});
