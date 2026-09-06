import { describe, expect, it } from "vitest";
import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { INQUIRY_ERROR_CODES, inquiryErrorCode } from "@/lib/inquiry-errors";

/**
 * The public inquiry endpoint must not answer with human prose.
 *
 * `/api/inquiries` carries no locale segment, so it cannot know the visitor's
 * language — but the form that renders its reply does. A hardcoded message in
 * the route silently beats the form's own translation, because the old
 * `result.error || t("errorGeneric")` can never fall through a truthy string.
 * That shipped a Danish "Ugyldig email-adresse" to visitors of English shops,
 * on the ordinary mistyped-email path rather than some rare failure branch.
 *
 * These assertions close the loop the bug slipped through: every code the
 * routes can emit is mapped to a key, and every mapped key exists in every
 * locale file. Adding a code without a translation fails here.
 */

const read = (p: string) => readFileSync(p, "utf8");

const ROUTES = [
  "app/api/inquiries/route.ts",
  "app/api/inquiries/route.static.ts",
].filter(existsSync);

describe("inquiry endpoint speaks codes, the form speaks the visitor's language", () => {
  it("has routes to check", () => {
    // Guards the suite against passing vacuously if the routes are ever moved.
    expect(ROUTES.length).toBeGreaterThan(0);
  });

  it.each(ROUTES)("%s returns no human prose in its error paths", (file) => {
    const src = read(file);
    // The literal strings the bug shipped, plus any Danish-only letter, which
    // no machine code or English fallback would ever contain.
    expect(src).not.toMatch(/Der opstod|Dit navn|Ugyldig email/);
    expect(src.match(/error:\s*"[^"]*[æøåÆØÅ][^"]*"/)).toBeNull();
  });

  it.each(ROUTES)("%s annotates its validated fields with codes", (file) => {
    const src = read(file);
    expect(src).toMatch(/min\(2,\s*"invalid_name"\)/);
    expect(src).toMatch(/email\("invalid_email"\)/);
  });

  it("narrows unknown Zod wording instead of leaking it", () => {
    // Zod emits its own text for failures the schema does not annotate.
    expect(inquiryErrorCode("Required")).toBe("invalid_input");
    expect(inquiryErrorCode(undefined)).toBe("invalid_input");
    expect(inquiryErrorCode("invalid_email")).toBe("invalid_email");
  });

  /**
   * EVERY component that posts to the endpoint, not just the first one found.
   *
   * This is the hole that let the bug back in: the original version of this
   * test checked `LeadForm` alone and I wrote in the PR that SmartContactForm
   * "only reads data.ok". It reads `data.ok` at one line and renders
   * `data.error` fourteen lines later, outside the window I had grepped. So
   * the fix localized one form and left the other showing the server's
   * language — which, once the server answered in English, meant a DANISH
   * shop's visitors got English. Deriving the consumer list from the code
   * rather than from a reading is what makes that irreproducible.
   */
  const CONSUMERS = globSync("{components,app,plugins}/**/*.tsx").filter(
    (f) => read(f).includes("/api/inquiries"),
  );

  it("finds every consumer of the endpoint", () => {
    expect(CONSUMERS.length).toBeGreaterThanOrEqual(2);
  });

  it.each(CONSUMERS.map((f) => [f] as const))(
    "%s maps every emittable code to one of its own translated strings",
    (file) => {
      const src = read(file);
      // Each consumer keeps its own table — LeadForm through next-intl keys,
      // SmartContactForm through its inline `tr` dictionary — so the assertion
      // is about coverage, not about a shared mechanism.
      const tableStart = src.search(/const \w*ERROR_KEY\b/);
      expect(tableStart, `${file} has no code→text table`).toBeGreaterThan(-1);
      const table = src.slice(tableStart, src.indexOf("};", tableStart));

      for (const code of INQUIRY_ERROR_CODES) {
        expect(table, `${file} does not map code "${code}"`).toContain(`${code}:`);
      }
    },
  );

  it("no consumer renders the server's prose directly", () => {
    for (const file of CONSUMERS) {
      const src = read(file);
      // `x.error || fallback` and `x.error ?? fallback` are the shape that
      // cannot fall through: a truthy server string always wins.
      const leaks = [...src.matchAll(/(\w+)\.error\s*(\|\||\?\?)/g)].map((m) => m[0]);
      expect(leaks, `${file} renders the server's message verbatim`).toEqual([]);
    }
  });

  it("resolves every mapped key in every locale file", () => {
    const form = read("components/LeadForm.tsx");
    const start = form.indexOf("const INQUIRY_ERROR_KEY");
    const table = form.slice(start, form.indexOf("};", start));
    const keys = [...table.matchAll(/:\s*"(\w+)"/g)].map((m) => m[1]);
    expect(keys.length).toBe(INQUIRY_ERROR_CODES.length);

    const locales = readdirSync("messages").filter((f) => f.endsWith(".json"));
    expect(locales.length).toBeGreaterThan(0);
    for (const file of locales) {
      const bag = JSON.parse(read(`messages/${file}`)).LeadForm ?? {};
      for (const key of keys) {
        expect(
          typeof bag[key] === "string" && bag[key].length > 0,
          `messages/${file} is missing LeadForm.${key}`,
        ).toBe(true);
      }
    }
  });
});

describe("public storefront endpoints answer in a language the caller chose", () => {
  const PUBLIC_SURFACE = [
    "lib/newsletter.ts",
    "app/api/newsletter/subscribe/route.ts",
    "app/api/newsletter/unsubscribe/route.ts",
    "app/api/inquiries/route.ts",
    "app/api/inquiries/route.static.ts",
    // Added 2026-08-29. Both are flag-gated (voiceShop, reviews) and both had
    // the same shape: `body.error ?? t(…)` in the consumer, which a truthy
    // server string can never fall through. Solbrillen runs with every flag
    // on, so "default-off" is not the same as "nobody sees it".
    "app/api/live/token/route.ts",
    "plugins/reviews/api/submit.ts",
    "lib/voice/client.ts",
  ].filter(existsSync);

  it("covers a surface that exists", () => {
    expect(PUBLIC_SURFACE.length).toBeGreaterThan(0);
  });

  it.each(PUBLIC_SURFACE)("%s returns no Danish prose", (file) => {
    const returned = [...read(file).matchAll(/error:\s*"([^"]+)"/g)].map((m) => m[1]);
    const danish = returned.filter((s) =>
      /[æøåÆØÅ]/.test(s) ||
      /\b(Ugyldig|Kunne ikke|Mangler|Prøv igen|Der opstod|Fejl ved)\b/.test(s),
    );
    expect(danish, `Danish prose returned to callers: ${danish.join(" | ")}`).toEqual([]);
  });
});

/**
 * `contactAttachments` is declared `tier: "runtime"`, so /admin/features writes
 * a DB override for it and `getBrand()` merges that override. The contact page
 * read the resolved value — so the file input appeared the moment an admin
 * toggled it on — while the upload endpoint read the STATIC config and answered
 * 404, and `/api/inquiries` silently dropped `attachmentUrls`. Turning the
 * feature on produced a form that could not use the feature.
 *
 * This guard is narrow on purpose: 20 other runtime flags are also read both
 * ways, but a coarse scan cannot tell a real inconsistency from a client
 * component receiving a prop. Only the one traced end to end is asserted here.
 */
describe("flag-gated storefront consumers translate too", () => {
  const CONSUMERS = [
    "components/voice/VoiceShopOverlay.tsx",
    "plugins/reviews/components/WriteReviewForm.tsx",
  ].filter(existsSync);

  it("covers a surface that exists", () => {
    expect(CONSUMERS.length).toBe(2);
  });

  /** Strip comments — a docblock quoting the bad pattern is not the pattern. */
  const codeOnly = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  it.each(CONSUMERS)("%s maps a code instead of rendering the server's prose", (file) => {
    const src = codeOnly(read(file));
    expect(src).toMatch(/const \w*ERROR_KEY\b/);
    // The two shapes that cannot fall through to a translated fallback.
    const leaks = [...src.matchAll(/(?:body|data|res)\.error\s*(?:\|\||\?\?)/g)].map((m) => m[0]);
    expect(leaks, `${file} renders the server's message verbatim`).toEqual([]);
  });
});

describe("contact attachments honour their own runtime flag", () => {
  it("is still declared runtime-toggleable", () => {
    // If the flag is ever reclassified to compile-tier, the static reads
    // become correct and this guard should be deleted rather than satisfied.
    const manifest = read("lib/feature-flags/manifest.ts");
    const block = manifest.slice(
      manifest.indexOf("  contactAttachments: {"),
      manifest.indexOf("  },", manifest.indexOf("  contactAttachments: {")),
    );
    expect(block).toContain('tier: "runtime"');
  });

  it.each([
    "app/api/contact/upload/route.ts",
    "app/api/inquiries/route.ts",
  ])("%s reads the resolved value, not the static config", (file) => {
    const src = read(file);
    expect(src).toMatch(/getFeatures\(\)/);
    // The static shape that caused the 404.
    expect(src).not.toMatch(/\(brand\.features as \{ contactAttachments\?: boolean \}\)/);
  });

  it("does not tell a visitor which env var is missing", () => {
    // The 500 response named BLOB_READ_WRITE_TOKEN to whoever posted the form.
    const src = read("app/api/contact/upload/route.ts");
    const returned = [...src.matchAll(/error:\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]);
    expect(returned.filter((s) => /BLOB_READ_WRITE_TOKEN/.test(s))).toEqual([]);
    // …but the operator still gets it, in the log.
    expect(src).toMatch(/console\.error\("\[contact-upload\]/);
  });
});
