import ts from "typescript";
import { FEATURE_MANIFEST } from "@/lib/feature-flags/manifest";

/**
 * Which flags a tool reads, told from the syntax tree of the file that defines
 * it: a string or a comment is not a read, a name means what its scope says, and
 * each tool answers for its own reads, not for a sibling's. A tool that refuses
 * on a flag its gate does not name is listed as visible and then says "this
 * feature is off".
 *
 * It sees reads in lib/tools. A stop further down (`sheets.*`, `drive.*`,
 * `subscriptionsFeatureEnabled()`) is pinned at the call instead, by
 * tests/unit/surface-no-refusal.test.ts.
 */

/**
 * A flag read at module load to decide a tool's published schema, not whether the tool
 * is there: the status enum of the orders tools is frozen at load (B22 = b), so `quotes`
 * is compile-time and no gate could name it. Written out, so another flag cannot slip in.
 */
export const SCHEMA_FLAGS: ReadonlySet<string> = new Set(["quotes"]);
const FLAGS = new Set<string>(FEATURE_MANIFEST.map((flag) => flag.key).filter((key) => !SCHEMA_FLAGS.has(key)));

export type ToolFile = { file: string; source: string };

/**
 * The files as one program and nothing else: no standard library, and an import
 * from outside them resolves to nothing. The checker is what tells a helper from
 * a local of the same name, and follows an import to the function it names.
 */
function compile(files: readonly ToolFile[]): { trees: ts.SourceFile[]; checker: ts.TypeChecker } {
  const trees = new Map(
    files.map(({ file, source }) => [file, ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)]),
  );
  const host: ts.CompilerHost = {
    getSourceFile: (name) => trees.get(name),
    fileExists: (name) => trees.has(name),
    readFile: () => undefined,
    writeFile: () => undefined,
    getDefaultLibFileName: () => "lib.d.ts",
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    resolveModuleNameLiterals: (literals) =>
      literals.map(({ text }) => {
        const file = `${text.replace(/^(@\/lib\/tools|\.)\//, "")}.ts`;
        return { resolvedModule: trees.has(file) ? { resolvedFileName: file, extension: ts.Extension.Ts } : undefined };
      }),
  };
  const program = ts.createProgram({ rootNames: [...trees.keys()], options: { noLib: true }, host });
  return { trees: [...trees.values()], checker: program.getTypeChecker() };
}

/** What a name stands for where it stands, through an import to what it imports. */
function symbolOf(id: ts.Identifier, checker: ts.TypeChecker): ts.Symbol | undefined {
  const symbol = ts.isShorthandPropertyAssignment(id.parent)
    ? checker.getShorthandAssignmentValueSymbol(id.parent)
    : checker.getSymbolAtLocation(id);
  return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/** Through what does not change which object is read: parentheses, a cast, `await`, `!`. */
function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAwaitExpression(node)
    ? unwrap(node.expression)
    : node;
}

/** A property's key, `x` and `"x"` alike. */
function keyOf(node: ts.Node | undefined): string | undefined {
  return node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) ? node.text : undefined;
}

/**
 * The flags one node reads. `bags` holds what else the flags object goes by: a
 * variable bound to it, not a name, so another scope's `flags` is another thing.
 * `features` and `getFeatures()` do count by their spelling: one can be a parameter
 * and the other a local wrapper, and a read wrongly counted goes red where a read
 * missed would pass. A property that is not in the flag manifest is not a flag,
 * which is what keeps a service's `args.features.length` out.
 */
function flagsReadAt(node: ts.Node, bags: Set<ts.Symbol>, checker: ts.TypeChecker): string[] {
  const flags: string[] = [];
  const note = (key: string | undefined) => {
    if (key && FLAGS.has(key)) flags.push(key);
  };
  const isBag = (expression: ts.Expression): boolean => {
    const bare = unwrap(expression);
    if (ts.isIdentifier(bare)) {
      const symbol = symbolOf(bare, checker);
      return bare.text === "features" || (symbol !== undefined && bags.has(symbol));
    }
    if (ts.isPropertyAccessExpression(bare)) return bare.name.text === "features";
    if (ts.isElementAccessExpression(bare)) return keyOf(bare.argumentExpression) === "features";
    return ts.isCallExpression(bare) && keyOf(bare.expression) === "getFeatures";
  };
  const bind = (target: ts.BindingName, holdsBag: boolean): void => {
    if (ts.isIdentifier(target)) {
      const symbol = symbolOf(target, checker);
      if (holdsBag && symbol) bags.add(symbol);
    } else if (ts.isObjectBindingPattern(target)) {
      for (const element of target.elements) {
        const key = keyOf(element.propertyName ?? element.name);
        if (holdsBag) note(key);
        if (key === "features") bind(element.name, true);
      }
    }
  };

  if (ts.isPropertyAccessExpression(node) && isBag(node.expression)) note(node.name.text);
  if (ts.isElementAccessExpression(node) && isBag(node.expression)) note(keyOf(node.argumentExpression));
  if (ts.isVariableDeclaration(node) && node.initializer) bind(node.name, isBag(node.initializer));
  return flags;
}

/** Every read in the trees, by the node that makes it. Nothing is followed: a read is a fact about where it sits. */
function readsIn(trees: readonly ts.SourceFile[], checker: ts.TypeChecker): Map<ts.Node, string[]> {
  const reads = new Map<ts.Node, string[]>();
  const bags = new Set<ts.Symbol>();
  const visit = (node: ts.Node): void => {
    const flags = flagsReadAt(node, bags, checker);
    if (flags.length > 0) reads.set(node, flags);
    ts.forEachChild(node, visit);
  };
  // Twice: a closure can read a name that is bound further down.
  for (const tree of [...trees, ...trees]) visit(tree);
  return reads;
}

/** Each `defineTool({ name: "…" })` in the file. */
function toolsIn(tree: ts.SourceFile): { name: string; definition: ts.Node }[] {
  const tools: { name: string; definition: ts.Node }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && keyOf(node.expression) === "defineTool") {
      const [definition] = node.arguments;
      if (definition && ts.isObjectLiteralExpression(definition)) {
        for (const property of definition.properties) {
          if (ts.isPropertyAssignment(property) && keyOf(property.name) === "name" && ts.isStringLiteralLike(property.initializer)) {
            tools.push({ name: property.initializer.text, definition });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return tools;
}

/**
 * What a name leads to: a function, or what a variable was given. So a tool that
 * names a table of helpers answers for all of it, since the walk cannot tell
 * which one it calls; that goes red, where a miss would pass. A parameter, a class
 * or a dynamic import leads nowhere.
 */
function definitionOf(id: ts.Identifier, checker: ts.TypeChecker): ts.Node | undefined {
  const declaration = symbolOf(id, checker)?.valueDeclaration;
  if (!declaration) return undefined;
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  const holder = ts.isBindingElement(declaration) ? ts.walkUpBindingElementsAndPatterns(declaration) : declaration;
  return ts.isVariableDeclaration(holder) ? holder.initializer : undefined;
}

/** Every node `root` gets to, following what it refers to, in its own file or a sibling's. A type runs nothing. */
function nodesUnder(root: ts.Node, checker: ts.TypeChecker): Set<ts.Node> {
  const seen = new Set<ts.Node>();
  const visit = (node: ts.Node): void => {
    if (seen.has(node) || ts.isTypeNode(node)) return;
    seen.add(node);
    const target = ts.isIdentifier(node) ? definitionOf(node, checker) : undefined;
    if (target) visit(target);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return seen;
}

/**
 * The flags each tool reads. `unreached` is every read in a file that defines
 * tools that no tool gets to, one by one and not by flag: either dead code, or a
 * path this walk cannot follow, and neither should pass as checked because a
 * sibling happens to read the same flag. A file that defines no tool answers for
 * nothing (lib/tools/public-gate.ts serves routes).
 */
export function flagReadsByTool(files: readonly ToolFile[]): {
  byTool: Map<string, string[]>;
  unreached: string[];
} {
  const { trees, checker } = compile(files);
  const reads = readsIn(trees, checker);
  const byTool = new Map<string, string[]>();
  const reached = new Set<ts.Node>();
  const holdingTools = new Set<ts.SourceFile>();
  for (const tree of trees) {
    for (const { name, definition } of toolsIn(tree)) {
      holdingTools.add(tree);
      const flags = new Set<string>();
      for (const node of nodesUnder(definition, checker)) {
        const here = reads.get(node);
        if (!here) continue;
        reached.add(node);
        for (const flag of here) flags.add(flag);
      }
      byTool.set(name, [...flags].sort());
    }
  }
  const unreached = [...reads].flatMap(([node, flags]) => {
    const tree = node.getSourceFile();
    if (reached.has(node) || !holdingTools.has(tree)) return [];
    const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    return flags.map((flag) => `${tree.fileName}:${line} reads features.${flag}, and no tool gets there`);
  });
  return { byTool, unreached };
}

/** Every read whose tool does not name that flag in its own gate. */
export function ungatedReads(
  byTool: ReadonlyMap<string, readonly string[]>,
  tools: readonly { name: string; gate?: { flags?: readonly string[] } }[],
): string[] {
  return [...byTool].flatMap(([name, flags]) => {
    const gated: readonly string[] = tools.find((tool) => tool.name === name)?.gate?.flags ?? [];
    return flags
      .filter((flag) => !gated.includes(flag))
      .map((flag) => `${name} reads features.${flag}, and its gate does not name that`);
  });
}

/** Does this file read a flag off brand.config? `/admin/features` could never reach that read. */
export function readsFlagsFromConfig(source: string): boolean {
  const { trees, checker } = compile([{ file: "tool.ts", source }]);
  // Not symbolOf: brand.config is outside this one-file program, so an import of it
  // resolves to nothing, and each of them to the same nothing.
  const stands = (id: ts.Identifier) => checker.getSymbolAtLocation(id);
  const config = new Set<ts.Symbol | undefined>();
  let found = false;
  const isConfigPath = (node: ts.Node | undefined) =>
    node !== undefined && ts.isStringLiteralLike(node) && /(^|\/)brand\.config$/.test(node.text);
  const isConfig = (expression: ts.Expression) => {
    const bare = unwrap(expression);
    return ts.isIdentifier(bare) && config.has(stands(bare));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isConfigPath(node.moduleSpecifier)) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const { name } of named.elements) config.add(stands(name));
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "features" && isConfig(node.expression)) found = true;
    if (ts.isElementAccessExpression(node) && keyOf(node.argumentExpression) === "features" && isConfig(node.expression)) {
      found = true;
    }
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
      const { elements } = node.name;
      const value = unwrap(node.initializer);
      if (isConfig(value) && elements.some((element) => keyOf(element.propertyName ?? element.name) === "features")) found = true;
      // `const { brand } = await import("@/brand.config")`
      if (ts.isCallExpression(value) && value.expression.kind === ts.SyntaxKind.ImportKeyword && isConfigPath(value.arguments[0])) {
        for (const { name } of elements) {
          if (ts.isIdentifier(name)) config.add(stands(name));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const tree of trees) visit(tree);
  return found;
}
