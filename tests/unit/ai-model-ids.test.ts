import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GEMINI_TEXT_MODEL } from "@/lib/ai/gemini";

/**
 * TREND40 — no shipped code may name a model its provider has shut down.
 *
 * `app/api/admin/vibe/translate/route.ts` called `google("gemini-1.5-flash")`
 * a year after Google shut the Gemini 1.5 family down (2025-09-29), so the
 * admin's "translate vibe HTML" failed for every shop — and nothing in the
 * suite noticed, because a model id is just a string until Google answers 404.
 *
 * Every entry names its source. Add a family here the day its shutdown date
 * passes (ai.google.dev/gemini-api/docs/deprecations lists the dates).
 *
 * The walk reads the disk, not git: `tests/unit` ships in scaffolds that may
 * have no repository at all.
 */

const ROOT = resolve(__dirname, "../..");

const SHUT_DOWN: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\bgemini-1\.0-[a-z0-9.-]+/i,
    why: "Gemini 1.0 — shut down (ai.google.dev/gemini-api/docs/changelog)",
  },
  {
    pattern: /\bgemini-pro(?:-vision)?\b/i,
    why: "the Gemini 1.0 aliases `gemini-pro` / `gemini-pro-vision` — shut down with 1.0",
  },
  {
    pattern: /\bgemini-1\.5-[a-z0-9.-]+/i,
    why: "Gemini 1.5 — shut down 2025-09-29 (ai.google.dev/gemini-api/docs/changelog)",
  },
  {
    pattern: /\bgemini-2\.0-flash[a-z0-9.-]*/i,
    why: "Gemini 2.0 Flash family — shutdown date 2026-06-01 (docs/deprecations)",
  },
  {
    pattern: /\bgemini-live-2\.5-flash-preview\b/i,
    why: "Gemini Live 2.5 Flash preview — shutdown date 2025-12-09 (docs/deprecations)",
  },
];

/** What ships and runs: the app, its libraries, plugins, packs and messages. */
const SOURCE_DIRS = [
  "app",
  "lib",
  "components",
  "plugins",
  "designs",
  "modules",
  "verticals",
  "industry-templates",
  "i18n",
  "messages",
];
const ROOT_FILES = ["brand.config.ts", "proxy.ts", "next.config.ts", "instrumentation.ts"];
const SKIP_DIRS = new Set(["node_modules", "generated", ".next"]);
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs|json)$/;

function walk(dir: string, out: string[]): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name)) out.push(full);
  }
  return out;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const d of SOURCE_DIRS) walk(join(ROOT, d), files);
  for (const f of ROOT_FILES) if (existsSync(join(ROOT, f))) files.push(join(ROOT, f));
  return files;
}

describe("model ids a provider has shut down", () => {
  it("appear nowhere in the shipped source", () => {
    const files = sourceFiles();
    // A walk that silently found nothing would pass vacuously.
    expect(files.length).toBeGreaterThan(500);

    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const { pattern, why } of SHUT_DOWN) {
        const m = text.match(pattern);
        if (m) hits.push(`${relative(ROOT, file)}: "${m[0]}" — ${why}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("catch the id that broke the translator, and none the engine uses today", () => {
    const blocked = (id: string) => SHUT_DOWN.some(({ pattern }) => pattern.test(id));
    for (const dead of ["gemini-1.5-flash", "gemini-1.5-pro-002", "gemini-1.0-pro", "gemini-pro", "gemini-2.0-flash-001"]) {
      expect(blocked(dead), dead).toBe(true);
    }
    for (const live of [GEMINI_TEXT_MODEL, "gemini-2.5-flash-image", "gemini-2.5-pro", "gemini-3.1-flash-live-preview"]) {
      expect(blocked(live), live).toBe(false);
    }
  });

  it("the shared Gemini text model is a 2.5-family id", () => {
    expect(GEMINI_TEXT_MODEL).toBe("gemini-2.5-flash");
  });
});
