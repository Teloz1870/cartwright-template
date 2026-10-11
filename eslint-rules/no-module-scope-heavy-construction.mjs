/**
 * Local ESLint rule: no-module-scope-heavy-construction
 *
 * Catches "cause and effect a whole subsystem apart" at LINT time: a heavy or
 * fragile resource constructed at MODULE SCOPE, so that merely *importing* the
 * file pays for it — and fails on it.
 *
 * The incident that motivated it: `lib/v0/transform/sanitize-strict.ts` built
 * its jsdom window at module scope. That module is reachable from
 * `lib/tools/registry.ts` — a barrel that statically imports ~20 tool modules —
 * which 14 files import, including `app/admin/audit/page.tsx`, a page that
 * wants nothing from it but `getTool()`. A downstream fork's audit log died at
 * module-load on jsdom's CJS→ESM `require` boundary
 * (`html-encoding-sniffer` → `@exodus/bytes`). Nobody debugging an audit log
 * would think to look in a v0 transform, and a module-load failure kills the
 * whole page rather than the one function that wanted the resource.
 *
 * The rule is: **no module may construct a heavy or fragile resource at import
 * time.** Server modules get pulled in by barrels, and a barrel makes any
 * module-scope side effect every importer's problem. Build it lazily in a
 * memoised getter instead — the cost and the failure then land at the call,
 * where they belong, and a security gate still fails closed.
 *
 * Zero-false-positive scoping — the rule only reports `new X(...)` at the top
 * level of a module (Program body), for an explicit allowlist of constructors
 * that are all either heavy (a DOM implementation, a browser engine), or hold a
 * connection/handle (DB, cache), or wrap a network client keyed on config that
 * may not be loaded yet. Anything inside a function, class body, arrow, or a
 * lazily-invoked IIFE is fine by construction — that is the fix, not the smell.
 *
 * Deliberately NOT flagged:
 * - `scripts/**` — one-shot CLIs that nothing imports; paying at load is the
 *   point there (`scripts/backfill-media-assets.ts` constructs a PrismaClient).
 * - `tests/**` — test files are entry points, not imported by product code.
 * - `lib/db.ts` — the single, intentional Prisma singleton the whole app shares;
 *   it is the one module whose entire job is to own that construction. It is
 *   listed as an explicit file-level exemption in eslint.config.mjs rather than
 *   silently special-cased here.
 */

/** Constructors whose construction is heavy, fragile, or connection-bearing. */
const HEAVY = new Set([
  "JSDOM",
  "PrismaClient",
  "Redis",
  "OpenAI",
  "Anthropic",
  "Resend",
  "Stripe",
  "GoogleGenerativeAI",
  "S3Client",
]);

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow constructing heavy or fragile resources at module scope; build them lazily in a memoised getter so import stays free and failures land at the call.",
    },
    schema: [],
    messages: {
      moduleScope:
        "`new {{name}}()` at module scope: importing this file constructs it. A barrel makes that every importer's problem — one broken transitive dependency then takes down unrelated pages. Move it into a memoised getter (see lib/v0/transform/sanitize-strict.ts).",
    },
  },

  create(context) {
    return {
      NewExpression(node) {
        if (node.callee.type !== "Identifier" || !HEAVY.has(node.callee.name)) return;

        // Only report when the construction runs as part of evaluating the
        // module itself. Walking up to Program through anything that defers
        // execution (function/arrow/class/method) means it is already lazy.
        for (let cur = node.parent; cur; cur = cur.parent) {
          switch (cur.type) {
            case "FunctionDeclaration":
            case "FunctionExpression":
            case "ArrowFunctionExpression":
            case "ClassBody":
              return; // deferred — this is the shape we want
            case "Program":
              context.report({
                node,
                messageId: "moduleScope",
                data: { name: node.callee.name },
              });
              return;
            default:
              break;
          }
        }
      },
    };
  },
};

export default rule;
