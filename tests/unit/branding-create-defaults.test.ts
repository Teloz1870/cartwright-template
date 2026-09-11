import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

/**
 * Source-level invariant: no `BrandingSettings` writer may invent identity.
 *
 * The bug this prevents, in full: `prisma.brandingSettings.upsert({ where: { id:
 * 1 }, … })` runs its `create:` branch only when the row does not exist — the
 * normal state of a fork that configures itself in `brand.config.ts` and never
 * opens the setup wizard. Nineteen call sites hardcoded `storeName:
 * "Cartwright"` there, so the FIRST arbitrary admin action (toggling a feature
 * flag) materialised the row with the ENGINE's name. A downstream fork's live
 * site renamed itself mid-session — header, footer, and `llms.txt`, the file AI
 * crawlers read. Silent: no error, no log line, and no test could see it,
 * because every existing test asserted behaviour rather than absence.
 *
 * A behavioural test cannot cover this class — you would need one per writer,
 * each mocking prisma into the no-row state. Reading the sources and asserting
 * on what must NOT appear covers all of them at once, including writers that do
 * not exist yet. It needs no mocks, no DB, and runs in milliseconds.
 */

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = [
  "app", "lib", "plugins", "components", "designs", "prisma", "scripts",
  // A writer dropped anywhere else must not be invisible to this invariant.
  "modules", "verticals", "industry-templates", "i18n", "tests/setup",
];
/** Root-level source files (proxy.ts, brand.config.ts, …) are scanned too. */
const SCAN_ROOT_FILES = true;
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", ".claude"]);

/**
 * Writers that legitimately set `storeName` without the shared helper. Every
 * entry states WHY — an allowlist without reasons rots into a mute list.
 */
const ALLOWLIST: Record<string, string> = {
  "brand.config.ts":
    "the source of truth itself — this is the ONE place the store name is " +
    "supposed to be a literal; every writer must read it from here",
  "lib/branding-defaults.ts":
    "the helper itself — it is where brand.storeName is read",
  "prisma/seed.ts":
    "first-run seed: reads brand.storeName/brand.images.hero directly and sets " +
    "columns the helper does not cover (ecommerceEnabled, setupComplete, and a " +
    "mode-dependent announcement)",
  "lib/ai-bootstrap.ts":
    "AI store bootstrap: storeName comes from the model's generateObject output " +
    "validated by a local Zod schema, and it deliberately writes ecommerceEnabled " +
    "from brand.config (the Phase G footgun note)",
  "lib/tools/settings.ts":
    "settings.update_branding: storeName is a required field of the Zod tool " +
    "input, so the create branch names it explicitly (falling back to config " +
    "when the identity policy owns it); the remaining literal is an `examples` " +
    "docstring shown in the tool manifest, not a write",
};

/**
 * A hardcoded store name in ANY quote style. The first version of this test only
 * matched double quotes, and a reviewer reintroduced the exact regression with
 * single quotes and with a template literal — both stayed green. The repo has no
 * prettier and no ESLint `quotes` rule to normalise them, so all three must be
 * covered here.
 */
const LITERAL_STORE_NAME = /storeName\s*:\s*["'`]/;

/**
 * A BrandingSettings write. Newline/whitespace tolerant because the repo's own
 * fail-soft style breaks these calls across lines, and `.create(` counts too —
 * the earlier exact-substring `brandingSettings.upsert(` matched neither.
 */
const BRANDING_WRITE = /brandingSettings\s*\.\s*(?:upsert|create)\s*\(/;

/** `...brandingCreateDefaults()` must be the FIRST entry of its create block. */
const HELPER_FIRST = /create\s*:\s*\{\s*\.\.\.brandingCreateDefaults\(\)/g;
const HELPER_ANY = /\.\.\.brandingCreateDefaults\(\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = SCAN_DIRS.flatMap((d) => {
  const full = join(ROOT, d);
  try {
    return statSync(full).isDirectory() ? walk(full) : [];
  } catch {
    return [];
  }
})
  .concat(
    SCAN_ROOT_FILES
      ? readdirSync(ROOT)
          .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
          .map((f) => join(ROOT, f))
      : [],
  )
  .map((f) => ({ path: relative(ROOT, f).split(sep).join("/"), text: readFileSync(f, "utf8") }));

describe("BrandingSettings writers never hardcode identity", () => {
  it("scans a non-trivial number of source files (guards against a broken walker)", () => {
    // Without this, a bad glob would make every assertion below vacuously pass.
    expect(sourceFiles.length).toBeGreaterThan(200);
  });

  it("no source file hardcodes a store name", () => {
    const offenders = sourceFiles
      .filter((f) => !(f.path in ALLOWLIST))
      .filter((f) => LITERAL_STORE_NAME.test(f.text))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("every brandingSettings.upsert() writer with a create: branch uses the shared helper", () => {
    const offenders = sourceFiles
      .filter((f) => !(f.path in ALLOWLIST))
      .filter((f) => BRANDING_WRITE.test(f.text) && /create\s*:/.test(f.text))
      .filter((f) => !f.text.includes("brandingCreateDefaults"))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("the helper spread is always FIRST in its create block (spread precedence)", () => {
    // `create: { ...payload, ...brandingCreateDefaults() }` would silently
    // overwrite a wizard's or composition's own values with brand.config
    // defaults. Five sites merge a payload over the helper, and nothing else in
    // the suite would notice the order flipping.
    const offenders = sourceFiles
      .filter((f) => !(f.path in ALLOWLIST))
      .filter((f) => {
        const any = (f.text.match(HELPER_ANY) ?? []).length;
        const first = (f.text.match(HELPER_FIRST) ?? []).length;
        return any > 0 && any !== first;
      })
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("every allowlist entry still exists and still writes storeName", () => {
    // A stale allowlist silently widens the hole it was meant to narrow.
    for (const [path, reason] of Object.entries(ALLOWLIST)) {
      const file = sourceFiles.find((f) => f.path === path);
      expect(file, `allowlisted file is gone: ${path}`).toBeDefined();
      expect(file!.text, `${path} no longer writes storeName — drop it from the allowlist (${reason})`).toMatch(
        /storeName/,
      );
    }
  });
});

describe("brandingCreateDefaults", () => {
  it("DERIVES the store name from brand.config — proven on a different value", async () => {
    // The source scan cannot look inside the helper (it is allowlisted), so a
    // literal could still hide there. Asserting `=== brand.storeName` would NOT
    // catch it: on this engine brand.storeName IS "Cartwright", so a hardcoded
    // "Cartwright" satisfies that comparison and the test only fails for the
    // fork that renames itself — i.e. exactly when it is too late. (Verified:
    // hardcoding the literal inside the helper left all assertions green.)
    //
    // So prove the derivation against a value the literal cannot match.
    vi.resetModules();
    vi.doMock("@/brand.config", () => ({
      brand: { storeName: "Nordlys Bageri ApS" },
    }));

    const { brandingCreateDefaults: derived } = await import("@/lib/branding-defaults");
    expect(derived().storeName).toBe("Nordlys Bageri ApS");

    vi.doUnmock("@/brand.config");
    vi.resetModules();
  });

  it("seeds only the columns a create-branch must supply", () => {
    // defaultLocale joined the set after v0.41.0: without it the Prisma column
    // default ("da") stamped the engine's locale onto every row a
    // code-configured fork created — the store-name bug, one axis over.
    expect(brandingCreateDefaults()).toEqual({
      id: 1,
      storeName: brand.storeName,
      defaultLocale: brand.defaultLocale,
      heroImage: "",
      announcement: "",
    });
  });

  it("returns a fresh object each call (no shared mutable default)", () => {
    const a = brandingCreateDefaults();
    const b = brandingCreateDefaults();
    expect(a).not.toBe(b);
    a.announcement = "mutated";
    expect(b.announcement).toBe("");
  });
});
