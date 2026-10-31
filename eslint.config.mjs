import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noServerComponentEventHandlers from "./eslint-rules/no-server-component-event-handlers.mjs";
import noModuleScopeHeavyConstruction from "./eslint-rules/no-module-scope-heavy-construction.mjs";
import noModuleScopeLocalFontRead from "./eslint-rules/no-module-scope-local-font-read.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent git-worktrees are full nested copies of the repo. Without this,
    // local `pnpm lint` lints every worktree too (24 copies → 1.2M problems,
    // ~50-min run); CI never sees it (a fresh clone has no worktrees).
    ".claude/worktrees/**",
    // Same shape: gitignored replayed projects from an agent-replay harness
    // (whole scaffolds with their own lint findings). A fresh clone has none.
    "**/agent-replays/**",
  ]),
  {
    rules: {
      // Honour the underscore convention the codebase already uses
      // (_input, _confirm, _t, …) and allow rest-sibling omits.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // The `cartwright` plugin namespace must be declared exactly once in a flat
    // config (a second `plugins: { cartwright: … }` block fails hard with
    // "Cannot redefine plugin"). Declared here with no `files` so it applies
    // everywhere; the blocks below decide which rule runs on which files.
    plugins: {
      cartwright: {
        rules: {
          "no-server-component-event-handlers": noServerComponentEventHandlers,
          "no-module-scope-heavy-construction": noModuleScopeHeavyConstruction,
          "no-module-scope-local-font-read": noModuleScopeLocalFontRead,
        },
      },
    },
  },
  {
    // Catch event handlers in Server Components at lint time (tsc + next build
    // both miss them; the crash is runtime-only). Local rule — see the header
    // of eslint-rules/no-server-component-event-handlers.mjs for why no plugin
    // and the documented per-file limitation. Test files are excluded: they
    // run in Node/jsdom where RSC boundary semantics don't apply.
    files: ["**/*.tsx"],
    ignores: ["tests/**"],
    rules: {
      "cartwright/no-server-component-event-handlers": "error",
    },
  },
  {
    // No module may construct a heavy or fragile resource at import time.
    // Server modules get pulled in by barrels (lib/tools/registry.ts statically
    // imports ~20 tool modules and is imported by 16 files), so a module-scope
    // side effect becomes every importer's problem — and one broken transitive
    // dependency takes down unrelated pages. See the header of
    // eslint-rules/no-module-scope-heavy-construction.mjs for the incident.
    //
    // scripts/** and tests/** are entry points, not imported by product code:
    // paying at load is correct there.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["tests/**", "scripts/**"],
    rules: {
      "cartwright/no-module-scope-heavy-construction": "error",
    },
  },
  {
    // A next/font/local binding read at module scope breaks `pnpm build`:
    // /api/admin/designs/[slug]/export imports every pack, and in that
    // route-handler layer Turbopack drops a single-importer next/font/local
    // import, so `${font.variable}` at import time throws "is not defined".
    // Read it at render time instead. See the header of
    // eslint-rules/no-module-scope-local-font-read.mjs (FONT-LOCAL-ROUTE-DROP).
    files: ["designs/**/*.ts", "designs/**/*.tsx", "app/fonts/**/*.ts", "app/fonts/**/*.tsx"],
    rules: {
      "cartwright/no-module-scope-local-font-read": "error",
    },
  },
  {
    // ORD1-a1: the money path does not read the order-status table. What a row
    // says decides how a status looks in the admin, never a payment, a stock
    // move or a refund, so these files keep their literals until a slice moves
    // one on purpose. tests/unit/orders/status-money-path.test.ts lints each of
    // them, and walks the disk for what this rule cannot see: dynamic imports,
    // and an import of the table further down what these files import.
    files: [
      "app/api/webhook/**/*.{ts,tsx}",
      "app/api/cron/reconcile-stripe/**/*.{ts,tsx}",
      "app/api/checkout/**/*.{ts,tsx}",
      "app/\\[locale\\]/checkout/**/*.{ts,tsx}",
      "app/admin/ordrer/actions.ts",
      "lib/acp/complete.ts",
      "lib/money.ts",
      "lib/stripe.ts",
      "lib/orders/cancel-payment.ts",
      "lib/orders/cancel-unpaid.ts",
      "lib/orders/create*.ts",
      "lib/orders/notify-owner.ts",
      "lib/orders/lifecycle.ts",
      "lib/orders/on-paid.ts",
      "lib/orders/operator-status.ts",
      "lib/orders/restock.ts",
      "lib/orders/status.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/status-reader", "**/status-table", "**/status-seed"],
              message:
                "The money path keeps its literals: it may not read the order-status table (ORD1-a1, lib/orders/status-table.ts).",
            },
          ],
        },
      ],
    },
  },
  {
    // The WooCommerce importer feeds lookups straight into catalogue writes: a `!` on one
    // turned a refused parent into `undefined`, which Prisma reads as "leave it out", and a
    // child was committed as a root (W21-live-2 spec, INV-2). A missing value is decided, never asserted.
    files: ["lib/woo/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
]);

export default eslintConfig;
