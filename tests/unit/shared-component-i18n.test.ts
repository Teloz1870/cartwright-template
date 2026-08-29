import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/**
 * Shared components that render on a locale route must speak the page's
 * language — and every key they name must actually resolve.
 *
 * Two shapes were found here, and they are opposites of the same defect:
 *
 * - `MagicLinkForm` had no i18n at all while its own parent, `LoginForm`, had
 *   three `useTranslations` calls. So a Danish shop's login page was Danish on
 *   the password tab and English on the magic-link tab — the same page, two
 *   languages, because one component was written later than the other.
 * - `plugins/reviews/pages/OrderReviewPage` was the reverse: hardcoded Danish
 *   on a page reachable from any order, on any shop.
 * - The four `components/chrome-parts/*` render on every page of any shop that
 *   selects them, and announced "Explore" / "Primary" / "Footer" to screen
 *   readers regardless of locale.
 *
 * The second assertion is the one that keeps paying: a `t("key")` naming a key
 * that exists in `en.json` but not `da.json` renders the key itself — a raw
 * identifier on the page — and nothing else in the suite would catch it.
 */

const read = (p: string) => readFileSync(p, "utf8");

/** Rendered on a locale route, shared across shops, not a design pack's demo copy. */
const SHARED = [
  "components/MagicLinkForm.tsx",
  "components/chrome-parts/MegaFooter.tsx",
  "components/chrome-parts/CenteredHeader.tsx",
  "components/chrome-parts/MinimalHeader.tsx",
  "components/chrome-parts/SlimFooter.tsx",
].filter(existsSync);

const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));

function bag(locale: string, namespace: string): Record<string, unknown> {
  const parsed = JSON.parse(read(`messages/${locale}`)) as Record<string, unknown>;
  return (parsed[namespace] as Record<string, unknown>) ?? {};
}

describe("shared components follow the page locale", () => {
  it("covers a real surface in a repo that has locale files", () => {
    expect(SHARED.length).toBe(5);
    expect(LOCALES.length).toBeGreaterThan(0);
  });

  it.each(SHARED)("%s reads its copy from next-intl", (file) => {
    const src = read(file);
    expect(src).toMatch(/\b(useTranslations|getTranslations)\("(\w+)"\)/);
  });

  it.each(SHARED)("%s names only keys that resolve in every locale", (file) => {
    const src = read(file);
    const ns = /\b(?:useTranslations|getTranslations)\("(\w+)"\)/.exec(src)?.[1];
    expect(ns, `${file} declares no namespace`).toBeTruthy();

    const keys = [...src.matchAll(/\bt\("(\w+)"\)/g)].map((m) => m[1]);
    // A component in this list that names no keys is either mis-listed or has
    // silently lost its copy — either way the assertion below would be empty.
    expect(keys.length, `${file} uses next-intl but names no keys`).toBeGreaterThan(0);

    for (const locale of LOCALES) {
      const messages = bag(locale, ns!);
      for (const key of keys) {
        const value = messages[key];
        expect(
          typeof value === "string" && value.length > 0,
          `messages/${locale} is missing ${ns}.${key} — the page would render the key itself`,
        ).toBe(true);
      }
    }
  });

  /**
   * JSX text nodes, across line breaks.
   *
   * The first version of this check required `>` and `<` on the SAME line, so
   * a mutation putting a Danish heading back on its own line passed. Real JSX
   * copy is almost always on its own line — which is exactly the case it
   * missed.
   */
  function jsxTextNodes(src: string): string[] {
    const withoutComments = src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    return [...withoutComments.matchAll(/>([^<>{}]+)</g)]
      .map((m) => m[1].replace(/\s+/g, " ").trim())
      // Two or more words of letters = a sentence someone wrote, not markup
      // punctuation like "·", "→" or a lone "&nbsp;".
      .filter((s) => /(?:[A-Za-zÆØÅæøå]+\s+){1,}[A-Za-zÆØÅæøå]+/.test(s))
      // `>…<` also spans TypeScript generics and expressions, e.g.
      // `setErrorMessage(null); async function handleSubmit(e: React.FormEvent`.
      // Code punctuation is the tell; prose does not carry it.
      .filter((s) => !/[;()=:]/.test(s));
  }

  /**
   * Sentences inside a JSX EXPRESSION, e.g.
   * `{status === "sending" ? t("magicSending") : "Send me a link"}`.
   *
   * `>…<` stops at the opening brace, so a mutation putting that literal back
   * passed the text-node check. This looks at string literals instead: a
   * capitalised multi-word string that is not an attribute value.
   */
  function hardcodedSentences(src: string): string[] {
    return [...src.matchAll(/(\w+=)?"([A-ZÆØÅ][^"\n]{6,})"/g)]
      .filter((m) => !m[1]) // className="…", aria-label="…" are handled above
      .map((m) => m[2])
      .filter((s) => /\s/.test(s))
      // Import paths, type unions and formats are capitalised but not copy.
      .filter((s) => !/[<>{}=;|]/.test(s));
  }

  it.each(SHARED)("%s hardcodes no sentence inside an expression", (file) => {
    expect(
      hardcodedSentences(read(file)),
      `${file} has copy in an expression that no locale can change`,
    ).toEqual([]);
  });

  it.each(SHARED)("%s renders no hardcoded sentence", (file) => {
    expect(
      jsxTextNodes(read(file)),
      `${file} has JSX copy that no locale can change`,
    ).toEqual([]);
  });

  it("the review page reachable from an order renders no hardcoded copy", () => {
    const file = "plugins/reviews/pages/OrderReviewPage.tsx";
    if (!existsSync(file)) return; // pruned with the reviews plugin
    const src = read(file);
    // Its copy now lives in the `en ? … : …` dictionary the plugin's other
    // components use, so the JSX should carry none of it.
    expect(src).toMatch(/const en = locale === "en"/);
    // NOT filtered on æøå: "Anmeld produkter fra denne ordre" carries none,
    // and an earlier version of this assertion passed a mutation that put it
    // back for exactly that reason. Any hardcoded sentence fails, whatever
    // language it is in.
    expect(jsxTextNodes(src), "copy no locale can change").toEqual([]);
  });
});
