import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { brand } from "@/brand.config";
import { formatPrice } from "@/lib/format";
import { getIndustryTemplate } from "@/industry-templates";

/**
 * What the shop SAYS it charges for shipping must be what it CHARGES.
 *
 * `brand.policies.shippingDefaultDkk` drives the cart total, the checkout, and
 * the public `OfferShippingDetails` JSON-LD that Google and any shopping agent
 * read. The seeded shipping page states the same number in prose. Nothing
 * connected the two, so they drifted — and the live coffee demo drifted the
 * whole way: its page promised 39 kr while its JSON-LD served
 * `"value":"6.00","currency":"DKK"`, a leftover from a spell when that overlay
 * was configured as a US store ($6.00) and only half converted back.
 *
 * The first version of this test pinned the seeded literal against the config,
 * which made it FORK-HOSTILE: `tests/unit/` ships to every customer scaffold
 * (only `tests/e2e/` is mirror-excluded), so any shop that set its own
 * shipping rate — the ordinary use of that config key — inherited a failing
 * test it never wrote. The seed now INTERPOLATES the configured rate, so the
 * drift class is gone by construction and what is left to assert is that it
 * stays that way: no hand-typed amount creeps back in, and the amount is
 * written in the shop's own language.
 */
describe("the coffee template's shipping copy is generated from its configured rates", () => {
  const template = getIndustryTemplate("coffee");
  const page = template.pages.find((p) => p.slug === "shipping");
  const SOURCE = readFileSync(
    join(process.cwd(), "industry-templates/coffee/seed-data.ts"),
    "utf8",
  );
  /** DKK 49 · 49 kr · 49,00 kr. — any hand-typed money in the shipping prose. */
  const SHIPPING_AMOUNT = /(?:DKK|kr\.?)\s*\d[\d.,]*|\d[\d.,]*\s*kr\.?/gi;
  /** The whole shipping entry: English body AND every translation of it. */
  const shippingSection = () =>
    SOURCE.slice(SOURCE.indexOf('slug: "shipping"'), SOURCE.indexOf('slug: "returns"'));

  it("seeds a shipping page at all", () => {
    // Without this every assertion below would pass vacuously on a template
    // that simply stopped seeding the page.
    expect(page, "the coffee template must seed a shipping page").toBeDefined();
    expect(page!.body.length).toBeGreaterThan(200);
  });

  // `page.body` is the AUTHORED English prose. The seeders run it through
  // `orientSeedPage`, which may demote it into translations.en for a
  // Danish-default shop — but the template itself is what this file asserts,
  // so the source locale is the right yardstick here.
  const inSource = (minor: number) =>
    formatPrice(minor, { locale: template.sourceLocale ?? "en" });
  const inDanish = (minor: number) => formatPrice(minor, { locale: "da" });

  it("states the configured flat rate — whatever a fork sets it to", () => {
    expect(page!.body).toContain(inSource(brand.policies.shippingDefaultDkk));
  });

  it("states the configured free-shipping threshold", () => {
    expect(page!.body).toContain(inSource(brand.policies.shippingFreeThresholdDkk));
  });

  it("states them in the DANISH body too, in Danish format", () => {
    // The translation is a page a shopper reads, so it drifts the same way.
    const da = page!.translations?.da?.body ?? "";
    expect(da.length, "the coffee template must carry a Danish shipping page").toBeGreaterThan(200);
    expect(da).toContain(inDanish(brand.policies.shippingDefaultDkk));
    expect(da).toContain(inDanish(brand.policies.shippingFreeThresholdDkk));
  });

  it("the two formats actually differ (this file is vacuous if they do not)", () => {
    expect(inSource(brand.policies.shippingDefaultDkk)).not.toBe(
      inDanish(brand.policies.shippingDefaultDkk),
    );
  });

  it("formats each body in the language THAT BODY is written in", () => {
    // Subtler than "use the shop's locale", and the difference is a real bug.
    // `orientSeedPage` moves this English body into `translations.en` when the
    // shop's default locale is Danish — so formatting the SOURCE prose with
    // `brand.defaultLocale` would put "49,00 kr." inside the English page that
    // /en then renders. The amount names the locale of the prose around it.
    expect(SOURCE).toMatch(/const SOURCE_LOCALE = "en"/);
    expect(SOURCE).toMatch(/sourceLocale: SOURCE_LOCALE/);
    // English body → SOURCE_LOCALE; Danish translation → "da".
    expect(SOURCE).toMatch(/costs \$\{shippingAmount\([^)]*, SOURCE_LOCALE\)\}/);
    expect(SOURCE).toMatch(/koster \$\{shippingAmount\([^)]*, "da"\)\}/);
    // And no body may fall back to the shop's default, which is the bug.
    expect(SOURCE).not.toMatch(/locale: string = brand\.defaultLocale/);
  });

  it("writes the amount in the shop's own language, not DKK's default locale", () => {
    // `formatPrice` defaults DKK to da-DK. An English shop generating with that
    // default writes "39,00 kr." into English prose — the Danish decimal
    // convention in an English sentence, which is the exact defect this branch
    // exists to end. So the seed must pass a locale.
    // The helper REQUIRES a locale — there is no silent default to fall into.
    expect(SOURCE).toMatch(/formatPrice\(minor, \{ locale \}\)/);
    expect(SOURCE).toMatch(/shippingAmount = \(minor: number, locale: string\)/);
  });

  it("hand-writes no shipping amount that could drift — in ANY language", () => {
    // The failure mode this replaces: someone edits the prose, types the
    // number, and the interpolation quietly stops being the source.
    //
    // The first version of this test sliced only up to "## Roasting schedule",
    // which stopped at the END OF THE ENGLISH BODY — and the Danish
    // translation right below it still hard-typed "49 kr" and "499 kr". So the
    // guard proved the exact half of the page that was already fixed, and a
    // fork changing its rate would have had /en tell the truth while /da kept
    // quoting the old number. A translated page is a page.
    const literals = shippingSection().match(SHIPPING_AMOUNT) ?? [];
    expect(literals, `hand-typed shipping amounts: ${literals.join(", ")}`).toEqual([]);
  });

  it("covers the DANISH body too (the half the first guard missed)", () => {
    // Named separately so the regression cannot come back as "the slice got
    // shorter again" without a test saying so.
    const section = shippingSection();
    expect(section).toContain("Standard-fragt i Danmark");
    expect(section).toContain("Fri fragt på alle ordrer");
  });

  it("actually reads a shipping section (guards the slice above)", () => {
    // An anchor that stops matching would make the assertions above pass on an
    // empty string — and the regex is proved to have teeth on a known-bad
    // sample, so a broken pattern cannot read as "no literals found".
    expect(shippingSection().length).toBeGreaterThan(400);
    expect("Standard-fragt i Danmark koster 49 kr".match(SHIPPING_AMOUNT)).not.toBeNull();
    expect("costs DKK 49 and is".match(SHIPPING_AMOUNT)).not.toBeNull();
  });
});
