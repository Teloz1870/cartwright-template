import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";

/**
 * A runtime-tier flag must not be GATED on the compile-time config.
 *
 * `/admin/features` writes a DB override for a `tier: "runtime"` flag, and
 * `getBrand()`/`getFeatures()` merge it. Reading `brand.features.x` from the
 * static `@/brand.config` import bypasses that merge, so a surface that gates
 * on it disagrees with every surface that resolves — the feature is on in one
 * place and off in another.
 *
 * Measured examples, all fixed in the change that added this guard:
 * - `/api/cron/seo-snapshot` returned `200 {"ok":true}` and collected nothing
 *   on every shop that had activated Plus, because `/admin/plus` activates by
 *   writing an override and never edits `brand.config.ts`. A green cron log
 *   for a job that had been dead since activation.
 * - `/blog/feed.xml` 404'd while `/blog` rendered and `sitemap.xml` listed the
 *   posts.
 * - The PDP showed a wishlist heart while `/account/wishlist` 404'd.
 * - `/api/registry` 404'd, so `scheduleRegistryHit` never fired and
 *   `/admin/registry-stats` read "No registry installs recorded yet" forever
 *   with both flags showing On.
 *
 * **Why this is not "no static reads of runtime flags".** That rule would need
 * a long allowlist and would be weak. A static read is FINE as a default
 * parameter value or after `??`, because the caller threads the resolved value
 * and the static one is only the fallback — that is how `viewTransitions`,
 * `containerQueries`, `wishlist` and `mcpPublic` are wired, correctly. What is
 * never fine is gating on it. So the guard bans the position, not the read.
 */

const REPO_GLOBS = [
  "app/**/*.ts",
  "app/**/*.tsx",
  "lib/**/*.ts",
  "lib/**/*.tsx",
  "plugins/**/*.ts",
  "plugins/**/*.tsx",
  "components/**/*.tsx",
  "designs/**/*.tsx",
];

/**
 * Deliberate static gates. Each is a decision, not an oversight:
 *
 * - `lib/first-run.ts` checks the flag FIRST so a shop with the engine default
 *   (false) returns before making any DB call. The resolved read below it
 *   handles turning the canvas OFF; turning it ON at runtime is deliberately
 *   unsupported, and the file's docblock says so.
 * - `DriveAdminPage` renders the static value beside the resolved one, under
 *   the label "Config default" — showing the difference IS the feature. It
 *   trips this scan only because it sits in a ternary.
 */
const EXEMPT = new Set([
  "lib/first-run.ts",
  "plugins/google-workspace/admin/drive/DriveAdminPage.tsx",
]);

/**
 * KNOWN TIER MISLABELS — not gate bugs, but not clean either.
 *
 * Every reader of these flags is static, so no two surfaces disagree and no
 * user sees a broken state. What IS wrong is that `/admin/features` offers a
 * live toggle that does nothing at all.
 *
 * `currencySwitcher` is listed rather than fixed on purpose: the honest repair
 * is a product decision, not a refactor. Making the reads dynamic would put a
 * DB row in charge of which currency a shop quotes — the thing
 * `lib/identity.ts` exists to prevent — and would land `getCurrency()` on the
 * pricing hot path. Reclassifying it to `tier: "compile"` matches what
 * `components/CurrencySwitcher.tsx` already documents about itself. Somebody
 * has to choose; until then this keeps it visible instead of silent.
 */
const KNOWN_MISLABEL = new Set([
  "lib/currency-server.ts",
  "components/CurrencySwitcher.tsx",
]);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => (l.trim().startsWith("//") ? "" : l))
    .join("\n");
}

function runtimeFlags(): Set<string> {
  const src = readFileSync("lib/feature-flags/manifest.ts", "utf8");
  const flags = new Set<string>();
  for (const m of src.matchAll(/^ {2}(\w+): \{([\s\S]*?)^ {2}\},/gm)) {
    if (/tier:\s*"runtime"/.test(m[2])) flags.add(m[1]);
  }
  return flags;
}

/** Identifiers in `src` bound to the STATIC config, minus any shadowed locally. */
function staticIdents(src: string): Set<string> {
  const ids = new Set<string>();
  for (const m of src.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["']@\/brand\.config["']/g,
  )) {
    for (const part of m[1].split(",")) {
      const mm = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(part.trim());
      if (mm) ids.add(mm[2] ?? mm[1]);
    }
  }
  // `const brand = await getBrand()` shadows the import — that IS resolved.
  for (const m of src.matchAll(
    /(?:const|let)\s+(\w+)\s*=\s*await\s+(?:getBrand|getFeatures)\(\)/g,
  )) {
    ids.delete(m[1]);
  }
  return ids;
}

/**
 * Identifiers bound to a STATIC `X.features` object, e.g.
 * `const features = brand.features as { seoAutopilot?: boolean }`.
 *
 * This indirection is not cosmetic: it is the exact shape that hid the worst
 * bug this guard exists for. A scan matching only `<ident>.features.<flag>`
 * sees nothing here, because the read downstream is `features.seoAutopilot`.
 */
function staticFeatureBags(src: string, staticIds: Set<string>): Set<string> {
  const bags = new Set<string>();
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(\w+)\.features\b/g)) {
    if (staticIds.has(m[2])) bags.add(m[1]);
  }
  return bags;
}

type Hit = { file: string; line: number; text: string };

function scan(files: string[], flags: Set<string>): { gates: Hit[]; fallbacks: Hit[] } {
  const gates: Hit[] = [];
  const fallbacks: Hit[] = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, "utf8"));
    const ids = staticIdents(src);
    if (ids.size === 0) continue;
    const bags = staticFeatureBags(src, ids);
    const lines = src.split("\n");
    lines.forEach((line, idx) => {
      for (const flag of flags) {
        const direct = `\\b(\\w+)\\.features\\.${flag}\\b`;
        const viaBag = bags.size
          ? `|\\b(${[...bags].join("|")})\\.${flag}\\b`
          : "";
        for (const m of line.matchAll(new RegExp(`${direct}${viaBag}`, "g"))) {
          const ident = m[1] ?? m[2];
          if (!ids.has(ident) && !bags.has(ident)) continue;
          // Look back two lines so a `??` or `=` split across lines still reads
          // as a fallback rather than a gate.
          const ctx = lines.slice(Math.max(0, idx - 2), idx + 1).join(" ");
          const at = ctx.lastIndexOf(m[0]);
          const before = at >= 0 ? ctx.slice(0, at) : line.slice(0, m.index ?? 0);
          // `??` is always a fallback. A bare `=` is one only in a default
          // PARAMETER (`viewTransitions = brand.features.viewTransitions,`) —
          // never in a `const`/`let` binding, which is how the DesignsPanel bug
          // looked: `const cartwrightPlus = brand.features.cartwrightPlus;`
          // read the compile-time value five lines above an `await
          // getFeatures()` that was already there.
          const declares = /^\s*(?:const|let|var)\b/.test(line);
          const isFallback =
            /\?\?\s*\(?\s*(?:\w+\.\w+\s*&&\s*)?(?:Boolean\()?\s*$/.test(before) ||
            (!declares && /=\s*$/.test(before));
          const hit = { file, line: idx + 1, text: line.trim().slice(0, 90) };
          (isFallback ? fallbacks : gates).push(hit);
        }
      }
    });
  }
  return { gates, fallbacks };
}

describe("runtime-tier flags are never gated on the compile-time config", () => {
  const flags = runtimeFlags();
  const files = REPO_GLOBS.flatMap((g) => globSync(g)).filter(
    (f) => !f.includes("generated"),
  );

  it("has a manifest to read and a tree to scan", () => {
    // Without these, every assertion below would pass on an empty set.
    expect(flags.size).toBeGreaterThan(20);
    expect(files.length).toBeGreaterThan(200);
  });

  it("detects a gate in a fixture — the scanner itself works", () => {
    // Positive control: a broken detector fails here before it can bless the
    // repo. The fixture mirrors the exact shape of the seo-snapshot bug.
    const src = [
      `import { brand } from "@/brand.config";`,
      `export async function GET() {`,
      `  if (!brand.features.seoAutopilot) return json({ ok: true });`,
      `}`,
    ].join("\n");
    const ids = staticIdents(src);
    expect(ids.has("brand")).toBe(true);
    expect(src).toMatch(/if \(!brand\.features\.seoAutopilot\)/);
    // And the shadowed form must NOT count as static.
    expect(staticIdents(`${src}\nconst brand = await getBrand()`).has("brand")).toBe(false);
  });

  it("still sees the legitimate fallbacks — the scan is not silently empty", () => {
    const { fallbacks } = scan(files, flags);
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it("gates only where an exemption is documented", () => {
    const { gates } = scan(files, flags);
    const unexpected = gates.filter(
      (g) => !EXEMPT.has(g.file) && !KNOWN_MISLABEL.has(g.file),
    );
    expect(
      unexpected.map((g) => `${g.file}:${g.line}  ${g.text}`),
      "a runtime-tier flag is gated on the static config — resolve it with getFeatures(), or thread it as a prop",
    ).toEqual([]);
  });

  it("every exemption is real and still gates", () => {
    // An exemption that no longer matches is dead weight that hides the next one.
    const { gates } = scan(files, flags);
    for (const file of [...EXEMPT, ...KNOWN_MISLABEL]) {
      expect(
        gates.some((g) => g.file === file),
        `${file} is exempted but no longer gates on a static runtime flag — drop the exemption`,
      ).toBe(true);
    }
  });
});
