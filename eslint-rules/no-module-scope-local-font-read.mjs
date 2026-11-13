/**
 * Local ESLint rule: no-module-scope-local-font-read
 *
 * Catches a build break that only shows up in `pnpm build`, minutes in, on a
 * route nobody was editing: a `next/font/local` binding read at MODULE SCOPE.
 *
 * The incident (FONT1-c-A1, Next 16.4.2 + Turbopack): in the route-handler
 * layer — `/api/admin/designs/[slug]/export` imports every design pack through
 * designs/index.ts — Turbopack drops the import of a `next/font/local` module
 * that has a single importer. A component body never runs there, so a read
 * inside it is harmless; a module-scope read runs as the pack is imported and
 * fails "Collecting page data" with `ReferenceError: <binding> is not defined`.
 * Crema's `cremaFontVars` hit it; brutalist's Archivo/Space Grotesk imports are
 * dropped the same way on main and survive only because they are read inside
 * components. Reproduced on main by adding
 * `export const X = \`${display.variable}\`` to designs/brutalist/chrome.tsx:
 * "Failed to collect configuration for /api/admin/designs/[slug]/export …
 * ReferenceError: display is not defined".
 *
 * The fix is to read the binding at render time — wrap the read in a function
 * (`const fontVars = () => `${display.variable}``, as #711 does for crema's
 * `cremaFontVars()`), or read it inside the component.
 *
 * What counts as a local-font binding (static, no module resolution):
 * - a name imported from a module whose path ends in `/font` — the repo's
 *   self-hosting convention, `app/fonts/<family>/font.ts` (and a pack's own
 *   `designs/<slug>/fonts/<family>/font.ts`), each a `next/font/local` module;
 * - a name bound in this file to a call of the default import of
 *   `next/font/local` (`const X = localFont({...})`).
 * - a plain alias of either (`const d = display`), and a member of a namespace
 *   import of a `/font` module (`import * as F from "./x/font"` → `F.Archivo`,
 *   or destructured: `const { Archivo } = F`).
 * Bindings are tracked per scope-analysis variable, not per name, and imports
 * are collected up front (they are hoisted), so neither a shadowing local nor
 * an `import` below its first use changes the verdict.
 * A read is `<font>.variable` / `.className` / `.style` (dot, string or
 * no-substitution template key) or a destructuring of those keys
 * (`const { variable } = display`), evaluated while the module itself
 * evaluates. A function body is deferred unless the function is invoked on the
 * spot (an IIFE, including `.call(…)` / `.apply(…)`); a class body is deferred except what runs when the class is
 * defined — `static` field values, `static {}` blocks and computed member keys.
 * `next/font/google` bindings are deliberately not covered: they were not
 * seen to be dropped (designs/crema/fonts.ts reads them at module scope on main
 * and builds).
 */

const READ_PROPS = new Set(["variable", "className", "style"]);

/** `@/app/fonts/archivo/font`, `./fraunces/font`, `../fonts/x/font.ts`. */
const FONT_MODULE = /(^|\/)font(\.(ts|tsx|js|mjs))?$/;

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow reading a next/font/local binding's .variable/.className/.style at module scope; Turbopack can drop the font import in the route-handler layer, so the read throws at build time.",
    },
    schema: [],
    messages: {
      moduleScope:
        "`{{name}}.{{prop}}` is read at module scope, but `{{name}}` is a next/font/local binding. In the route-handler layer (/api/admin/designs/[slug]/export imports every pack) Turbopack drops a single-importer next/font/local import, so this read fails `pnpm build` with \"{{name}} is not defined\". Read it at render time: wrap it in a function (`export const fontVars = () => `${{{name}}.variable}``) or read it inside the component.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    // Font status lives on the scope-analysis Variable, not on a name, so an
    // unrelated `theme` in another scope, or a local that shadows an imported
    // font, is never mistaken for one.
    /** Variables bound to a next/font/local instance. */
    const fontVars = new Set();
    /** Namespace imports of a `/font` module (`import * as F`). */
    const namespaceVars = new Set();
    /** `next/font/local`'s default export (usually `localFont`). */
    const localFontFnVars = new Set();

    /** The Variable an identifier refers to, walking out from its scope. */
    function resolve(id) {
      for (let scope = sourceCode.getScope(id); scope; scope = scope.upper) {
        const v = scope.set.get(id.name);
        if (v) return v;
      }
      return null;
    }

    function addDeclared(set, node) {
      for (const v of sourceCode.getDeclaredVariables(node)) set.add(v);
    }

    /** Is `n` an expression that evaluates to a next/font/local instance? */
    function isFontExpr(n) {
      if (!n) return false;
      if (n.type === "TSAsExpression" || n.type === "TSNonNullExpression" || n.type === "TSSatisfiesExpression") {
        return isFontExpr(n.expression);
      }
      if (n.type === "Identifier") return fontVars.has(resolve(n));
      if (n.type === "CallExpression") {
        return n.callee.type === "Identifier" && localFontFnVars.has(resolve(n.callee));
      }
      if (n.type === "MemberExpression") return isNamespace(n.object); // `F.Archivo`
      return false;
    }

    function isNamespace(n) {
      return !!n && n.type === "Identifier" && namespaceVars.has(resolve(n));
    }

    function fontLabel(n) {
      if (n.type === "Identifier") return n.name;
      if (n.type === "CallExpression") return `${n.callee.name}(…)`;
      // `F.Archivo`, also the synthetic one checkPattern builds (no range).
      if (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier") {
        return `${n.object.name}.${n.property.name}`;
      }
      return sourceCode.getText(n);
    }

    /** Static property key: `a.b`, `a["b"]`, `` a[`b`] ``, `{ b: x }`. */
    function staticKey(key, computed) {
      if (!computed && key.type === "Identifier") return key.name;
      if (key.type === "Literal") return String(key.value);
      if (key.type === "TemplateLiteral" && key.expressions.length === 0) {
        return key.quasis[0].value.cooked;
      }
      return null;
    }

    /** True when `node` runs while the module evaluates. */
    function isModuleScope(node) {
      let prev = node;
      for (let cur = node.parent; cur; prev = cur, cur = cur.parent) {
        switch (cur.type) {
          case "FunctionDeclaration":
            return false; // runs when called — the fix
          case "FunctionExpression":
          case "ArrowFunctionExpression": {
            // An IIFE runs now: `(() => display.variable)()`, and its
            // `.call(…)` / `.apply(…)` forms.
            const p = cur.parent;
            if ((p.type === "CallExpression" || p.type === "NewExpression") && p.callee === cur) break;
            if (
              p.type === "MemberExpression" &&
              p.object === cur &&
              ["call", "apply"].includes(staticKey(p.property, p.computed)) &&
              p.parent.type === "CallExpression" &&
              p.parent.callee === p
            ) {
              break;
            }
            return false;
          }
          case "MethodDefinition":
          case "TSAbstractMethodDefinition":
            // A computed key runs at class definition; the method body
            // (a FunctionExpression) already returned above.
            if (prev === cur.key && cur.computed) break;
            return false;
          case "PropertyDefinition":
          case "AccessorProperty":
            if (prev === cur.key && cur.computed) break; // `[display.variable] = 1`
            if (cur.static) break; // `static vars = display.variable`
            return false; // instance field: runs on `new`
          case "StaticBlock":
            break; // `static { … }` runs at class definition
          case "Program":
            return true;
          default:
            break;
        }
      }
      return false;
    }

    function report(node, name, prop) {
      if (!isModuleScope(node)) return;
      context.report({ node, messageId: "moduleScope", data: { name, prop } });
    }

    /**
     * Destructuring: from a font, the read keys are reads
     * (`const { variable } = display`); from a namespace import, each member
     * is a font (`const { Archivo } = F`, `const { Archivo: { variable } } = F`).
     */
    function checkPattern(pattern, source) {
      const fromFont = isFontExpr(source);
      const fromNamespace = !fromFont && isNamespace(source);
      if (!fromFont && !fromNamespace) return;
      for (const prop of pattern.properties) {
        if (prop.type !== "Property") continue;
        const key = staticKey(prop.key, prop.computed);
        if (fromFont) {
          if (key && READ_PROPS.has(key)) report(prop, fontLabel(source), key);
          continue;
        }
        const value = prop.value.type === "AssignmentPattern" ? prop.value.left : prop.value;
        if (value.type === "Identifier") {
          const v = resolve(value);
          if (v) fontVars.add(v);
        } else if (value.type === "ObjectPattern" && key) {
          checkPattern(value, {
            type: "MemberExpression",
            object: source,
            property: { type: "Identifier", name: key },
            computed: false,
          });
        }
      }
    }

    return {
      // Imports are hoisted: collect them all before any read is checked, so
      // a read above its `import` line is still caught.
      Program(program) {
        for (const node of program.body) {
          if (node.type !== "ImportDeclaration") continue;
          const source = String(node.source.value);
          if (source === "next/font/local") {
            for (const s of node.specifiers) {
              if (s.type === "ImportDefaultSpecifier") addDeclared(localFontFnVars, s);
            }
            continue;
          }
          if (!FONT_MODULE.test(source) || node.importKind === "type") continue;
          for (const s of node.specifiers) {
            if (s.type === "ImportSpecifier" && s.importKind === "type") continue;
            addDeclared(s.type === "ImportNamespaceSpecifier" ? namespaceVars : fontVars, s);
          }
        }
      },

      VariableDeclarator(node) {
        // `const X = localFont({...})`, the alias `const d = display`, `const A = F.Archivo`.
        if (node.id.type === "Identifier" && isFontExpr(node.init)) addDeclared(fontVars, node);
      },

      MemberExpression(node) {
        if (!isFontExpr(node.object)) return;
        const prop = staticKey(node.property, node.computed);
        if (!prop || !READ_PROPS.has(prop)) return;
        report(node, fontLabel(node.object), prop);
      },

      // `const { variable } = display`, `({ className } = display)`.
      ObjectPattern(node) {
        const p = node.parent;
        const source =
          p.type === "VariableDeclarator" && p.id === node
            ? p.init
            : (p.type === "AssignmentExpression" || p.type === "AssignmentPattern") && p.left === node
              ? p.right
              : null;
        if (source) checkPattern(node, source);
      },
    };
  },
};

export default rule;
