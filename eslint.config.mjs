import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noServerComponentEventHandlers from "./eslint-rules/no-server-component-event-handlers.mjs";
import noModuleScopeHeavyConstruction from "./eslint-rules/no-module-scope-heavy-construction.mjs";

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
]);

export default eslintConfig;
