// Lint-time guard for the "cause and effect a whole subsystem apart" class.
//
// `lib/v0/transform/sanitize-strict.ts` built its jsdom window at module scope,
// so *importing* it constructed one. That module is reachable from
// `lib/tools/registry.ts` — a barrel that statically imports ~20 tool modules,
// imported in turn by 14 files including `app/admin/audit/page.tsx` (which
// wants only `getTool()`). A downstream fork's audit log died at module-load on
// jsdom's CJS→ESM require boundary. No test could see it: every existing test
// asserted that the sanitizer *behaves*, never that importing it is free.
//
// These tests run the rule through eslint's Linter on snippets covering both
// the shape that must be flagged and the lazy shapes that MUST NOT be
// (zero-false-positive contract) — same harness as
// eslint-server-event-handlers.test.ts.
import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../eslint-rules/no-module-scope-heavy-construction.mjs";

const linter = new Linter();

function lint(code: string): Linter.LintMessage[] {
  return linter.verify(code, {
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: "module" },
    },
    plugins: {
      cartwright: { rules: { "no-module-scope-heavy-construction": rule } },
    },
    rules: { "cartwright/no-module-scope-heavy-construction": "error" },
  });
}

describe("eslint-rules/no-module-scope-heavy-construction", () => {
  it("flags the exact shape that broke production (jsdom at module scope)", () => {
    const messages = lint(`
      import { JSDOM } from "jsdom";
      const { window } = new JSDOM("");
      export function sanitize(html: string) { return window.document.title + html; }
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("module scope");
    expect(messages[0].message).toContain("JSDOM");
  });

  it("flags every listed connection/client constructor at module scope", () => {
    for (const name of ["PrismaClient", "Redis", "OpenAI", "Anthropic", "Resend", "Stripe"]) {
      const messages = lint(`const x = new ${name}();`);
      expect(messages, `${name} should be flagged`).toHaveLength(1);
    }
  });

  it("does NOT flag the memoised-getter fix (the shape we want)", () => {
    const messages = lint(`
      import { JSDOM } from "jsdom";
      let instance: unknown = null;
      function getPurify() {
        if (instance) return instance;
        const { window } = new JSDOM("");
        instance = window;
        return instance;
      }
      export { getPurify };
    `);
    expect(messages).toEqual([]);
  });

  it("does NOT flag construction inside an arrow function or a class method", () => {
    expect(
      lint(`
        import { JSDOM } from "jsdom";
        export const make = () => new JSDOM("");
      `),
    ).toEqual([]);

    expect(
      lint(`
        import { PrismaClient } from "@prisma/client";
        export class Db { connect() { return new PrismaClient(); } }
      `),
    ).toEqual([]);
  });

  it("does NOT flag ordinary constructors — the allowlist is narrow on purpose", () => {
    const messages = lint(`
      const started = new Date();
      const cache = new Map<string, string>();
      const seen = new Set<string>();
      const re = new RegExp("^x");
      export { started, cache, seen, re };
    `);
    expect(messages).toEqual([]);
  });

  it("still flags a top-level conditional — it runs during module evaluation", () => {
    // A guard does not make it lazy: the module still pays on import whenever
    // the condition holds, which is exactly how an environment-dependent
    // module-load crash hides in review.
    const messages = lint(`
      import { JSDOM } from "jsdom";
      let dom;
      if (process.env.NODE_ENV !== "test") { dom = new JSDOM(""); }
      export { dom };
    `);
    expect(messages).toHaveLength(1);
  });

  it("reports the constructor name so the message names the culprit", () => {
    const messages = lint(`const r = new Redis();`);
    expect(messages[0].message).toContain("`new Redis()`");
  });
});
