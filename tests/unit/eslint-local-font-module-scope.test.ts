// Lint-time guard for FONT-LOCAL-ROUTE-DROP.
//
// In the route-handler layer (`/api/admin/designs/[slug]/export` imports every
// design pack) Turbopack drops the import of a next/font/local module that has
// a single importer. A pack that reads such a binding's `.variable` at module
// scope therefore fails `pnpm build` with "<binding> is not defined" — minutes
// into the build, on a route nobody was editing (crema hit it in FONT1-c-A1).
// Reads inside a component or function never run there and are fine.
//
// The rule is exercised through eslint's Linter on snippets (same harness as
// eslint-module-scope-heavy-construction.test.ts), then over every pack and
// font module on disk, so the tree it ships with is proven clean.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../eslint-rules/no-module-scope-local-font-read.mjs";

const linter = new Linter();

function lint(code: string, filename = "designs/x/chrome.tsx"): Linter.LintMessage[] {
  return linter.verify(
    code,
    {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
        parser: tsParser,
        parserOptions: { sourceType: "module", ecmaFeatures: { jsx: true } },
      },
      plugins: {
        cartwright: { rules: { "no-module-scope-local-font-read": rule } },
      },
      rules: { "cartwright/no-module-scope-local-font-read": "error" },
    },
    filename,
  );
}

describe("eslint-rules/no-module-scope-local-font-read", () => {
  it("flags the shape that broke the build (crema's module-scope class string)", () => {
    const messages = lint(`
      import { Fraunces as cremaDisplay } from "./fraunces/font";
      import { InstrumentSans as cremaSans } from "./instrument-sans/font";
      export const cremaFontVars = \`\${cremaDisplay.variable} \${cremaSans.variable}\`;
    `);
    expect(messages).toHaveLength(2);
    expect(messages[0].message).toContain("`cremaDisplay.variable` is read at module scope");
    expect(messages[0].message).toContain("wrap it in a function");
  });

  it("flags an app/fonts import read at module scope (the brutalist reproduction)", () => {
    const messages = lint(`
      import { Archivo as display } from "@/app/fonts/archivo/font";
      export const VARS = display.variable;
      const cls = display.className;
      const fam = display.style.fontFamily;
      export { cls, fam };
    `);
    expect(messages.map((m) => m.line)).toEqual([3, 4, 5]);
  });

  it("flags a binding declared in the same file with next/font/local", () => {
    const messages = lint(
      `
      import localFont from "next/font/local";
      export const Body = localFont({ src: "./body.woff2", variable: "--font-body" });
      export const bodyVar = Body.variable;
    `,
      "app/fonts/body/font.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("`Body.variable`");
  });

  it("still flags a read inside a top-level conditional or object literal", () => {
    const messages = lint(`
      import { SpaceMono as mono } from "@/app/fonts/space-mono/font";
      export const theme = { mono: mono.variable };
      let v = "";
      if (process.env.X) { v = mono.className; }
      export { v };
    `);
    expect(messages).toHaveLength(2);
  });

  it("flags destructuring of a font at module scope (R1: no MemberExpression)", () => {
    const messages = lint(`
      import { Archivo as display } from "@/app/fonts/archivo/font";
      export const { variable: fontVars, className } = display;
      let style;
      ({ style } = display);
      export { style };
    `);
    expect(messages.map((m) => m.line)).toEqual([3, 3, 5]);
    expect(messages[0].message).toContain("`display.variable`");
  });

  it("flags reads that run at module load inside an IIFE or a class definition (R1)", () => {
    const messages = lint(`
      import { Archivo as display } from "@/app/fonts/archivo/font";
      export const A = (() => display.variable)();
      export const B = (function () { return display.className; })();
      export class Theme {
        static vars = display.variable;
        static { void display.style; }
        [display.className]() {}
      }
    `);
    expect(messages.map((m) => m.line)).toEqual([3, 4, 6, 7, 8]);
  });

  it("flags chained, aliased, namespace and template-key reads (R1)", () => {
    const messages = lint(
      `
      import localFont from "next/font/local";
      import * as Fonts from "./archivo/font";
      import { Archivo as display } from "@/app/fonts/archivo/font";
      export const a = localFont({ src: "./b.woff2" }).variable;
      const alias = display;
      export const b = alias.className;
      export const c = Fonts.Archivo.variable;
      export const d = display[\`style\`];
    `,
      "app/fonts/x/font.tsx",
    );
    expect(messages.map((m) => m.line)).toEqual([5, 7, 8, 9]);
  });

  it("flags a module-scope read whose import sits below it (R2: imports are hoisted)", () => {
    const messages = lint(`
      export const vars = display.variable;
      import { Archivo as display } from "@/app/fonts/archivo/font";
    `);
    expect(messages.map((m) => m.line)).toEqual([2]);
  });

  it("flags a font destructured out of a namespace import, and .call/.apply IIFEs (R2)", () => {
    const messages = lint(`
      import * as Fonts from "@/app/fonts/archivo/font";
      import { Archivo as display } from "@/app/fonts/archivo/font";
      const { Archivo } = Fonts;
      export const v = Archivo.variable;
      export const { Archivo: { className } } = Fonts;
      export const A = (() => display.variable).call(null);
      export const B = (function () { return display.style; }).apply(null, []);
    `);
    expect(messages.map((m) => m.line)).toEqual([5, 6, 7, 8]);
  });

  it("does NOT flag an unrelated binding that shares a name with a font alias (R2: scope)", () => {
    expect(
      lint(`
        import { Archivo as display } from "@/app/fonts/archivo/font";
        export function Header() {
          const theme = display;
          return <header className={theme.variable} />;
        }
        const theme = { variable: "--custom" };
        export const v = theme.variable;
        export const w = (() => { const display = { className: "x" }; return display.className; })();
        { const display = { style: 1 }; void display.style; }
      `),
    ).toEqual([]);
  });

  it("does NOT flag deferred class members or non-invoked function expressions", () => {
    expect(
      lint(`
        import { Archivo as display } from "@/app/fonts/archivo/font";
        export class T {
          vars = display.variable;
          static get v() { return display.className; }
          static make = () => display.style;
          render({ variable } = display) { return variable; }
        }
        export const later = [() => display.variable];
        export function f() { const { className } = display; return className; }
      `),
    ).toEqual([]);
  });

  it("does NOT flag the fix: the read wrapped in a function (cremaFontVars())", () => {
    expect(
      lint(`
        import { Fraunces as cremaDisplay } from "./fraunces/font";
        export const cremaFontVars = () => \`\${cremaDisplay.variable}\`;
        export function vars() { return cremaDisplay.className; }
      `),
    ).toEqual([]);
  });

  it("does NOT flag a read inside a component (how brutalist survives on main)", () => {
    expect(
      lint(`
        import { Archivo as display } from "@/app/fonts/archivo/font";
        export function Header() {
          return <header className={display.variable} style={{ fontFamily: display.style.fontFamily }} />;
        }
        export class Legacy { render() { return display.className; } }
      `),
    ).toEqual([]);
  });

  it("does NOT flag next/font/google bindings or unrelated imports", () => {
    expect(
      lint(`
        import { Fraunces } from "next/font/google";
        import { tokens } from "./fonts-meta";
        import { fontSize } from "@/lib/fontsize";
        const display = Fraunces({ subsets: ["latin"], variable: "--font-x" });
        export const vars = \`\${display.variable} \${tokens.variable} \${fontSize.style}\`;
      `),
    ).toEqual([]);
  });

  it("does NOT flag other properties or type-only imports", () => {
    expect(
      lint(`
        import type { Archivo } from "@/app/fonts/archivo/font";
        import { SpaceMono as mono } from "@/app/fonts/space-mono/font";
        type T = typeof Archivo;
        export const name = mono.toString;
        export type { T };
      `),
    ).toEqual([]);
  });
});

// The tree this ships with must be clean: every pack and self-hosted font
// module on disk. Walks the filesystem (no git — scaffolds have none); a
// scaffold that pruned packs simply walks fewer files.
const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

describe("no pack or font module reads a next/font/local binding at module scope", () => {
  const files = [...walk(path.join(ROOT, "designs")), ...walk(path.join(ROOT, "app/fonts"))];

  it("walks real files (not vacuous)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every file is clean", () => {
    const offenders = files.flatMap((file) =>
      lint(fs.readFileSync(file, "utf8"), file)
        // A parse error or an unmatched config counts too: either would let a
        // file pass without the rule ever running on it. Only the "Definition
        // for rule … was not found" noise from the packs' own eslint-disable
        // comments (rules this bare Linter does not load) is ignored.
        .filter((m) => !(m.ruleId && m.ruleId !== "cartwright/no-module-scope-local-font-read"))
        .filter((m) => !/^Definition for rule '.+' was not found\.$/.test(m.message))
        .map((m) => `${path.relative(ROOT, file)}:${m.line} ${m.message}`),
    );
    expect(offenders).toEqual([]);
  });
});
