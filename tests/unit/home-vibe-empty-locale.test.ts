import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@/brand.config";
import { localizedVibeHtml } from "@/lib/translated-field";

/**
 * HOME-VIBE-EMPTY-EN: the homepage read `translations[locale].vibeHtml ?? base`.
 * An empty string is not nullish, so a Vibe Sandbox save with an empty English
 * tab (`en.vibeHtml = ""`) rendered an empty vibe container on /en.
 *
 * The locale is a fixed string, not one of `brand.locales`: the helper does not
 * read brand config, and a scaffold (locales ["en"]) must run this unchanged.
 */
const BASE = "<section>base design</section>";
const LOCALE = "xx";

function page(translations: unknown) {
  return { vibeHtml: BASE, translations };
}

describe("localizedVibeHtml", () => {
  it("falls back to the base vibe HTML when the locale's entry is an empty string", () => {
    expect(localizedVibeHtml(page({ [LOCALE]: { vibeHtml: "" } }), LOCALE)).toBe(BASE);
  });

  it("falls back when the locale's entry is whitespace only", () => {
    expect(localizedVibeHtml(page({ [LOCALE]: { vibeHtml: "  \n\t " } }), LOCALE)).toBe(BASE);
  });

  it("a real translation still wins", () => {
    const translated = "<section>translated design</section>";
    expect(localizedVibeHtml(page({ [LOCALE]: { vibeHtml: translated } }), LOCALE)).toBe(translated);
  });

  it("a real translation wins on the default locale and on en too — no base-locale short-circuit", () => {
    const translated = "<section>translated design</section>";
    for (const locale of [brand.defaultLocale, "en"]) {
      expect(localizedVibeHtml(page({ [locale]: { vibeHtml: translated } }), locale)).toBe(translated);
      expect(localizedVibeHtml(page({ [locale]: { vibeHtml: "" } }), locale)).toBe(BASE);
    }
  });

  it("falls back when there is no entry, no translations, or a non-string value", () => {
    expect(localizedVibeHtml(page(null), LOCALE)).toBe(BASE);
    expect(localizedVibeHtml(page({}), LOCALE)).toBe(BASE);
    expect(localizedVibeHtml(page({ [LOCALE]: { title: "Hi" } }), LOCALE)).toBe(BASE);
    expect(localizedVibeHtml(page({ [LOCALE]: { vibeHtml: 42 } }), LOCALE)).toBe(BASE);
  });

  it("reads translations stored as JSON text as well as an object", () => {
    const translated = "<section>from text column</section>";
    const text = JSON.stringify({ [LOCALE]: { vibeHtml: translated } });
    expect(localizedVibeHtml(page(text), LOCALE)).toBe(translated);
    expect(localizedVibeHtml(page(JSON.stringify({ [LOCALE]: { vibeHtml: "" } })), LOCALE)).toBe(BASE);
  });

  it("the homepage renders through it, not through a `??` read of translations", () => {
    const src = readFileSync(path.join(process.cwd(), "app/[locale]/page.tsx"), "utf8");
    expect(src).toMatch(/const localizedHtml = localizedVibeHtml\(homePage, locale\) \?\? homePage\.vibeHtml;/);
    expect(src).toMatch(/__html: localizedHtml/);
    expect(src).not.toMatch(/\?\.vibeHtml \?\? homePage\.vibeHtml/);
  });
});
