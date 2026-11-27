import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, isEngineCheckout, stripComments, walkCode } from "../helpers/claims";

/**
 * docs/domain-model.md places every Prisma model in one aggregate and marks what
 * is not built yet as planned. These tests keep it true: a new model nobody placed
 * goes red, so does a name the schema does not have unless it says `(planned)`,
 * so does a `(planned)` that has landed, and so does a mark or a row it cannot read.
 *
 * A placement is a row in an aggregate's table, one model per row:
 *
 *   | `Product` | … |
 *   | `MediaAlias` (planned) | … |
 *   | `SeoSnapshot` (old) | … |
 *
 * ENGINE-ONLY FOR THE REAL FILES. This file ships. In a customer's project their
 * own `model` is theirs to add, a profile may have left a module's code out, and
 * the document is theirs to edit, so all three must not turn their `pnpm test`
 * red. The rules run everywhere on inline fixtures; the real schema and document
 * are read behind the repo-hygiene probe and report as SKIPPED elsewhere.
 */

const DOC = "docs/domain-model.md";
const SCHEMA = "prisma/schema.prisma";

const AGGREGATES = ["Catalogue", "Sales", "Money", "Customer", "Content", "Settings", "Agent/audit"];

/** The tables with no code behind them. They are marked old and never dropped. */
const OLD_TABLES = ["MigrationJob", "SeoSnapshot"];

/**
 * Landing from parallel branches, so this test has to pass before and after they
 * merge, in either order. A name here may be `(planned)` and exist at once. Once it
 * has landed, strike the `(planned)` in the document and the entry here; the last
 * test below goes red if only the first half happens.
 */
const IN_FLIGHT: ReadonlySet<string> = new Set<string>();

/** `mark` is whatever follows the name in its cell. Anything but these three is a problem. */
const MARKS: readonly string[] = ["", "(planned)", "(old)"];
type Placement = { model: string; aggregate: string; mark: string };
const PLACEMENT_ROW = /^\| `(\w+)`([^|]*)\|/;

function schemaModels(schema: string): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
}

/** Each `## <heading>` with the lines under it, in order. */
function sections(doc: string): { heading: string; lines: string[] }[] {
  const out: { heading: string; lines: string[] }[] = [];
  for (const line of doc.split("\n")) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) out.push({ heading: heading[1], lines: [] });
    else out.at(-1)?.lines.push(line);
  }
  return out;
}

function readPlacements(doc: string): Placement[] {
  return sections(doc)
    .filter(({ heading }) => AGGREGATES.includes(heading))
    .flatMap(({ heading, lines }) =>
      lines.flatMap((line): Placement[] => {
        const row = PLACEMENT_ROW.exec(line);
        return row ? [{ model: row[1], aggregate: heading, mark: row[2].trim() }] : [];
      }),
    );
}

/** Table rows under an aggregate that are neither a placement nor the table's own head. */
function strayRows(doc: string): string[] {
  return sections(doc)
    .filter(({ heading }) => AGGREGATES.includes(heading))
    .flatMap(({ lines }) => lines.filter((line) => line.startsWith("|")))
    .filter((line) => !PLACEMENT_ROW.test(line) && line !== "| Model | Holds |" && line !== "|---|---|");
}

function placementProblems(
  models: readonly string[],
  placements: readonly Placement[],
  inFlight: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const model of models) {
    const homes = placements.filter((p) => p.model === model).map((p) => p.aggregate);
    if (homes.length === 0) problems.push(`${model} is in the schema but placed in no aggregate`);
    if (homes.length > 1) problems.push(`${model} is placed twice: ${homes.join(" and ")}`);
  }
  for (const { model, mark } of placements) {
    if (!MARKS.includes(mark)) {
      problems.push(`${model} has an unknown mark, ${mark}: use (planned) or (old)`);
      continue;
    }
    const exists = models.includes(model);
    if (!exists && mark !== "(planned)") problems.push(`${model} is not in the schema: mark it (planned) or remove it`);
    if (exists && mark === "(planned)" && !inFlight.has(model)) problems.push(`${model} exists now: drop its (planned)`);
  }
  return problems;
}

/** A repo path in backticks, and whether it says `(planned)` right after. `<prefix>` patterns do not match. */
const PATH_TOKEN = /`((?:app|components|designs|docs|lib|modules|plugins|prisma|scripts|tests)\/[^`\s<]*)`( \(planned\))?/g;

function pathProblems(
  doc: string,
  exists: (rel: string) => boolean,
  inFlight: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const [, rel, planned] of doc.matchAll(PATH_TOKEN)) {
    if (!planned && !exists(rel)) problems.push(`${rel} is named as if it exists, and it does not`);
    if (planned && exists(rel) && !inFlight.has(rel)) problems.push(`${rel} exists now: drop its (planned)`);
  }
  return problems;
}

/** In-flight names the document no longer says `(planned)` for, at every place it names them. */
function staleInFlight(doc: string, inFlight: ReadonlySet<string>): string[] {
  const count = (token: string) => doc.split(token).length - 1;
  return [...inFlight].filter((name) => {
    const named = count(`\`${name}\``);
    return named === 0 || count(`\`${name}\` (planned)`) < named;
  });
}

describe("the document's rules", () => {
  const none: ReadonlySet<string> = new Set();
  const doc = [
    "## Catalogue",
    "**Write door:** x",
    "| Model | Holds |",
    "|---|---|",
    "| `Product` | a |",
    "| `MediaAlias` (planned) | b |",
    "## Sales",
    "| `Order` | c |",
    "| `MigrationJob` (old) | d |",
    "## Ports",
    "| `NotAModelHere` | e |",
    "| `lib/orders/create.ts` | f |",
  ].join("\n");

  it("reads a row per model under an aggregate, and only there", () => {
    expect(readPlacements(doc)).toEqual([
      { model: "Product", aggregate: "Catalogue", mark: "" },
      { model: "MediaAlias", aggregate: "Catalogue", mark: "(planned)" },
      { model: "Order", aggregate: "Sales", mark: "" },
      { model: "MigrationJob", aggregate: "Sales", mark: "(old)" },
    ]);
  });

  it("reads the schema's models, and not a comment or an enum", () => {
    expect(schemaModels("model A {\n}\n// model B {\nenum C {\n}\nmodel   D  {\n  model String\n}")).toEqual(["A", "D"]);
  });

  it("is satisfied when every model has one home and a missing name says (planned)", () => {
    const models = ["Product", "Order", "MigrationJob"];
    expect(placementProblems(models, readPlacements(doc), none)).toEqual([]);
  });

  it("goes red on a model placed nowhere", () => {
    const models = ["Product", "Order", "MigrationJob", "Brandnew"];
    expect(placementProblems(models, readPlacements(doc), none)).toEqual([
      "Brandnew is in the schema but placed in no aggregate",
    ]);
  });

  it("goes red on a model placed twice", () => {
    const twice = readPlacements(`${doc}\n## Money\n| \`Order\` | again |`);
    expect(placementProblems(["Product", "Order", "MigrationJob"], twice, none)).toEqual([
      "Order is placed twice: Sales and Money",
    ]);
  });

  it("goes red on a name the schema lacks unless it says (planned)", () => {
    const unmarked = readPlacements(doc.replace("`MediaAlias` (planned)", "`MediaAlias`"));
    expect(placementProblems(["Product", "Order", "MigrationJob"], unmarked, none)).toEqual([
      "MediaAlias is not in the schema: mark it (planned) or remove it",
    ]);
  });

  it("goes red on a (planned) that has landed, unless it is in flight", () => {
    const models = ["Product", "Order", "MigrationJob", "MediaAlias"];
    expect(placementProblems(models, readPlacements(doc), none)).toEqual(["MediaAlias exists now: drop its (planned)"]);
    expect(placementProblems(models, readPlacements(doc), new Set(["MediaAlias"]))).toEqual([]);
  });

  it("a mistyped mark goes red, on a name the schema lacks and on one it has", () => {
    const typo = readPlacements(doc.replace("(planned)", "(plannd)"));
    const problem = ["MediaAlias has an unknown mark, (plannd): use (planned) or (old)"];
    expect(placementProblems(["Product", "Order", "MigrationJob"], typo, none)).toEqual(problem);
    expect(placementProblems(["Product", "Order", "MigrationJob", "MediaAlias"], typo, none)).toEqual(problem);
  });

  it("any other text after the name goes red too, rather than dropping the row", () => {
    const models = ["Product", "Order", "MigrationJob"];
    for (const [written, shown] of [
      ["`MediaAlias` planned", "planned"],
      ["`MediaAlias` (Planned)", "(Planned)"],
      ["`MediaAlias` ()", "()"],
      ["`MediaAlias` and `Other`", "and `Other`"],
    ]) {
      const row = readPlacements(doc.replace("`MediaAlias` (planned)", written));
      expect(placementProblems(models, row, none)).toEqual([`MediaAlias has an unknown mark, ${shown}: use (planned) or (old)`]);
    }
  });

  it("a row under an aggregate that names no model is flagged rather than read past", () => {
    expect(strayRows(doc)).toEqual([]);
    expect(strayRows(`${doc}\n## Money\n| Foo (planned) | x |\n|\`Bar\` | y |`)).toEqual(["| Foo (planned) | x |", "|`Bar` | y |"]);
    expect(strayRows(`${doc}\n## Money\nProse, | with a bar.`)).toEqual([]);
  });

  it("an (old) with a typo is not (old)", () => {
    const typo = readPlacements(doc.replace("(old)", "(olde)"));
    expect(placementProblems(["Product", "Order", "MigrationJob"], typo, none)).toEqual([
      "MigrationJob has an unknown mark, (olde): use (planned) or (old)",
    ]);
  });

  it("checks the paths it names, both ways", () => {
    const exists = (rel: string) => rel === "lib/here.ts" || rel === "lib/landed.ts";
    expect(pathProblems("`lib/here.ts` and `lib/next.ts` (planned)", exists, none)).toEqual([]);
    expect(pathProblems("`lib/gone.ts`", exists, none)).toEqual(["lib/gone.ts is named as if it exists, and it does not"]);
    expect(pathProblems("`lib/landed.ts` (planned)", exists, none)).toEqual(["lib/landed.ts exists now: drop its (planned)"]);
    expect(pathProblems("`lib/landed.ts` (planned)", exists, new Set(["lib/landed.ts"]))).toEqual([]);
    expect(pathProblems("`lib/tools/<prefix>.ts`, `/admin/features`, `Order.status`", exists, none)).toEqual([]);
  });

  it("an in-flight name says (planned) wherever it is named, or its entry is stale", () => {
    const inFlight = new Set(["lib/landed.ts"]);
    expect(staleInFlight("`lib/landed.ts` (planned), and later `lib/landed.ts` (planned)", inFlight)).toEqual([]);
    // Struck at one place of two: the other still says (planned), and that is not enough.
    expect(staleInFlight("`lib/landed.ts`, and later `lib/landed.ts` (planned)", inFlight)).toEqual(["lib/landed.ts"]);
    expect(staleInFlight("`lib/landed.ts` (planned), and later `lib/landed.ts`", inFlight)).toEqual(["lib/landed.ts"]);
    expect(staleInFlight("`lib/landed.ts`", inFlight)).toEqual(["lib/landed.ts"]);
    expect(staleInFlight("no longer named", inFlight)).toEqual(["lib/landed.ts"]);
  });
});

describe.skipIf(!isEngineCheckout)("docs/domain-model.md against this repository (engine)", () => {
  const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
  const onDisk = (rel: string) => existsSync(path.join(REPO_ROOT, rel));

  it("the schema read is not vacuous", () => {
    const models = schemaModels(read(SCHEMA));
    expect(models.length).toBeGreaterThan(50);
    expect(models).toEqual(expect.arrayContaining(["Product", "Order", "AuditLog"]));
  });

  it("has the seven aggregates, in order, each with a write door", () => {
    const found = sections(read(DOC)).filter(({ heading }) => AGGREGATES.includes(heading));
    expect(found.map(({ heading }) => heading)).toEqual(AGGREGATES);
    for (const { heading, lines } of found) {
      expect(lines.some((line) => line.startsWith("**Write door:**")), `${heading} names no write door`).toBe(true);
    }
  });

  it("places every Prisma model exactly once, and a name the schema lacks says (planned)", () => {
    expect(placementProblems(schemaModels(read(SCHEMA)), readPlacements(read(DOC)), IN_FLIGHT)).toEqual([]);
    expect(strayRows(read(DOC))).toEqual([]);
  });

  it("names its four ports", () => {
    const ports = sections(read(DOC)).find(({ heading }) => heading === "Ports");
    const names = (ports?.lines ?? []).flatMap((line) => /^\| \*\*(.+?)\*\* \|/.exec(line)?.[1] ?? []);
    expect(names).toEqual(["PaymentProvider", "Accounting exit", "Source importer", "Supplier stock"]);
  });

  it("marks exactly the old tables old, and there is no code behind them", () => {
    const old = readPlacements(read(DOC)).filter((p) => p.mark === "(old)").map((p) => p.model);
    expect(old.sort()).toEqual(OLD_TABLES);

    const delegates = new RegExp(`\\.(${OLD_TABLES.map((m) => m[0].toLowerCase() + m.slice(1)).join("|")})\\b`);
    const files = ["app", "components", "designs", "lib", "modules", "plugins", "scripts"].flatMap((root) => walkCode(root));
    expect(files.length).toBeGreaterThan(500);
    const users = files.filter((file) => delegates.test(stripComments(read(file))));
    expect(users, "A table marked (old) has code behind it: drop the mark, or the code").toEqual([]);
  }, 120_000); // it reads the whole tree, which can outlast 5 s on a busy machine

  it("every path it names exists, or says (planned)", () => {
    const doc = read(DOC);
    expect([...doc.matchAll(PATH_TOKEN)].length).toBeGreaterThan(30);
    expect(pathProblems(doc, onDisk, IN_FLIGHT)).toEqual([]);
  });

  it("every in-flight name is still marked (planned), so a stale entry cannot linger", () => {
    expect(staleInFlight(read(DOC), IN_FLIGHT), "These have landed: strike them from IN_FLIGHT").toEqual([]);
  });
});
