import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

import { brand } from "@/brand.config";

/**
 * Danish strings that a customer of an ENGLISH shop actually saw.
 *
 * Each of these has a render path that was traced end to end, and each was
 * a different mechanism — which is why one guard could not have caught them
 * all: a component missing the locale binding its own file uses everywhere
 * else, two full HTML documents served outside `app/[locale]` with `lang="da"`
 * baked in, a server module whose prose shadowed the translation its caller
 * already had, and a literal written permanently into the customer's database.
 */

const read = (p: string) => readFileSync(p, "utf8");

describe("the AI assistant follows the page locale", () => {
  // aiStylist is default-ON (brand.config.ts), gated only by `aiConfigured`,
  // so this is the one storefront surface with no feature flag in front of it.
  it("is still default-on, which is what makes this worth guarding", () => {
    expect(brand.features.aiStylist).toBe(true);
  });

  it("binds `en` inside ToolResultRenderer, not only in its siblings", () => {
    const src = read("components/AIStylistPanel.tsx");
    const start = src.indexOf("function ToolResultRenderer");
    expect(start).toBeGreaterThan(-1);
    // The component ends at the next top-level declaration.
    const rest = src.slice(start + 1);
    const end = start + 1 + rest.search(/\n(function|const|export) /);
    const body = src.slice(start, end);

    expect(body).toMatch(/const en = useLocale\(\) === "en"/);
    // The three strings that leaked, each now behind the file's own ternary.
    for (const danish of [
      "✓ Velkommen tilbage!",
      "Seneste leveringsadresse: ",
      "✓ Lagt i kurven: ",
    ]) {
      expect(body, `"${danish}" is no longer in ToolResultRenderer`).toContain(danish);
      const at = body.indexOf(danish);
      const before = body.slice(Math.max(0, at - 120), at);
      expect(before, `"${danish}" is not behind an en-ternary`).toMatch(/en \?/);
    }
  });
});

describe("the two HTML pages served outside app/[locale]", () => {
  const PAGES = [
    "app/api/newsletter/unsubscribe/route.ts",
    "app/api/fulfillment/confirm/route.ts",
  ];

  it.each(PAGES)("%s does not hardcode lang=\"da\"", (file) => {
    const src = read(file);
    expect(src).not.toContain(`lang="da"`);
    expect(src).toContain(`lang="${"${brand.defaultLocale}"}"`);
  });

  it.each(PAGES)("%s branches on the shop's locale", (file) => {
    // Danish must be the special case, so a German or Spanish shop gets
    // English rather than falling through to Danish.
    // The cast is load-bearing, not noise: `defaultLocale` is a literal type,
    // so a bare `=== "da"` compiles on the engine ("da") and fails to compile
    // in a scaffold ("en"). The gate caught exactly that on v0.53.0.
    expect(read(file)).toMatch(
      /const da = \(brand\.defaultLocale as string\) === "da"/,
    );
  });

  it("serves English HTML on a non-Danish shop", async () => {
    vi.resetModules();
    vi.doMock("@/lib/newsletter", () => ({ unsubscribe: async () => ({ ok: false }) }));
    const { GET } = await import("@/app/api/newsletter/unsubscribe/route");
    const res = await GET(
      new NextRequest("http://localhost/api/newsletter/unsubscribe?token=nope"),
    );
    const html = await res.text();

    // brand.defaultLocale is "da" in the engine (it IS the Teloz site), so this
    // asserts the mechanism, not the engine's own output: the document's lang
    // must equal the configured locale, and the copy must follow the same flag.
    expect(html).toContain(`lang="${brand.defaultLocale}"`);
    // Widened for the same reason the routes are: the literal type is "da" on
    // the engine and "en" in a scaffold, so a bare comparison fails to compile
    // in one of the two — which is how the gate caught this.
    if ((brand.defaultLocale as string) === "da") {
      expect(html).toContain("Linket er ugyldigt");
    } else {
      expect(html).toContain("That link is not valid");
      expect(html).not.toMatch(/[æøåÆØÅ]/);
    }
    vi.doUnmock("@/lib/newsletter");
  });
});

describe("password reset answers with a code the page can translate", () => {
  it("returns codes, not prose", () => {
    const src = read("lib/auth/password-reset.ts");
    expect(src).not.toMatch(/error: "Linket er/);
    expect(src).toMatch(/code: "missing_token"/);
    expect(src).toMatch(/code: "invalid_or_expired_link"/);
  });

  it("maps every code to a key that resolves in every locale", () => {
    const action = read("app/[locale]/account/reset-password/actions.ts");
    const resetModule = read("lib/auth/password-reset.ts");

    // The codes the module can actually return, read from its own union type —
    // not a list copied into the test that could drift away from the source.
    const union = resetModule.slice(
      resetModule.indexOf("export type PasswordResetFailure"),
      resetModule.indexOf(";", resetModule.indexOf("export type PasswordResetFailure")),
    );
    const codes = [...union.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);

    // Every code has an entry in the action's KEY record.
    const recordStart = action.indexOf("const KEY: Record<PasswordResetFailure");
    expect(recordStart).toBeGreaterThan(-1);
    const record = action.slice(recordStart, action.indexOf("};", recordStart));
    for (const code of codes) {
      expect(record, `code "${code}" has no translation key`).toContain(`${code}:`);
    }

    // Every key referenced anywhere in the action — the record's values and the
    // three direct t() calls that were already there — resolves in every locale.
    const keys = new Set<string>([
      ...[...record.matchAll(/"(resetActions_\w+)"/g)].map((m) => m[1]),
      ...[...action.matchAll(/t\("(resetActions_\w+)"\)/g)].map((m) => m[1]),
    ]);
    expect(keys.size).toBeGreaterThanOrEqual(codes.length);

    for (const locale of ["en", "da"]) {
      const bag = JSON.parse(read(`messages/${locale}.json`)).Account ?? {};
      for (const key of keys) {
        expect(
          typeof bag[key] === "string" && bag[key].length > 0,
          `messages/${locale}.json is missing Account.${key}`,
        ).toBe(true);
      }
    }
  });
});

describe("a review byline is not Danish forever", () => {
  it("stores no word at all, so the fallback can follow the locale", () => {
    // `authorName` is `String` (not nullable) in the schema, so "" is the
    // only value that means "none" without a migration.
    const src = read("plugins/reviews/api/submit.ts");
    expect(src).not.toContain(`?? "Anonym"`);
    expect(src).toMatch(/session\?\.user\?\.name \?\? ""/);
  });

  it("renders a localized fallback instead of an empty byline", () => {
    const src = read("plugins/reviews/components/ReviewList.tsx");
    expect(src).toMatch(/anonymous: en \? "Anonymous" : "Anonym"/);
    expect(src).toMatch(/r\.authorName \|\| t\.anonymous/);
  });
});
