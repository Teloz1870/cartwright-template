import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No module may read identity straight off the `BrandingSettings` row.
 *
 * This is the assertion that actually generalises, and the one the original
 * Phase H lock lacked. That lock was correct and well-tested — and the fork's
 * site renamed itself anyway, because `Header`, `Footer` and `app/llms.txt`
 * queried the row directly instead of going through the guarded merge. Every
 * unit test of the lock passed the whole time.
 *
 * Counting bypasses by review does not scale, because the readers that matter
 * are the ones nobody has written yet. So the rule is structural: if a file
 * queries `brandingSettings` AND mentions a sovereign identity field, it must
 * either go through the seam (`fetchBrandingSettings`, which normalises) or the
 * merged brand (`getBrand`) — or be listed below with a reason.
 *
 * Cosmetics are untouched by this: a file may read `tagline`, `announcement`,
 * `logoImageUrl`, `themeJson` off the raw row all it likes. Only `storeName` and
 * `ecommerceEnabled` are sovereign (see lib/identity.ts for why the set is
 * narrow).
 */

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "lib", "components", "designs", "plugins", "modules"];
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", ".claude"]);

/** A raw query for the identity row. */
const RAW_QUERY = /brandingSettings\s*\.\s*(?:findUnique|findFirst|findMany)\s*\(/;
/**
 * A sovereign field read off something OTHER than the config/merged brand.
 * `brand.storeName` and `brandDefaults.ecommerceEnabled` are the correct
 * lookups; stripping them first is what makes this an offence detector rather
 * than a keyword search.
 */
const SOVEREIGN_READ = /\.\s*(?:storeName|ecommerceEnabled)\b/;
const CORRECT_LOOKUP = /\b(?:brand|brandDefaults|brandConfig|merged)\s*\.\s*(?:storeName|ecommerceEnabled)\b/g;

/**
 * A file that imports the sovereign resolver is policy-aware by definition: it
 * may well touch the raw value, but only to hand it to `sovereignStoreName`.
 * Without this, the detector would flag exactly the files that were fixed.
 */
const POLICY_AWARE = /from\s+["']@\/lib\/identity["']/;

function readsIdentityOffARow(text: string): boolean {
  if (POLICY_AWARE.test(text)) return false;
  return SOVEREIGN_READ.test(text.replace(CORRECT_LOOKUP, ""));
}

/**
 * Files that query the row AND read a sovereign field off it, with a stated
 * reason. Anything else must go through the seam, the merged brand, or the
 * sovereign resolver (importing `@/lib/identity` clears a file automatically —
 * such a file touches the raw value only to hand it to the policy).
 */
const ALLOWLIST: Record<string, string> = {
  "app/admin/indstillinger/page.tsx":
    "the admin settings form must display what is PERSISTED, not the resolved " +
    "value — otherwise the field lies about what saving will do",
  "app/admin/setup/page.tsx":
    "same: the wizard prefills from the stored row",
};

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
}).map((f) => ({
  path: relative(ROOT, f).split(sep).join("/"),
  text: readFileSync(f, "utf8"),
}));

describe("identity is never read off the raw BrandingSettings row", () => {
  it("scans a non-trivial number of files (a broken walker would pass vacuously)", () => {
    expect(sourceFiles.length).toBeGreaterThan(200);
  });

  it("no unlisted file queries the row and reads a sovereign field", () => {
    const offenders = sourceFiles
      .filter((f) => !(f.path in ALLOWLIST))
      .filter((f) => RAW_QUERY.test(f.text) && readsIdentityOffARow(f.text))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("every allowlist entry still exists and still does what its reason says", () => {
    // A stale allowlist silently widens the hole it was meant to narrow.
    for (const [path, reason] of Object.entries(ALLOWLIST)) {
      const file = sourceFiles.find((f) => f.path === path);
      expect(file, `allowlisted file is gone: ${path}`).toBeDefined();
      expect(
        RAW_QUERY.test(file!.text) &&
          SOVEREIGN_READ.test(file!.text.replace(CORRECT_LOOKUP, "")),
        `${path} no longer bypasses the seam — drop it from the allowlist (${reason})`,
      ).toBe(true);
    }
  });

  it("llms.txt takes its identity from the merged brand", () => {
    // Named explicitly because it is the surface that leaked: it is what AI
    // crawlers read, so a wrong store name there propagates into the channel
    // Cartwright sells itself on.
    const file = sourceFiles.find((f) => f.path === "app/llms.txt/route.ts");
    expect(file).toBeDefined();
    expect(file!.text).not.toMatch(/settings\?\.\s*storeName/);
    expect(file!.text).not.toMatch(/settings\?\.\s*ecommerceEnabled/);
    expect(file!.text).toMatch(/getBrand\(\)/);
  });

  it("the dynamic and static llms.txt variants agree on identity", () => {
    // They are seam variants of one route: the no-DB build must not describe the
    // site differently from the DB build.
    const dynamic = sourceFiles.find((f) => f.path === "app/llms.txt/route.ts");
    const staticVariant = sourceFiles.find((f) => f.path === "app/llms.txt/route.static.ts");
    expect(staticVariant, "the static seam variant is missing").toBeDefined();

    for (const file of [dynamic!, staticVariant!]) {
      expect(file.text, `${file.path} should use brand.storeName`).toMatch(
        /shopName\s*=\s*brand\.storeName/,
      );
    }
  });
});
