import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Master Plan §4 Phase 6 — architectural guard test.
 *
 * Scans the lib/negotiation/ directory's source text for any import or
 * reference that would bring an LLM call into the negotiation engine. The
 * §3.2 hard rule states the engine must be pure TypeScript with no LLM
 * imports — this test enforces it at CI time so that an accidental refactor
 * cannot violate the rule.
 *
 * Patterns considered violations:
 *   - import from '@ai-sdk/*' or anthropic, openai, gemini packages
 *   - import from any 'lib/ai/' path
 *   - usage of chatModel, generateText, streamText, embed, generateObject
 *
 * If this test fails, DO NOT add an exception. Either the offending code
 * doesn't belong in the engine (move it out to a caller that handles the
 * post-decision translation layer §3.2), or the §3.2 rule itself needs
 * revisiting (which is a much bigger conversation).
 */

const NEGOTIATION_DIR = resolve(__dirname, "../../../lib/negotiation");

/** Substrings that flag an LLM dependency. Case-sensitive on purpose. */
const FORBIDDEN_PATTERNS = [
  "@ai-sdk/",
  "from \"anthropic",
  "from 'anthropic",
  "from \"openai",
  "from 'openai",
  "from \"@anthropic-ai/",
  "from '@anthropic-ai/",
  "@google/generative-ai",
  "@ai-sdk/google",
  "lib/ai/",
  "@/lib/ai",
  // Function-name patterns (these are AI SDK call shapes):
  "chatModel(",
  "generateText(",
  "streamText(",
  "embed(",
  "generateObject(",
  "streamObject(",
] as const;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip JS/TS comments (block /* ... *​/ and line // ...) from source so the
 * pattern scanner only inspects actual code. Without this, the engine's own
 * JSDoc comments mentioning "@ai-sdk/" as forbidden patterns would
 * (correctly per substring match) trip the scanner.
 *
 * Simple state machine, no edge-case parsing needed: comments inside string
 * literals are vanishingly rare in TS source and would be flagged for review.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString: '"' | "'" | "`" | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch as '"' | "'" | "`";
    }
    out += ch;
    i++;
  }
  return out;
}

describe("Anchor-and-Resume engine — no LLM imports (§3.2 hard rule)", () => {
  const files = listSourceFiles(NEGOTIATION_DIR);

  it("at least one source file exists in lib/negotiation/", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const relative = file.slice(NEGOTIATION_DIR.length + 1);

    it(`${relative} has no LLM-import or LLM-call pattern`, () => {
      const raw = readFileSync(file, "utf8");
      // Strip comments + the test file itself's forbidden-pattern table:
      // documentation that LISTS forbidden patterns must not trip the scan.
      const source = stripComments(raw);
      const hits: string[] = [];
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (source.includes(pattern)) {
          hits.push(pattern);
        }
      }
      expect(hits, `Forbidden patterns found: ${hits.join(", ")}`).toEqual([]);
    });
  }

  it("synthetic violation is correctly detected", () => {
    // Self-test for the scanner: confirm it would catch a real violation
    // by checking a snippet against the patterns.
    const violatingSource = `
      import { chatModel } from "@/lib/ai/client";
      export function badEngine() { return chatModel(); }
    `;
    let detected = false;
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (violatingSource.includes(pattern)) {
        detected = true;
        break;
      }
    }
    expect(detected).toBe(true);
  });
});
