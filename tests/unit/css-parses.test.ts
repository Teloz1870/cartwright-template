import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

/**
 * Every design-pack and theme stylesheet must PARSE. Born from a real outage
 * class: a prose comment naming two token families with a slash between
 * their wildcard suffixes — the star-slash sequence in the middle
 * terminates the CSS comment and turns the rest of the sentence into
 * syntax — which passed tsc and the whole unit suite (nothing parsed the
 * CSS) and then killed `next dev`/`next build` at PostCSS time for EVERY
 * page, because designs/index.ts transitively imports every pack's CSS.
 * A parse check is milliseconds; a dev server that cannot boot is not.
 * (This very docblock reproduced the bug in its first draft. Respect.)
 */
function cssFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...cssFilesUnder(p));
    else if (name.endsWith(".css")) out.push(p);
  }
  return out;
}

const files = [
  ...cssFilesUnder(join(process.cwd(), "designs")),
  ...cssFilesUnder(join(process.cwd(), "themes")),
  join(process.cwd(), "app/globals.css"),
];

describe("stylesheets parse", () => {
  it("found the stylesheet population (guard against a silently empty walk)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${file.replace(process.cwd() + "/", "")} parses`, () => {
      // Tailwind at-rules (@theme, @utility, @layer …) are fine here —
      // postcss.parse checks TOKEN structure, not at-rule semantics, and
      // unterminated-comment damage is exactly a token-structure break.
      expect(() => postcss.parse(readFileSync(file, "utf8"))).not.toThrow();
    });
  }
});
