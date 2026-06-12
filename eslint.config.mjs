import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noServerComponentEventHandlers from "./eslint-rules/no-server-component-event-handlers.mjs";

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
    // Catch event handlers in Server Components at lint time (tsc + next build
    // both miss them; the crash is runtime-only). Local rule — see the header
    // of eslint-rules/no-server-component-event-handlers.mjs for why no plugin
    // and the documented per-file limitation. Test files are excluded: they
    // run in Node/jsdom where RSC boundary semantics don't apply.
    files: ["**/*.tsx"],
    ignores: ["tests/**"],
    plugins: {
      cartwright: {
        rules: {
          "no-server-component-event-handlers": noServerComponentEventHandlers,
        },
      },
    },
    rules: {
      "cartwright/no-server-component-event-handlers": "error",
    },
  },
]);

export default eslintConfig;
