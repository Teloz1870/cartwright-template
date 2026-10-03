import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { globSync } from "node:fs";

/**
 * The admin has no i18n layer at all — zero `useTranslations`/`getTranslations`
 * calls under `app/admin` — because it is English by product decision, for
 * every shop including the Danish canaries whose storefronts stay Danish. So
 * plain English literals are correct here, and a Danish one is simply a leak.
 *
 * These modules each surfaced Danish to an English shop owner: the forced
 * first-login password change, the setup runbook a fresh scaffold opens on,
 * the upload errors a new owner hits before their Blob token is set, and two
 * values that get written into the customer's database and rendered from the
 * row forever.
 *
 * Deliberately a named list, not a glob over `app/admin`: a guard that fails
 * on legitimate copy gets switched off, and this one has no judgement calls
 * in it.
 */

const read = (p: string) => readFileSync(p, "utf8");

/**
 * `lib/gdpr/pii-map.ts` is deliberately NOT here. Its Danish `note:` fields
 * read like copy but nothing imports them — `erase.ts` takes only `REDACTED`
 * — so they are documentation that happens to live in a data literal. Only
 * the value that IS rendered is asserted, further down.
 */
const ADMIN_SURFACE = [
  "lib/setup-status.ts",
  "lib/auth/password.ts",
  "app/api/admin/upload/route.ts",
  // Added 2026-08-29.
  // `lib/db.ts` is not admin UI — it is the boot error a developer meets when
  // their database is misconfigured, which for a product shipped worldwide is
  // the single worst place to answer in Danish. Same reasoning, same list.
  "lib/db.ts",
  "lib/redirects/store.ts",
  "plugins/logo-generator/lib/logo-gen.ts",
  "plugins/logo-generator/admin/actions.ts",
].filter(existsSync);

/**
 * Case-INSENSITIVE, and every entry is a word with no English reading — which
 * is what makes ignoring case safe here. Two mutations proved the earlier,
 * case-sensitive list inadequate: "Mangler fil." slipped past a lowercase
 * `mangler`, and "Deployet til produktion" contained no listed word at all.
 * Short ambiguous particles (af, ved, der, som) stay OUT — a guard that
 * rejects "AF Logistics" gets switched off, which is worse than no guard.
 */
const DANISH_WORDS =
  /\b(ikke|mangler|manglende|skal|tjek|venter|deployet|produktion|adgangskode|gemme|gemt|slettet|ukendt|paakraevet|billeder|videoer|filtypen|indhold|ugyldig\w*|fejl\w*|domaene|samtykke|banneret|kategorier|nyttig)\b/i;

/** Strip comments — this guard is about what a user reads, not the source. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("admin-facing modules are English", () => {
  it("covers a surface that exists", () => {
    expect(ADMIN_SURFACE.length).toBe(7);
  });

  it("the admin really has no translation layer to defer to", () => {
    // If this ever becomes false, the fix for a Danish admin string changes
    // from "write English" to "add a key", and this whole guard needs revising.
    const calls = globSync("app/admin/**/*.{ts,tsx}")
      .map(read)
      .filter((s) => /\b(useTranslations|getTranslations)\b/.test(s));
    expect(calls).toEqual([]);
  });

  it.each(ADMIN_SURFACE)("%s carries no Danish in its strings", (file) => {
    const literals = [...codeOnly(read(file)).matchAll(/"([^"\n]{4,})"|`([^`\n$]{4,})`/g)]
      .map((m) => m[1] ?? m[2])
      .filter((v) => /[æøåÆØÅ]/.test(v) || DANISH_WORDS.test(v));
    expect(literals, `Danish in ${file}: ${literals.join(" | ")}`).toEqual([]);
  });
});

describe("values written into the customer's database", () => {
  it("the erasure marker is not a Danish word", () => {
    // Stamped into Order/ProductReview/Lead rows by lib/gdpr/erase.ts and
    // rendered from the row forever — no later locale switch can fix it.
    expect(read("lib/gdpr/pii-map.ts")).toContain('export const REDACTED = "[redacted]"');
  });

  it("a lead's budget defaults to nothing, not to a word", () => {
    // SmartContactForm never sends `budget`, so the default IS the value for
    // every lead from that form. The admin renders it behind `lead.budget &&`,
    // so "" omits the badge instead of asserting a Danish "Ukendt".
    expect(read("app/api/inquiries/route.ts")).toMatch(/budget: z\.string\(\)\.default\(""\)/);
  });
});

describe("the setup runbook links somewhere that exists", () => {
  it("every /info/<slug> helpUrl matches a slug the templates seed", () => {
    const helpUrls = [...read("lib/setup-status.ts").matchAll(/helpUrl: "\/info\/([\w-]+)"/g)].map(
      (m) => m[1],
    );
    expect(helpUrls.length).toBeGreaterThan(0);

    const seeds = globSync("industry-templates/*/seed-data.ts");
    expect(seeds.length).toBeGreaterThan(0);
    const seeded = new Set(
      seeds.flatMap((f) => [...read(f).matchAll(/slug: "([\w-]+)"/g)].map((m) => m[1])),
    );

    for (const slug of helpUrls) {
      expect(
        seeded.has(slug),
        `helpUrl /info/${slug} is a 404 — no template seeds that slug`,
      ).toBe(true);
    }
  });
});
