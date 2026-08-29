// Lint-time guard for the RSC event-handler footgun: `onClick` in a file
// without "use client" passes tsc AND next build, then crashes at runtime
// ("Event handlers cannot be passed to Client Component props"). The local
// rule eslint-rules/no-server-component-event-handlers.mjs catches it at
// `pnpm lint`. These tests run the rule through eslint's Linter on TSX
// snippets covering both the crash cases and the legal patterns that MUST NOT
// be flagged (zero-false-positive contract).
import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../eslint-rules/no-server-component-event-handlers.mjs";

const linter = new Linter();

function lint(code: string): Linter.LintMessage[] {
  return linter.verify(code, {
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: {
      cartwright: { rules: { "no-server-component-event-handlers": rule } },
    },
    rules: { "cartwright/no-server-component-event-handlers": "error" },
  });
}

describe("eslint-rules/no-server-component-event-handlers", () => {
  it("flags onClick on a host element in a file without 'use client' (the Gemini bug)", () => {
    const messages = lint(`
      export default function Page() {
        return <button onClick={() => console.log("hi")}>Click</button>;
      }
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('"use client"');
    expect(messages[0].message).toContain("onClick");
  });

  it("flags handler identifiers on host elements too", () => {
    const messages = lint(`
      function handle() {}
      export function Card() {
        return <div onMouseEnter={handle} />;
      }
    `);
    expect(messages).toHaveLength(1);
  });

  it("flags inline functions passed as on* props to components", () => {
    const messages = lint(`
      import { Tabs } from "./tabs";
      export function Page() {
        return <Tabs onSelect={() => fetch("/x")} />;
      }
    `);
    expect(messages).toHaveLength(1);
  });

  it("does NOT flag anything in a 'use client' file", () => {
    const messages = lint(`
      "use client";
      export function Counter() {
        return <button onClick={() => alert(1)}>+</button>;
      }
    `);
    expect(messages).toHaveLength(0);
  });

  it("recognises the directive after other prologue directives", () => {
    const messages = lint(`
      "use strict";
      "use client";
      export const X = () => <input onChange={() => {}} />;
    `);
    expect(messages).toHaveLength(0);
  });

  it("does NOT flag Server Actions passed as on* props to components", () => {
    const messages = lint(`
      import { saveDraft } from "./actions";
      import { Editor } from "./editor";
      export function Page() {
        return <Editor onSave={saveDraft} />;
      }
    `);
    expect(messages).toHaveLength(0);
  });

  it("does NOT flag inline 'use server' actions passed to components", () => {
    const messages = lint(`
      import { Form } from "./form";
      export function Page() {
        return <Form onSubmit={async () => { "use server"; }} />;
      }
    `);
    expect(messages).toHaveLength(0);
  });

  it("does NOT flag non-handler props that merely contain 'on' (durationS etc.)", () => {
    const messages = lint(`
      export function Marquee({ durationS }: { durationS: number }) {
        return <Track durationS={durationS} />;
      }
      function Track(_p: { durationS: number }) { return null; }
    `);
    expect(messages).toHaveLength(0);
  });

  it("does NOT flag onClick={undefined} (serializable, doesn't crash)", () => {
    const messages = lint(`
      export function Card() {
        return <div onClick={undefined} />;
      }
    `);
    expect(messages).toHaveLength(0);
  });
});
