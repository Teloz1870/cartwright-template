import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TREND34-b1 — the shared chrome and the default shop's hero announcement
 * size their text in rem, so it follows the visitor's OS/browser text size
 * (a px font size stays put at a 200 % text setting). The conversion was
 * 1:1 at the 16px default (10px → 0.625rem), so nothing moves for a visitor
 * on default settings.
 *
 * A profile may prune some of these files from a scaffold; a missing file
 * skips its case rather than failing.
 */
const FILES = [
  "components/HeaderClient.tsx",
  "components/ProductCard.tsx",
  "components/Footer.tsx",
  "components/Footer.static.tsx",
  "components/payments/PaymentMethodsRow.tsx",
  "designs/aurora-shop/homepage.tsx",
];

// Tailwind arbitrary classes (also the `text-[10px/14px]` size/line-height
// form and the typed `text-[length:10px]` form), raw CSS, and JSX inline
// styles (`fontSize: "11px"` or the unitless `fontSize: 11`, which React
// reads as px).
const PX_FONT_SIZE =
  /text-\[(?:length:)?[0-9.]+px[\]/]|font-size:\s*[0-9.]+px|fontSize:\s*(?:["'`][0-9.]+px["'`]|[0-9.]+\b)/g;

describe("chrome text follows the visitor's text size (TREND34-b1)", () => {
  for (const file of FILES) {
    const path = join(process.cwd(), file);
    it.skipIf(!existsSync(path))(`${file} has no px-locked font size`, () => {
      const hits = readFileSync(path, "utf8").match(PX_FONT_SIZE) ?? [];
      expect(hits).toEqual([]);
    });
  }

  const header = join(process.cwd(), "components/HeaderClient.tsx");
  it.skipIf(!existsSync(header))(
    "sizes the cart-count bubble from its own text, so it cannot clip at 200 %",
    () => {
      const src = readFileSync(header, "utf8");
      const bubble = src.match(/className="([^"]*bg-sol-accent[^"]*)"[^>]*>\s*\{\s*cartCount\s*\}/);
      expect(bubble, "cart-count bubble not found").not.toBeNull();
      const cls = bubble![1]; // the class list alone, not sibling attributes
      expect(cls).toMatch(/\bh-\[[0-9.]+em\]/);
      expect(cls).toMatch(/\bmin-w-\[[0-9.]+em\]/);
      // Only the sizing utilities: a px border or offset does not clip text.
      // `\bh-`/`\bw-` also catch `max-h-`/`max-w-` (a word boundary sits
      // after the hyphen).
      expect(cls).not.toMatch(
        /\b(?:h|w|min-w|min-h|size|text|leading)-\[(?:length:)?[0-9.]+px[\]/]/,
      );
    },
  );
});
