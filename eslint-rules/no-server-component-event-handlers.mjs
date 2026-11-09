/**
 * Local ESLint rule: no-server-component-event-handlers
 *
 * Catches the classic AI/RSC footgun at LINT time instead of runtime: an
 * `onClick`/`onChange`/… JSX prop in a file WITHOUT a "use client" directive.
 * `tsc` and `next build` both accept it, but the page crashes at request time
 * with "Event handlers cannot be passed to Client Component props".
 *
 * Why a local rule and not a plugin:
 * - `@next/eslint-plugin-next` (installed) has NO rule for this — verified
 *   against its rule list; the check only exists at runtime.
 * - `eslint-plugin-react-server-components` exists but is a new dependency and
 *   is per-file heuristic too — it does not understand the import graph any
 *   better than this rule does. Not worth a dep for the same heuristic.
 *
 * Honest limitation (documented, deliberate): the "use client" boundary is an
 * IMPORT-GRAPH property — a file without the directive that is only ever
 * imported from client components is legally a client module. No lint rule
 * (plugin or local) can see that per-file. We accept the tradeoff because the
 * fix for such a (rare) false positive is adding an explicit "use client",
 * which is semantically a no-op for a file already in the client bundle and
 * better hygiene anyway. The current codebase has zero such files.
 *
 * Zero-false-positive scoping — the rule only reports the two cases that are
 * unambiguously runtime crashes in a Server Component:
 * 1. on* prop with an expression value on a HOST element (`<button onClick=`):
 *    host elements can never receive function props from a server file (not
 *    even Server Actions — those only work on `action`/`formAction`).
 *    `onClick={undefined}` is skipped (serializable, doesn't crash).
 * 2. on* prop on a COMPONENT whose value is an INLINE function without a
 *    "use server" directive (`<Tabs onSelect={() => …}>`): an inline closure
 *    can't cross the boundary. Identifier values are skipped — they may be
 *    imported Server Actions, which ARE legal to pass as on* props.
 */

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow event-handler JSX props in files without a "use client" directive (Server Components crash at runtime).',
    },
    schema: [],
    messages: {
      hostHandler:
        'Event handler `{{name}}` on `<{{element}}>` in a file without "use client" — Server Components cannot attach event handlers; this passes tsc and next build but crashes at runtime. Add "use client" as the first line of this file, or move the interactive part into a client component.',
      inlineHandler:
        'Inline function passed as `{{name}}` to `<{{element}}>` in a file without "use client" — functions cannot cross the server→client boundary (unless they are Server Actions); this crashes at runtime. Add "use client" to this file, pass a Server Action instead, or move the handler into the client component.',
    },
  },

  create(context) {
    const { sourceCode } = context;

    // "use client" must sit in the directive prologue (leading string-literal
    // expression statements). Scan exactly that prologue.
    let isClientFile = false;
    for (const stmt of sourceCode.ast.body) {
      if (
        stmt.type === "ExpressionStatement" &&
        stmt.expression.type === "Literal" &&
        typeof stmt.expression.value === "string"
      ) {
        if (stmt.expression.value === "use client") {
          isClientFile = true;
          break;
        }
        continue; // other directives ("use strict") — keep scanning prologue
      }
      break; // prologue over
    }
    if (isClientFile) return {};

    /** Does a function body start with a "use server" directive? */
    const isServerAction = (fn) =>
      fn.body.type === "BlockStatement" &&
      fn.body.body.some(
        (s, i) =>
          i === 0 &&
          s.type === "ExpressionStatement" &&
          s.expression.type === "Literal" &&
          s.expression.value === "use server",
      );

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !/^on[A-Z]/.test(node.name.name)) return;
        if (!node.value || node.value.type !== "JSXExpressionContainer") return;

        const expr = node.value.expression;
        const opening = node.parent; // JSXOpeningElement
        if (!opening || opening.type !== "JSXOpeningElement") return;
        const elName =
          opening.name.type === "JSXIdentifier" ? opening.name.name : sourceCode.getText(opening.name);

        const isHostElement = opening.name.type === "JSXIdentifier" && /^[a-z]/.test(elName);

        if (isHostElement) {
          // `onClick={undefined}` is serializable — skip.
          if (expr.type === "Identifier" && expr.name === "undefined") return;
          context.report({
            node,
            messageId: "hostHandler",
            data: { name: node.name.name, element: elName },
          });
          return;
        }

        // Component: only inline functions are unambiguous (identifiers may be
        // Server Actions, which are legal).
        if (
          (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") &&
          !isServerAction(expr)
        ) {
          context.report({
            node,
            messageId: "inlineHandler",
            data: { name: node.name.name, element: elName },
          });
        }
      },
    };
  },
};

export default rule;
