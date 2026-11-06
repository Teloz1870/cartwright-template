import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix as posixPath, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `app/[locale]/layout.tsx` wraps EVERY storefront page in `<main>` (or hands that landmark to a design pack that
 * sets `layout.ownsMain`). A page that renders its own `<main …>` therefore produces two main landmarks — landmark
 * navigation (a screen reader's rotor) lists two "main" regions, and axe reports `landmark-no-duplicate-main` on
 * every such page (AUD17-a).
 *
 * Nothing caught it: no CSS selects the element, no test queries the role, and the pages build and render fine with
 * the nesting. So the rule is enforced here, by reading the sources. Two sets are walked:
 *
 *  - every route file under `app/[locale]/` that renders INSIDE the layout — `page`, `not-found`, `error`, `loading`,
 *    `template`, a parallel route's `default`, the experimental `forbidden` / `unauthorized` (R5), a nested `layout`
 *    (R6) and their `.static` twins, as `.tsx`, `.ts`, `.jsx` or `.js` (Next's default `pageExtensions`), each read in
 *    its own grammar. `app/[locale]/layout` renders the `<main>`; nothing outside `app/[locale]` is inside it;
 *  - every plugin component those files mount (`export { default } from "@/plugins/<slug>/pages/<Page>"`, the
 *    cartwright-plugin-v1 route-mount pattern). Review round 1 measured the blog index, the blog post, the wishlist
 *    and both post-purchase review pages still opening their own `<main>` on Solbrillen: the mount file is three
 *    lines, the `<main>` lived in the plugin, and a walk of `app/[locale]` alone never saw it. A dynamic `import(…)`
 *    (`next/dynamic`, `React.lazy`) or a `require(…)` counts as a mount too. A mounted `.tsx` that does not define
 *    its own default export — an `index.tsx` barrel, a page that is only a re-export shim — is followed through what
 *    it forwards (`export … from "…"`, or a name it binds from a module and exports again: `import X from "…"`, or at
 *    module scope `const X = require("…")` or `await import("…")`, a `.default` or `.Name` read off one, `{ default: X }`
 *    (R6, R7); `export default X` or `export default require("…")`, also in `(X)`, `X as T`, `X satisfies T`, `X!`) to
 *    the `.tsx` behind it, hop by hop, each module read once; a `.jsx` or `.js` is read as a `.tsx` is (R6-5). A `.ts`
 *    on that chain is followed the same way (a barrel may stand in front of a page) but holds no markup; styles and
 *    data (`.module.css`, `.json`) are passed over (R4). A mount or a forward the walk cannot follow to a file in the
 *    repo (a package, a path that does not exist, an `import(…)` whose argument is not a constant string — a template
 *    with a `${…}`, a variable, a `+` with one — unless its literal start rules out `@/plugins/`, R5) fails the run,
 *    naming the chain, instead of being skipped (NOMAIN-RATCHET). Modules are read with the TypeScript parser, not
 *    patterns (R3), and only what exists at runtime counts: `import type`, `export type`, an entry marked `type`
 *    (`{ type Props }`) and an import type (`type P = import("…").Props`) are neither a mount nor a hop. Next renders
 *    a route file's default export alone, so a route's re-export mounts its `default` and a shim reached for its
 *    default forwards only what carries it — a `generateMetadata` re-exported from a `.ts`, by the route or by the
 *    shim, is config, not a mount. A named import, an `import(…)` or a `require(…)` may take any export, so through
 *    one every forward is followed. A file opens a `<main>` when its syntax tree holds a `<main>` JSX element, or
 *    framer-motion's `<motion.main>` / `<m.main>` (R6, R7 — not any `.main`: `<icons.main>` is a component); a
 *    comment, a string or a regex naming one does not count (R5).
 *
 * Out of scope, on purpose: the design layer (`designs/<slug>/chrome.tsx` — an `ownsMain` pack's Shell is SUPPOSED to
 * render the one main), `app/admin/**` (its own layout), route handlers that emit a whole document
 * (`app/[locale]/[...missing]/route.ts` answers with its own `<html>`, so its `<main>` is the only one on that page),
 * and a page's component tree: a page that defines its default (`export default function …`, a `memo(…)` or
 * `next/dynamic` wrapper) is checked itself, not followed into the components it renders. Nor is a `<main>` that is
 * not JSX looked for: HTML in a string (`dangerouslySetInnerHTML`) or `createElement("main")`.
 *
 * This file ships in light/full scaffolds (`tests/unit` does), where the CLI has pruned modules and — from
 * create-cartwright 2.10 — the engine-only paths in `scaffold/engine-only.ts` (`app/[locale]/changelog` among them).
 * So every hard-coded path below is existence-guarded and the engine-only anchor is asserted only in the engine
 * checkout; a pruned scaffold stays green as long as it has at least one route file to walk. Paths are compared with
 * forward slashes whatever `path.sep` is — the scaffold may be on Windows.
 */
const ROOT = resolve(__dirname, "../..");
const APP_LOCALE_DIR = join(ROOT, "app", "[locale]");
/** The mirror exclude list never reaches a scaffold (same probe as repo-hygiene.test.ts). */
const isEngineCheckout = existsSync(join(ROOT, ".github", "sync-excludes.txt"));

/** Route files that render as children of a layout (and their `.static` twins), in any extension Next reads (R6-1). */
const ROUTE_FILE = /^(page|layout|not-found|error|loading|template|default|forbidden|unauthorized)(\.static)?\.[jt]sx?$/;
/** The layout that renders the `<main>` everything else under `app/[locale]` renders inside (R6-2). */
const OWNS_MAIN = /^app\/\[locale\]\/layout(\.static)?\.[jt]sx?$/;
/** Whether a repo-relative path is a route file the walk takes — on disk and in the virtual trees below alike. */
const rendersInLayout = (rel: string) => rel.startsWith("app/[locale]/") && ROUTE_FILE.test(posixPath.basename(rel)) && !OWNS_MAIN.test(rel);

/** Repo-relative, forward-slash paths that keep their own `<main>`, each with why. */
const ALLOWED_OWN_MAIN: Record<string, string> = {
  "app/[locale]/webmcp-check/page.tsx":
    "WebMCP surface, own slice — frozen, not touched by storefront a11y passes",
};

/** Repo-relative with forward slashes, so a key above matches on Windows too. */
const posix = (abs: string) => relative(ROOT, abs).split(sep).join("/");

/** What the walk reads, by repo-relative forward-slash path: the repo on disk, or a virtual tree in the self-checks. */
interface Tree {
  isFile(rel: string): boolean;
  read(rel: string): string;
}

const DISK: Tree = {
  isFile: (rel) => {
    const abs = join(ROOT, rel);
    return existsSync(abs) && statSync(abs).isFile();
  },
  read: (rel) => readFileSync(join(ROOT, rel), "utf8"),
};

const virtualTree = (files: Record<string, string>): Tree => ({
  isFile: (rel) => rel in files,
  read: (rel) => files[rel],
});

function walkRouteFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkRouteFiles(full, out);
    else if (rendersInLayout(posix(full))) out.push(posix(full));
  }
  return out;
}

/** Which exports a module is followed for: its `default` (all Next renders of a route file), or any of them. */
type Wanted = "default" | "*";

/** One edge of the walk: a specifier, and which exports of the module it names are taken from it. */
interface Hop {
  spec: string;
  wanted: Wanted;
  /** An `import(…)`/`require(…)` whose argument is not a string literal: it names no file the walk can read, so it is reported. */
  opaque?: true;
}

const wantedFrom = (source: string): Wanted => (source === "default" ? "default" : "*");

/**
 * A name a statement binds at runtime: `name` in this module (the local name an import binds, or the name a
 * re-export exports), `source` in the module the specifier names — `"default"`, a named export, or `"*"`, its
 * namespace. `export * from` binds `{ name: "*", source: "*" }`.
 */
type Binding = { name: string; source: string };

/** A static `import`/`export … from` with its runtime bindings, or an `import(…)`/`require(…)` call with what a `const` binds from it. */
interface Statement {
  keyword: "import" | "export" | "call";
  bindings: Binding[];
  /** The specifier — for a call whose argument is not a constant string, that argument as written. */
  spec: string;
  /** Only for such a call: the start every specifier it can produce shares (`fixedPrefix`). */
  fixedStart?: string;
}

/** What a module holds and exports again: `export default X` / `export { X as y }`; `local` is undefined when it defines the export. */
type OwnExport = { local?: string; exported: string };

/** `(X)`, `X as T`, `X satisfies T`, `X!`, `X<T>` and (in a `.ts`) `<T>X` all wrap the binding `X` in `.expression` (G2, R4). */
const TYPE_WRAPPERS = [
  ts.isParenthesizedExpression, ts.isAsExpression, ts.isSatisfiesExpression, ts.isNonNullExpression, ts.isExpressionWithTypeArguments,
  ts.isTypeAssertionExpression,
];

/** `import(…)` — `next/dynamic`, `React.lazy` — or `require(…)`. */
const isLoader = (callee: ts.Expression) =>
  callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require");

/** `const X = …` straight in the module, not in a function or a block: only there does X name what the module exports (R7-1). */
const atModuleScope = (node: ts.VariableDeclaration) =>
  ts.isVariableStatement(node.parent.parent) && ts.isSourceFile(node.parent.parent.parent);

/** `<main>`, or framer-motion's `<motion.main>` / `<m.main>`, which render one — not any `.main` (`<icons.main>`, R6-4, R7-5). */
const isMainTag = (tag: ts.JsxTagNameExpression): boolean => {
  if (ts.isIdentifier(tag)) return tag.text === "main";
  const library = ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) ? tag.expression.text : "";
  return ["motion", "m"].includes(library) && (tag as ts.PropertyAccessExpression).name.text === "main";
};

const runtimeEntries = (entries: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[]): Binding[] =>
  entries.filter((entry) => !entry.isTypeOnly).map(({ name, propertyName }) => ({ name: name.text, source: (propertyName ?? name).text }));

/**
 * The text every value of a specifier expression starts with, and whether that text is all of it: a literal's text, a
 * template's head, a `+` chain's literal operands from the left (R5: `"@/data/" + locale` names no plugin); else "".
 */
function fixedPrefix(node: ts.Expression): [text: string, whole: boolean] {
  if (ts.isStringLiteralLike(node)) return [node.text, true];
  if (ts.isTemplateExpression(node)) return [node.head.text, false];
  if (ts.isParenthesizedExpression(node)) return fixedPrefix(node.expression);
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return ["", false];
  const [left, leftWhole] = fixedPrefix(node.left);
  if (!leftWhole) return [left, false];
  const [right, rightWhole] = fixedPrefix(node.right);
  return [left + right, rightWhole];
}

/**
 * A module's statements in source order, and its own exports, read with the TypeScript parser (R3: the patterns
 * before it kept missing forms). Comments and strings are not code, a type-only clause or entry binds nothing, and an
 * import type (`import("…").Props`, `typeof import("…")`) is a type, not a call — so none of them mounts or forwards.
 * `opensMain` is whether it renders a `<main>` JSX element — a comment, a string or a regex naming one is not one (R5).
 * `path`'s extension picks the grammar: a `.ts` is not JSX, so `<T>X` there is a type assertion.
 */
function readModule(source: string, path = "module.tsx") {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const statements: Statement[] = [];
  const ownExports: OwnExport[] = [];
  /** What a module-scope `const X = require(…)` / `await import(…)` binds, or `export default` of one forwards, by call (R6-3, R7). */
  const callBindings = new Map<ts.Node, Binding[]>();
  const unwrap = (node: ts.Expression): ts.Expression =>
    ts.isAwaitExpression(node) || TYPE_WRAPPERS.some((is) => is(node)) ? unwrap((node as ts.AwaitExpression).expression) : node;
  /** The `require(…)`/`import(…)` an expression reads, and what of it: the module (`"*"`), or the `.name` read off it (R7-2/3). */
  const loaded = (expression: ts.Expression) => {
    const value = unwrap(expression);
    const call = ts.isPropertyAccessExpression(value) ? unwrap(value.expression) : value;
    const source = ts.isPropertyAccessExpression(value) ? value.name.text : "*";
    return ts.isCallExpression(call) && isLoader(call.expression) ? { call, source } : undefined;
  };
  /** The local an `export default require(…)` exports, as a name no declaration can bind (R7-2). */
  const loadedDefault = "export default";
  let opensMain = false;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const { name, namedBindings: named, phaseModifier } = node.importClause ?? {};
      const bindings = [
        ...(name ? [{ name: name.text, source: "default" }] : []),
        ...(!named ? [] : ts.isNamespaceImport(named) ? [{ name: named.name.text, source: "*" }] : runtimeEntries(named.elements)),
      ];
      const typeOnly = phaseModifier === ts.SyntaxKind.TypeKeyword;
      statements.push({ keyword: "import", bindings: typeOnly ? [] : bindings, spec: node.moduleSpecifier.text });
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      const clause = node.exportClause;
      // `export { … }` binds its entries; `export * from` binds the namespace, unnamed or `as ns`.
      const bindings =
        clause && ts.isNamedExports(clause) ? runtimeEntries(clause.elements) : [{ name: clause?.name.text ?? "*", source: "*" }];
      const spec = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
      if (spec !== undefined) statements.push({ keyword: "export", bindings, spec });
      else ownExports.push(...bindings.map(({ name, source }) => ({ local: source, exported: name })));
    } else if (ts.isExportAssignment(node)) {
      const [expression, read] = [unwrap(node.expression), loaded(node.expression)];
      if (read) callBindings.set(read.call, [{ name: loadedDefault, source: read.source }]);
      ownExports.push({ local: read ? loadedDefault : ts.isIdentifier(expression) ? expression.text : undefined, exported: "default" });
    } else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      if (node.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword)) ownExports.push({ exported: "default" });
    } else if (ts.isVariableDeclaration(node) && node.initializer && atModuleScope(node)) {
      const read = loaded(node.initializer);
      const whole = read?.source === "*";
      const names = ts.isObjectBindingPattern(node.name)
        ? node.name.elements.map(({ name, propertyName: key }) => ({ name, source: whole && key?.getText(file) === "default" ? "default" : "*" }))
        : [{ name: node.name, source: read?.source ?? "*" }];
      const bound = names.flatMap(({ name, source }) => (ts.isIdentifier(name) ? [{ name: name.text, source }] : []));
      if (read) callBindings.set(read.call, bound);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && isLoader(node.expression)) {
      const [argument] = node.arguments;
      const [prefix, whole] = fixedPrefix(argument);
      const spec = whole ? prefix : argument.getText(file).replace(/^`|`$/g, "");
      statements.push({ keyword: "call", bindings: callBindings.get(node) ?? [], spec, fixedStart: whole ? undefined : prefix });
    } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      opensMain ||= isMainTag(node.tagName);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { statements, ownExports, opensMain };
}

const PLUGINS = "@/plugins/";

/**
 * The `@/plugins/…` mounts in a route file, each with what the route takes from it. A static statement is read through
 * its runtime bindings: one that binds only types mounts nothing. Next renders a route file's default export and
 * nothing else (`generateMetadata` and the other named exports are config), so a re-export mounts its `default` alone,
 * and one without a default mounts nothing. An import of a default alone wants that default; a named or namespace
 * import, an `import(…)` or a `require(…)` may take any export. A call whose specifier cannot be read is an opaque
 * mount unless its fixed start rules out `@/plugins/` (`` import(`@/messages/${locale}.json`) `` is no mount).
 */
function pluginMounts(source: string, path?: string): Hop[] {
  return readModule(source, path).statements.flatMap(({ keyword, bindings, spec, fixedStart }): Hop[] => {
    if (fixedStart !== undefined) {
      return PLUGINS.startsWith(fixedStart) || fixedStart.startsWith(PLUGINS) ? [{ spec, wanted: "*", opaque: true }] : [];
    }
    if (!spec.startsWith(PLUGINS)) return [];
    if (keyword === "call") return [{ spec, wanted: "*" }];
    if (keyword === "export") {
      return bindings.filter(({ name }) => name === "default").map(({ source }) => ({ spec, wanted: wantedFrom(source) }));
    }
    if (bindings.length === 0) return [];
    return [{ spec, wanted: bindings.length === 1 ? wantedFrom(bindings[0].source) : "*" }];
  });
}

const pluginSpecifiers = (source: string) => pluginMounts(source).map(({ spec }) => spec);

/**
 * The file a specifier names — as written, `+ .tsx`, `+ .ts`, `/index.tsx`, `/index.ts`, then the same in `.jsx` and
 * `.js` (R6-5: a plugin in JS is not unresolved) — repo-relative, else null.
 * `@/…` starts at the repo root, `./…` and `../…` at the importing file's folder; a package name and a path outside the
 * repo are null.
 */
function resolveModule(spec: string, from: string, tree: Tree): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = posixPath.normalize(spec.slice("@/".length));
  else if (/^\.\.?(\/|$)/.test(spec)) base = posixPath.join(posixPath.dirname(from), spec);
  else return null;
  base = base.replace(/\/+$/, "");
  if (base === ".." || base.startsWith("../")) return null;
  const named = (exts: string[]) => [...exts.map((ext) => `${base}.${ext}`), ...exts.map((ext) => `${base}/index.${ext}`)];
  const candidates = [base, ...named(["tsx", "ts"]), ...named(["jsx", "js"])];
  return candidates.find((candidate) => tree.isFile(candidate)) ?? null;
}

/**
 * The hops a module at `path` forwards along, or [] when it is the page itself. A module that defines its own default
 * — `export default function …`, `class`, any expression, or a local name — is a page: its re-exports are helpers
 * (`generateMetadata` from a `.ts`), not where its markup comes from. Any other module (an `index.tsx` or `index.ts`
 * barrel, a re-export shim, a barrel of named exports) forwards through its `export … from "…"` and every name it binds
 * from a module and exports again (`import X from "…"` or `const X = require("…")`; `export default X` / `export { X }`),
 * by runtime bindings only — `export { type Props } from "./types"` is no hop. Followed for its `default`, it forwards
 * only what carries the default, so a shim's `generateMetadata` from a `.ts` is no hop either; followed for any export,
 * or when nothing it forwards is its default, it forwards all.
 */
function forwardedHops(source: string, wanted: Wanted = "*", path?: string): Hop[] {
  const { statements, ownExports } = readModule(source, path);
  const imported = new Map(
    statements
      .filter(({ keyword }) => keyword !== "export")
      .flatMap(({ bindings, spec }) => bindings.map(({ name, source }) => [name, { spec, source }] as const)),
  );
  const definesDefault = ownExports.some(
    ({ local, exported }) => exported === "default" && (local === undefined || !imported.has(local)),
  );
  if (definesDefault) return [];
  const forwards = [
    ...statements
      .filter(({ keyword }) => keyword === "export")
      .flatMap(({ bindings, spec }) => bindings.map(({ name, source }) => ({ exported: name, spec, source }))),
    ...ownExports.flatMap(({ local, exported }) => {
      const from = local === undefined ? undefined : imported.get(local);
      return from ? [{ exported, ...from }] : [];
    }),
  ];
  const carryDefault = forwards.filter(({ exported }) => exported === "default");
  const followed = wanted === "default" && carryDefault.length > 0 ? carryDefault : forwards;
  const hops = followed.map(({ spec, source }): Hop => ({ spec, wanted: wantedFrom(source) }));
  return [...new Map(hops.map((hop) => [`${hop.spec}|${hop.wanted}`, hop])).values()];
}

interface PluginWalk {
  /** The plugin-side `.tsx`, `.jsx` and `.js` files the walk reads: each mount, and every one a forwarding module leads
   *  to. A `.ts` it reads on the way is not listed: it holds no markup, so it is never an offender. */
  mounted: string[];
  /** Chains the walk cannot follow to a file — `route → module → … → specifier`. A `<main>` behind one would go unseen. */
  unresolved: string[];
}

/**
 * Follows every `@/plugins/…` mount in `routeFiles`, then each forwarding module's hops. A module is followed once
 * for its default and once for any export at most — once for any export covers both — which is the cycle guard.
 */
function walkPluginMounts(routeFiles: string[], tree: Tree): PluginWalk {
  const mounted = new Set<string>();
  const unresolved = new Set<string>();
  const followed = new Set<string>();
  const queue = routeFiles.flatMap((rel) => pluginMounts(tree.read(rel), rel).map((hop) => ({ chain: [rel], ...hop })));
  // for…of over an array also visits what the loop pushes onto it.
  for (const { chain, spec, wanted, opaque } of queue) {
    const file = opaque ? null : resolveModule(spec, chain[chain.length - 1], tree);
    if (!file) {
      unresolved.add([...chain, spec].join(" → "));
      continue;
    }
    // Styles, data and assets (`.module.css`, `.json`, `.svg`) render no markup and forward nothing (R4); a `.jsx` or
    // `.js` is markup like a `.tsx`, read in its own grammar (R6-5).
    if (!/\.[jt]sx?$/.test(file)) continue;
    if (!file.endsWith(".ts")) mounted.add(file);
    if (followed.has(`${file}|*`) || followed.has(`${file}|${wanted}`)) continue;
    followed.add(`${file}|${wanted}`);
    for (const hop of forwardedHops(tree.read(file), wanted, file)) queue.push({ chain: [...chain, file], ...hop });
  }
  return { mounted: [...mounted], unresolved: [...unresolved] };
}

/** The files among `files` that open a `<main>` and are not allowlisted. */
const mainOpeners = (files: string[], tree: Tree) =>
  files.filter((rel) => !(rel in ALLOWED_OWN_MAIN) && readModule(tree.read(rel), rel).opensMain);

describe("storefront pages do not nest a second <main> inside the layout's", () => {
  const routeFiles = walkRouteFiles(APP_LOCALE_DIR);
  const { mounted, unresolved } = walkPluginMounts(routeFiles, DISK);
  const walked = [...new Set([...routeFiles, ...mounted])];

  it("walks a meaningful set of files (the rule is not vacuous)", () => {
    expect(routeFiles.length, "app/[locale] has no route file to walk").toBeGreaterThan(0);
    // Existence-guarded: a scaffold may have pruned any of these and must stay green.
    const login = "app/[locale]/account/login/page.tsx";
    if (existsSync(join(ROOT, login))) expect(routeFiles).toContain(login);
    const wishlistMount = "app/[locale]/account/wishlist/page.tsx";
    const wishlistPage = "plugins/wishlist/pages/WishlistPage.tsx";
    if (existsSync(join(ROOT, wishlistMount)) && existsSync(join(ROOT, wishlistPage))) {
      expect(mounted, "the re-export walk must reach the plugin page a mount file points at").toContain(wishlistPage);
    }
    if (isEngineCheckout) {
      // The engine tree has everything, so here the walk is pinned hard — including
      // the engine-only changelog route a 2.10 scaffold no longer has.
      expect(routeFiles.length).toBeGreaterThan(20);
      expect(routeFiles).toContain(login);
      expect(routeFiles).toContain("app/[locale]/changelog/page.tsx");
      const pages = ["plugins/blog/pages/BlogIndexPage.tsx", "plugins/blog/pages/BlogPostPage.tsx", "plugins/reviews/pages/OrderReviewPage.tsx"];
      expect(mounted).toEqual(expect.arrayContaining([...pages, "plugins/reviews/pages/ReviewTokenPage.tsx", wishlistPage]));
    }
  });

  it("the plugin scan sees static, import() and require() mounts with any quote, and not prose, types or route config", () => {
    const blogIndex = "@/plugins/blog/pages/BlogIndexPage";
    expect(pluginSpecifiers(`export { default, generateMetadata } from "${blogIndex}";`)).toEqual([blogIndex]);
    expect(pluginSpecifiers("const Page = dynamic(() => import('@/plugins/x/pages/XPage'));")).toEqual(["@/plugins/x/pages/XPage"]);
    expect(pluginSpecifiers('const Lazy = lazy(() => import(\n  "@/plugins/y"\n));')).toEqual(["@/plugins/y"]);
    expect(pluginSpecifiers("const Page = dynamic(() => import(`@/plugins/t/pages/TPage`));")).toEqual(["@/plugins/t/pages/TPage"]);
    expect(pluginSpecifiers('const R = require("@/plugins/r/pages/RPage").default;')).toEqual(["@/plugins/r/pages/RPage"]);
    expect(pluginSpecifiers('// was: export { default } from "@/plugins/old/pages/Old"\n/* from "@/plugins/z" */')).toEqual([]);
    // Next renders a route file's default alone, so a re-export without one is config, not a mount (R2, A4).
    const config = 'export { default } from "@/plugins/a/pages/A";\nexport { generateMetadata } from "@/plugins/b/meta";';
    expect(pluginSpecifiers(`${config}\nexport * from "@/plugins/c";`)).toEqual(["@/plugins/a/pages/A"]);
    // Types bind nothing at runtime, so they mount nothing (R2, A7/A8) — a value beside a type still mounts.
    const types = ['import type { A } from "@/plugins/a";', 'import type B from "@/plugins/b";', 'import type * as C from "@/plugins/c";'];
    types.push('import { type D, type E as F } from "@/plugins/d";', 'import {\n  type G,\n} from "@/plugins/g";');
    types.push('export type { H } from "@/plugins/h";', 'export type * from "@/plugins/i";', 'export { type J } from "@/plugins/j";');
    expect(pluginSpecifiers(types.join("\n"))).toEqual([]);
    const values = ['import { type Props, ReviewList } from "@/plugins/r/List";', 'import Page, { type P } from "@/plugins/p/Page";'];
    values.push('import type, { Q } from "@/plugins/q";', 'export { Card as default } from "@/plugins/c/Card";');
    expect(pluginMounts(values.join("\n"))).toEqual([
      { spec: "@/plugins/r/List", wanted: "*" }, { spec: "@/plugins/p/Page", wanted: "default" },
      { spec: "@/plugins/q", wanted: "*" }, { spec: "@/plugins/c/Card", wanted: "*" },
    ]);
  });

  it("forwarding modules are followed, a page that defines its own default is not", () => {
    const hops = (source: string, wanted?: Wanted) => forwardedHops(source, wanted).map(({ spec }) => spec);
    expect(hops('export { default } from "./pages/Page";')).toEqual(["./pages/Page"]);
    expect(hops('import Real from "../components/Real";\nexport default Real;')).toEqual(["../components/Real"]);
    expect(hops('import { Real } from "./Real";\nexport { Real as default };')).toEqual(["./Real"]);
    expect(hops('export * from "./a";\nexport type { Props } from "./types";\nexport function Badge() { return <b />; }')).toEqual(["./a"]);
    // Runtime bindings only: an entry marked `type` is no hop, a value beside one is (R2).
    const typed = 'export { type Props, type Size as S } from "./types";\nexport { type Tone, Badge } from "./badge";';
    expect(hops(typed)).toEqual(["./badge"]);
    const typeImport = 'import { type Props } from "./types";\nimport Real from "./Real";\nexport { Props };\nexport default Real;';
    expect(hops(typeImport)).toEqual(["./Real"]);
    // `export default` with its name on the next line forwards; with a definition there it is a page (R2).
    expect(hops('import RealPage from "./RealPage";\nexport default\n  RealPage;')).toEqual(["./RealPage"]);
    expect(hops("export default\n  function Page() {\n    return <div />;\n  }")).toEqual([]);
    // Followed for its default, a shim forwards only what carries it (R2, A4); followed for any export, all of it.
    const shim = 'export { default } from "./Real";\nexport { generateMetadata } from "../lib/meta";';
    expect(forwardedHops(shim, "default")).toEqual([{ spec: "./Real", wanted: "default" }]);
    expect(forwardedHops(shim)).toEqual([{ spec: "./Real", wanted: "default" }, { spec: "../lib/meta", wanted: "*" }]);
    const renamed = 'export { Card as default } from "./Card";\nexport { meta } from "./meta";';
    expect(forwardedHops(renamed, "default")).toEqual([{ spec: "./Card", wanted: "*" }]);
    // Nothing it forwards is a default (an `export *` never carries one): all of it is followed.
    expect(hops('export * from "./a";\nexport { b } from "./b";', "default")).toEqual(["./a", "./b"]);
    // Pages: their default is their own, so their helper re-exports are not hops.
    const withHelper = 'export { generateMetadata } from "../lib/meta";\nexport default function Page() { return <div />; }';
    expect(hops(withHelper)).toEqual([]);
    expect(hops('import { memo } from "react";\nimport P from "./P";\nexport default memo(P);')).toEqual([]);
    expect(hops("const Page = () => null;\nexport default Page;")).toEqual([]);
  });

  /** A page that opens its own `<main>`, for the virtual trees below. */
  const page = 'export default function Page() {\n  return <main className="x">page</main>;\n}\n';
  /** The walk over a virtual tree: its route files are the keys the disk walk would take. */
  const run = (files: Record<string, string>) => {
    const tree = virtualTree(files);
    const routes = Object.keys(files).filter(rendersInLayout);
    const walk = walkPluginMounts(routes, tree);
    return { ...walk, offenders: mainOpeners([...routes, ...walk.mounted], tree) };
  };

  it("the walk follows barrels and shims to the <main> behind them, and reports what it cannot follow", () => {
    // An index.tsx barrel (R1 probe T3); prose and a type re-export in it are not hops.
    expect(
      run({
        "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz";',
        "plugins/zz/index.tsx":
          '// was: export { default } from "./pages/Old";\nexport type { Props } from "./types";\nexport { default } from "./pages/Page";',
        "plugins/zz/pages/Page.tsx": page,
      }),
    ).toEqual({ mounted: ["plugins/zz/index.tsx", "plugins/zz/pages/Page.tsx"], unresolved: [], offenders: ["plugins/zz/pages/Page.tsx"] });
    // A page that is only a shim, two hops deep, out of the plugin (R1 probe T3b).
    const deep = "components/Deep.tsx";
    expect(
      run({
        "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz/pages/Shim";',
        "plugins/zz/pages/Shim.tsx": 'import Real from "../components/Real";\nexport default Real;',
        "plugins/zz/components/Real.tsx": 'export { Deep as default } from "@/components/Deep";',
        "components/Deep.tsx": 'export function Deep() {\n  return <main />;\n}\n',
      }),
    ).toEqual({ mounted: ["plugins/zz/pages/Shim.tsx", "plugins/zz/components/Real.tsx", deep], unresolved: [], offenders: [deep] });
    // A backtick import() mount (R1 probe T4) and a require() mount.
    expect(
      run({
        "app/[locale]/t/page.tsx": "const P = dynamic(() => import(`@/plugins/zz/pages/Page`));\nexport default P;",
        "app/[locale]/r/page.tsx": 'const P = require("@/plugins/zz/pages/Other").default;\nexport default P;',
        "plugins/zz/pages/Page.tsx": page,
        "plugins/zz/pages/Other.tsx": page,
      }).offenders,
    ).toEqual(["plugins/zz/pages/Page.tsx", "plugins/zz/pages/Other.tsx"]);
    // What the walk cannot follow is reported with its whole chain, and the rest is still walked. (`./pages` names
    // neither `pages.tsx`/`.ts` nor `pages/index.tsx`/`.ts`; a `.ts` barrel there is followed — see R4.)
    expect(
      run({
        "app/[locale]/p/page.tsx": [
          'export { default } from "@/plugins/zz";',
          'import { Pkg } from "@/plugins/zz/widgets";',
          'const Gone = dynamic(() => import("@/plugins/gone"));',
          "const Any = dynamic(() => import(`@/plugins/${slug}/pages/Page`));",
        ].join("\n"),
        "plugins/zz/index.tsx": 'export { default } from "./pages";',
        "plugins/zz/pages/Page.tsx": page,
        "plugins/zz/widgets.tsx": 'export { Pkg } from "some-package";',
      }),
    ).toEqual({
      mounted: ["plugins/zz/index.tsx", "plugins/zz/widgets.tsx"],
      unresolved: [
        "app/[locale]/p/page.tsx → @/plugins/gone",
        "app/[locale]/p/page.tsx → @/plugins/${slug}/pages/Page",
        "app/[locale]/p/page.tsx → plugins/zz/index.tsx → ./pages",
        "app/[locale]/p/page.tsx → plugins/zz/widgets.tsx → some-package",
      ],
      offenders: [],
    });
    // A forwarding cycle ends: each module is read once.
    expect(
      run({
        "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz";',
        "plugins/zz/index.tsx": 'export * from "./a";',
        "plugins/zz/a.tsx": 'export * from "./index";',
      }),
    ).toEqual({ mounted: ["plugins/zz/index.tsx", "plugins/zz/a.tsx"], unresolved: [], offenders: [] });
  });

  it("a type-only import or re-export is not a mount, a multi-line export default is followed, and a default chain skips helpers (R2)", () => {
    // Codex P2 / Gemini MF1: an inline `type` entry re-exports nothing at runtime, so its types are not a hop. The types
    // here (and below) live in a .d.ts, which the walk cannot read, so a hop or mount to them would show as unresolved.
    expect(
      run({
        "app/[locale]/p/page.tsx": 'const P = dynamic(() => import("@/plugins/zz"));\nexport default P;',
        "plugins/zz/index.tsx": 'export { type Props, type Size as S } from "./types";\nexport { default } from "./pages/Page";',
        "plugins/zz/types.d.ts": "export type Props = {};\nexport type Size = number;",
        "plugins/zz/pages/Page.tsx": page,
      }),
    ).toEqual({ mounted: ["plugins/zz/index.tsx", "plugins/zz/pages/Page.tsx"], unresolved: [], offenders: ["plugins/zz/pages/Page.tsx"] });
    // Falsifier A7/A8: a route that imports or re-exports only types from a plugin mounts nothing.
    expect(
      run({
        "app/[locale]/p/page.tsx": [
          'import type { Post } from "@/plugins/blog/types";',
          'import { type Review, type Rating as R } from "@/plugins/reviews/types";',
          'export type { Props } from "@/plugins/zz/types";',
          'export { type Size } from "@/plugins/zz/types";',
          "export default function Page() {\n  return <div />;\n}",
        ].join("\n"),
        "plugins/blog/types.d.ts": "export type Post = {};",
        "plugins/reviews/types.d.ts": "export type Review = {};\nexport type Rating = number;",
        "plugins/zz/types.d.ts": "export type Props = {};\nexport type Size = number;",
      }),
    ).toEqual({ mounted: [], unresolved: [], offenders: [] });
    // Gemini MF2: `export default` with the name on the next line is a shim, not a page.
    expect(
      run({
        "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz/pages/Shim";',
        "plugins/zz/pages/Shim.tsx": 'import RealPage from "../components/RealPage";\n\nexport default\n  RealPage;\n',
        "plugins/zz/components/RealPage.tsx": page,
      }),
    ).toEqual({
      mounted: ["plugins/zz/pages/Shim.tsx", "plugins/zz/components/RealPage.tsx"], unresolved: [], offenders: ["plugins/zz/components/RealPage.tsx"],
    });
    // Falsifier A4: Next renders a route file's default only, so a route's or a shim's `generateMetadata` from a .ts is
    // not followed — the default chain is. That .ts forwards to a module that does not exist, so following it would show.
    const shims = {
      "plugins/zz/pages/Shim.tsx": 'export { default } from "./Real";\nexport { generateMetadata } from "../lib/meta";',
      "plugins/zz/pages/Shim2.tsx": 'import Real from "./Real";\nexport { generateMetadata } from "../lib/meta";\nexport default Real;',
      "plugins/zz/pages/Real.tsx": page,
      "plugins/zz/lib/meta.ts": 'export { generateMetadata } from "./gone";',
    };
    expect(
      run({
        "app/[locale]/p/page.tsx": 'export { default, generateMetadata } from "@/plugins/zz/pages/Shim";',
        "app/[locale]/q/page.tsx":
          'export { default } from "@/plugins/zz/pages/Shim2";\nexport { generateMetadata } from "@/plugins/zz/lib/meta";',
        ...shims,
      }),
    ).toEqual({
      mounted: ["plugins/zz/pages/Shim.tsx", "plugins/zz/pages/Shim2.tsx", "plugins/zz/pages/Real.tsx"],
      unresolved: [], offenders: ["plugins/zz/pages/Real.tsx"],
    });
    // An import() may take any export, so through one the shim's helper is still followed (through its .ts, R4), and reported.
    expect(
      run({
        "app/[locale]/p/page.tsx": 'const P = dynamic(() => import("@/plugins/zz/pages/Shim"));\nexport default P;',
        ...shims,
      }).unresolved,
    ).toEqual(["app/[locale]/p/page.tsx → plugins/zz/pages/Shim.tsx → plugins/zz/lib/meta.ts → ./gone"]);
  });

  it("an import type is no mount, an import() it cannot read fails closed, and a cast default export forwards (R3)", () => {
    // Codex P2-1: an import type is erased, so the plugin's types (a .d.ts the walk cannot read) are no mount and no chain.
    const typesOnly = 'type P = import("@/plugins/blog/types").Post;\ntype M = typeof import("@/plugins/blog/types");';
    const typedRoute = { "app/[locale]/p/page.tsx": `${typesOnly}\nexport default function Page() {}`, "plugins/blog/types.d.ts": "" };
    expect(run(typedRoute)).toEqual({ mounted: [], unresolved: [], offenders: [] });
    // Codex P2-2: a quote inside a `${…}`, or a variable, hides the target: reported, never skipped. A fixed start
    // that rules out a plugin is no mount.
    const opaqueRoute = [
      'const P = dynamic(() => import(`@/plugins/${on ? "a" : "b"}/Page`));',
      "const Q = dynamic(() => import(target));",
      "const messages = await import(`@/messages/${locale}.json`);",
    ].join("\n");
    expect(run({ "app/[locale]/p/page.tsx": opaqueRoute, "plugins/a/Page.tsx": page, "plugins/b/Page.tsx": page }).unresolved).toEqual([
      'app/[locale]/p/page.tsx → @/plugins/${on ? "a" : "b"}/Page',
      "app/[locale]/p/page.tsx → target",
    ]);
    // Gemini G2: a shim exporting its import through parentheses or a type assertion forwards to it.
    const shim = (expression: string) => `import RealPage from "../components/RealPage";\nexport default ${expression};`;
    for (const expression of ["RealPage as any", "(RealPage)", "RealPage!", "RealPage satisfies object", "(RealPage as unknown) as P"]) {
      expect(forwardedHops(shim(expression), "default"), expression).toEqual([{ spec: "../components/RealPage", wanted: "default" }]);
    }
    const castShim = { "plugins/zz/pages/Shim.tsx": shim("RealPage as any"), "plugins/zz/components/RealPage.tsx": page };
    expect(run({ "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz/pages/Shim";', ...castShim }).offenders).toEqual([
      "plugins/zz/components/RealPage.tsx",
    ]);
  });

  it("a plugin's .ts barrel is followed, its .ts helpers, styles and data pass, and a missing file is still reported (R4)", () => {
    const blog = (route: string) => ({
      "app/[locale]/p/page.tsx": route,
      "plugins/blog/lib/posts.ts": 'import { db } from "@/lib/db";\nexport const getPosts = () => db;',
      "plugins/blog/blog.module.css": ".list { display: grid; }",
      "plugins/blog/config.json": "{}",
      "plugins/blog/pages/index.ts": 'export { default } from "./BlogIndexPage";\nexport const sample = "<main>";',
      "plugins/blog/pages/BlogIndexPage.tsx": page,
    });
    const clean = { mounted: [], unresolved: [], offenders: [] };
    // A .ts helper holds no markup, and a CSS module or JSON is no module the walk reads: none is mounted or unresolved.
    expect(run(blog('import { getPosts } from "@/plugins/blog/lib/posts";'))).toEqual(clean);
    expect(run(blog('import s from "@/plugins/blog/blog.module.css";\nimport c from "@/plugins/blog/config.json";'))).toEqual(clean);
    // A .ts barrel in front of a .tsx page is followed to it; the barrel is never an offender itself.
    const index = "plugins/blog/pages/BlogIndexPage.tsx";
    expect(run(blog('export { default } from "@/plugins/blog/pages";'))).toEqual({ mounted: [index], unresolved: [], offenders: [index] });
    // A file that does not exist — a helper, a stylesheet — is still reported.
    const missing = 'import { gone } from "@/plugins/blog/lib/gone";\nimport s from "@/plugins/blog/gone.module.css";';
    expect(run(blog(missing)).unresolved).toEqual([
      "app/[locale]/p/page.tsx → @/plugins/blog/lib/gone",
      "app/[locale]/p/page.tsx → @/plugins/blog/gone.module.css",
    ]);
  });

  it("a .ts shim's cast forwards, a + specifier is read by its literal start, and a <main> is JSX (R5)", () => {
    // R4 nit 4 and R5-1: `<T>X` (a type assertion — a .ts is read as TypeScript, not JSX) and `X<T>` (an
    // instantiation expression) both export the binding X.
    for (const expression of ["<any>P", "P<Props>"]) {
      const hops = forwardedHops(`import P from "./P";\nexport default ${expression};`, "default", "plugins/zz/Shim.ts");
      expect(hops, expression).toEqual([{ spec: "./P", wanted: "default" }]);
    }
    // R5-3: data built with `+` is no mount, a plugin path behind a variable is reported, literals alone are followed.
    const concat = [
      'const messages = await import("@/data/" + params.locale + ".json");',
      'const P = dynamic(() => import("@/plugins/" + slug));',
      'const R = dynamic(() => import("@/plugins/zz/" + slug + "Page"));',
      'const Q = dynamic(() => import("@/plugins/zz/" + "Page"));',
    ].join("\n");
    const [variable, gap] = ['"@/plugins/" + slug', '"@/plugins/zz/" + slug + "Page"'].map((spec) => `app/[locale]/p/page.tsx → ${spec}`);
    expect(run({ "app/[locale]/p/page.tsx": concat, "plugins/zz/Page.tsx": page })).toEqual({
      mounted: ["plugins/zz/Page.tsx"], unresolved: [variable, gap], offenders: ["plugins/zz/Page.tsx"],
    });
    // R5-2: an apostrophe before a trailing comment, or a `//` inside a regex, once fooled the line-based comment stripper.
    const commented = {
      "app/[locale]/a/page.tsx": 'const note = "Don\'t wrap this in main"; // Layout renders <main>\nexport default function A() {}',
      "app/[locale]/b/page.tsx": "export default function B() { const re = /a[ //]b/; return <main />; }",
    };
    expect(run(commented).offenders).toEqual(["app/[locale]/b/page.tsx"]);
    const jsx = ['// <main> is the layout\'s\nconst el = <main className="x">page</main>;', 'const s = "a // b";\nconst el = <main />;'];
    const text = ["const a = 1; // renders <main>\n/* <main> */ const b = <div />;", 'const html = "<main>"; // see <main>'];
    text.push("const el = <Main />;");
    expect([...jsx, ...text].map((source) => readModule(source).opensMain)).toEqual([true, true, false, false, false]);
  });

  it("a template, a parallel route's default and forbidden/unauthorized are route files, as .tsx, .ts, .jsx or .js (R5-4, R6-1)", () => {
    // Next's default `pageExtensions`; each is read in its own grammar: `<any>0` in a .ts is a cast, not a JSX tag
    // swallowing the mount after it.
    const inLayout = ["page.tsx", "template.tsx", "default.tsx", "forbidden.tsx", "unauthorized.tsx", "template.static.tsx"];
    inLayout.push("page.ts", "page.jsx", "page.js", "not-found.static.ts");
    const outside = ["route.ts", "category-skeleton.tsx", "page.d.ts", "page.mdx"];
    expect([...inLayout, ...outside].filter((name) => ROUTE_FILE.test(name))).toEqual(inLayout);
    const [js, plugin] = ["app/[locale]/k/page.js", "plugins/zz/pages/Page.tsx"];
    const files = { "app/[locale]/p/page.ts": 'const cast = <any>0;\nexport { default } from "@/plugins/zz/pages/Page";', [js]: page };
    expect(run({ ...files, [plugin]: page })).toEqual({ mounted: [plugin], unresolved: [], offenders: [js, plugin] });
  });

  it("a nested layout under app/[locale] is walked; app/[locale]/layout, which owns the <main>, and app/admin are not (R6-2)", () => {
    // app/layout.tsx renders no <main>, so nothing outside app/[locale] renders inside one.
    const layout = "export default function L({ children }) {\n  return <main>{children}</main>;\n}\n";
    const [nested, blogLayout] = ["app/[locale]/shop/layout.tsx", "plugins/zz/BlogLayout.tsx"];
    const owners = Object.fromEntries(["layout.tsx", "layout.static.tsx", "layout.js"].map((name) => [`app/[locale]/${name}`, layout]));
    const mount = { "app/[locale]/blog/layout.static.tsx": 'export { default } from "@/plugins/zz/BlogLayout";', [blogLayout]: layout };
    const admin = { "app/admin/layout.tsx": layout, "app/admin/page.tsx": page };
    const walk = run({ ...owners, [nested]: layout, ...mount, ...admin });
    expect(walk).toEqual({ mounted: [blogLayout], unresolved: [], offenders: [nested, blogLayout] });
  });

  it("a shim that exports a require() or await import() binding again forwards to that module (R6-3)", () => {
    // The binding, its `.default` or `{ default: X }` of it is an import binding; a `dynamic(…)` binding is the wrapper.
    const real = "../components/Real";
    const bindings = [`const Real = require("${real}");`, `const Real = require("${real}").default;`, `let Real = await import("${real}");`];
    bindings.push(`const { default: Real } = await import("${real}");`, `const Real = (await import("${real}")).default;`);
    const hops = (binding: string) => forwardedHops(`${binding}\nexport default Real;`, "default").map(({ spec }) => spec);
    expect(bindings.map(hops)).toEqual(bindings.map(() => [real]));
    expect(hops(`const Real = dynamic(() => import("${real}"));`)).toEqual([]);
    const shim = { "plugins/zz/pages/Shim.tsx": `${bindings[0]}\nexport default Real;`, "plugins/zz/components/Real.tsx": page };
    const route = { "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz/pages/Shim";' };
    expect(run({ ...route, ...shim }).offenders).toEqual(["plugins/zz/components/Real.tsx"]);
  });

  it("framer-motion's <motion.main> and <m.main> open a <main>; <icons.main>, <x.y.main>, <Main>, <x.mainContent> do not (R6-4, R7-5)", () => {
    const tags = ['<motion.main className="x">a</motion.main>', "<motion.main />", "<m.main />"];
    tags.push("<icons.main />", "<x.y.main />", "<a.motion.main />", "<Main />", "<x.mainContent />", "<main.Header />");
    expect(tags.map((tag) => readModule(`const el = ${tag};`).opensMain)).toEqual([true, true, true, false, false, false, false, false, false]);
  });

  it("a plugin module in .jsx or .js resolves and is mounted and checked like a .tsx, named with or without its extension (R6-5)", () => {
    const [jsx, barrel, js] = ["plugins/js/pages/Page.jsx", "plugins/js/index.js", "plugins/js/pages/Other.js"];
    const routes = ["@/plugins/js/pages/Page", "@/plugins/js", "@/plugins/js/pages/Page.jsx"].map((spec, i) => [
      `app/[locale]/${i}/page.tsx`, `export { default } from "${spec}";`,
    ]);
    const files = { ...Object.fromEntries(routes), [barrel]: 'export { default } from "./pages/Other";', [jsx]: page, [js]: page };
    expect(run(files)).toEqual({ mounted: [jsx, barrel, js], unresolved: [], offenders: [jsx, js] });
    // The TS candidates keep their order and come first: `A.ts` before `A/index.tsx`, `B/index.ts` before `B.jsx`.
    const order = virtualTree({ "p/A.ts": "", "p/A/index.tsx": "", "p/B/index.ts": "", "p/B.jsx": "" });
    expect(["@/p/A", "@/p/B"].map((spec) => resolveModule(spec, "app/x.tsx", order))).toEqual(["p/A.ts", "p/B/index.ts"]);
  });

  it("only a module-scope require() or await import() binds a name; a nested one shadows nothing the shim exports (R7-1)", () => {
    const nested = ["function meta() {", '  const Page = require("./metadata");', "  return Page;", "}"];
    nested.push("async function load() {", '  const { default: Page } = await import("./metadata");', "  return Page;", "}");
    const shim = ['import Page from "./RealPage";', ...nested, "export default Page;"].join("\n");
    const [real, files] = ["plugins/zz/pages/RealPage.tsx", { "plugins/zz/pages/metadata.ts": "export const title = 1;" }];
    expect(forwardedHops(shim, "default")).toEqual([{ spec: "./RealPage", wanted: "default" }]);
    const route = { "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz/pages/Shim";', "plugins/zz/pages/Shim.tsx": shim };
    const walk = run({ ...route, ...files, [real]: page });
    expect(walk).toEqual({ mounted: ["plugins/zz/pages/Shim.tsx", real], unresolved: [], offenders: [real] });
  });

  it("export default require(…), its .default and (await import(…)).default forward like export default X (R7-2)", () => {
    const forms = ['export default require("./RealPage");', 'export default require("./RealPage").default;'];
    forms.push('export default (await import("./RealPage")).default;', 'export default (require("./RealPage") as { default: P }).default;');
    expect(forms.map((form) => forwardedHops(form, "default").map(({ spec }) => spec))).toEqual(forms.map(() => ["./RealPage"]));
    expect(forwardedHops('export default dynamic(() => import("./RealPage"));')).toEqual([]);
    const shim = { "plugins/zz/pages/Shim.tsx": forms[2], "plugins/zz/pages/RealPage.tsx": page };
    const route = { "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz/pages/Shim";' };
    expect(run({ ...route, ...shim }).offenders).toEqual(["plugins/zz/pages/RealPage.tsx"]);
  });

  it("a named export read off a require() or await import() is bound like a named import, wanting any export (R7-3)", () => {
    const forms = ['const P = require("./Pages").Page;\nexport default P;', 'const P = (await import("./Pages")).Page;\nexport default P;'];
    forms.push('export default require("./Pages").Page;');
    expect(forms.map((form) => forwardedHops(form, "default"))).toEqual(forms.map(() => [{ spec: "./Pages", wanted: "*" }]));
    const pages = "plugins/zz/pages/Pages.tsx";
    const shim = { "plugins/zz/pages/Shim.tsx": forms[0], [pages]: "export function Page() {\n  return <main />;\n}\n" };
    const route = { "app/[locale]/p/page.tsx": 'export { default } from "@/plugins/zz/pages/Shim";' };
    expect(run({ ...route, ...shim }).offenders).toEqual([pages]);
  });

  it("a destructured require() of a helper is followed exactly as the named import it stands for, found or missing (R7-4)", () => {
    const named = (spec: string) => `import { helper } from "${spec}";`;
    const destructured = (spec: string) => `const { helper } = require("${spec}");`;
    const tree = (bind: (spec: string) => string, helper: string) => ({
      "app/[locale]/p/page.tsx": `${bind(`@/plugins/zz/lib/${helper}`)}\nconst P = dynamic(() => import("@/plugins/zz"));\nexport default P;`,
      "plugins/zz/index.tsx": `${bind(`./lib/${helper}`)}\nexport { helper };\nexport { default } from "./pages/Page";`,
      "plugins/zz/lib/util.ts": "export const helper = () => 1;",
      "plugins/zz/pages/Page.tsx": page,
    });
    for (const helper of ["util", "gone"]) expect(run(tree(destructured, helper)), helper).toEqual(run(tree(named, helper)));
    const found = { mounted: ["plugins/zz/index.tsx", "plugins/zz/pages/Page.tsx"], unresolved: [], offenders: ["plugins/zz/pages/Page.tsx"] };
    expect(run(tree(destructured, "util"))).toEqual(found);
    expect(run(tree(destructured, "gone")).unresolved).toEqual([
      "app/[locale]/p/page.tsx → @/plugins/zz/lib/gone",
      "app/[locale]/p/page.tsx → plugins/zz/index.tsx → ./lib/gone",
    ]);
  });

  it("every plugin mount a route file names, and every module it forwards to, resolves to a file the walk reads", () => {
    expect(resolveModule("@/plugins/__no_such_plugin__/pages/Page", "app/[locale]/page.tsx", DISK)).toBeNull();
    expect(
      unresolved,
      `The <main> walk cannot follow these chains to a file in the repo (a package, an import(…) of something other than a string literal, or a path that does not exist), so a <main> behind them would go unseen. Point the route — or the barrel — at the page component's .tsx file directly, or teach resolveModule / readModule to follow the form:\n  ${unresolved.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the layout is what provides the main landmark", () => {
    const layouts = ["layout.tsx", "layout.static.tsx"].map((name) => join(APP_LOCALE_DIR, name)).filter(existsSync);
    expect(layouts.length, "app/[locale] has no layout to provide <main>").toBeGreaterThan(0);
    for (const layout of layouts) {
      expect(readModule(readFileSync(layout, "utf8"), layout).opensMain, `${posix(layout)} must render <main>`).toBe(true);
    }
  });

  it("no route file, mounted plugin page or module a mount forwards to opens its own <main> unless allowlisted", () => {
    const offenders = mainOpeners(walked, DISK);
    expect(
      offenders,
      `These render a <main> inside the layout's <main> (two main landmarks) — a route file, or a .tsx a route mounts or forwards to. Render a <div> with the same className instead, or add the file to ALLOWED_OWN_MAIN with a reason:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still renders its own <main> (no stale exemptions)", () => {
    for (const [rel, reason] of Object.entries(ALLOWED_OWN_MAIN)) {
      expect(reason.length, `${rel} needs a reason`).toBeGreaterThan(10);
      if (!existsSync(join(ROOT, rel))) {
        // A scaffold may have pruned it; only the engine tree, where the list is kept, must notice.
        expect(isEngineCheckout, `${rel} is allowlisted but no longer exists`).toBe(false);
        continue;
      }
      expect(walked, `${rel} exists but the walk does not reach it`).toContain(rel);
      const { opensMain } = readModule(readFileSync(join(ROOT, rel), "utf8"), rel);
      expect(opensMain, `${rel} no longer renders <main> — drop it from the allowlist`).toBe(true);
    }
  });
});
