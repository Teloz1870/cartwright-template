import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The newsletter strip used to hardcode Danish SaaS copy ("Hold dig opdateret" /
 * "Tilmeld dig for nyheder om AI, e-commerce og nye platform-features.") for
 * every dark-chrome shop. Dark chrome is a THEME hint (`design.chrome ===
 * "dark"`), not an identity — so a dark coffee shop advertised Danish platform
 * marketing on its /en pages. The rule (same as #456/#469): a config default or
 * source literal must never pick the language for a locale-routed storefront.
 * Both footers must render the brand's own newsletter copy on every chrome.
 *
 * Source scan, not a render: the defect is re-introducible only by writing the
 * literal back into a branch, which a mocked render could easily miss.
 */
const FILES = ["components/Footer.tsx", "components/Footer.static.tsx"];

describe("footer newsletter copy is brand-driven on every chrome", () => {
  for (const file of FILES) {
    it(`${file} carries no hardcoded newsletter copy`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src).not.toContain("Hold dig opdateret");
      expect(src).not.toContain("Tilmeld dig for nyheder");
      // The kicker is localized, not a literal.
      expect(src).not.toMatch(/>\s*Newsletter\s*</);
      expect(src).toContain('t("newsletterKicker")');
      // The brand copy renders unconditionally — no chrome-keyed copy ternary.
      // (isSaas still legitimately switches CLASSES; it must not switch text.)
      expect(src).not.toMatch(/isSaas[\s\S]{0,40}newsletterHeading/);
      expect(src).not.toMatch(/isSaas[\s\S]{0,40}newsletterSubtext/);
    });
  }
});
