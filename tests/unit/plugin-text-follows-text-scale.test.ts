import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TREND34-b4 — the storefront plugins (reviews, blog, phone widget) size
 * their small text in rem, so it follows the visitor's OS/browser text size.
 * The conversion is 1:1 at the 16px default (10px → 0.625rem, 11px →
 * 0.6875rem), so nothing moves on default settings; each case pins the rem
 * value as well, so a rem that no longer equals the old px is caught.
 *
 * A profile may prune a plugin from a scaffold; a missing file skips its
 * case rather than failing.
 */
const CASES: Array<{ file: string; rems: Record<string, number> }> = [
  { file: "plugins/reviews/components/WriteReviewForm.tsx", rems: { "0.625rem": 2 } },
  { file: "plugins/reviews/components/ReviewList.tsx", rems: { "0.625rem": 1 } },
  { file: "plugins/blog/pages/BlogIndexPage.tsx", rems: { "0.6875rem": 1 } },
  { file: "plugins/blog/pages/BlogPostPage.tsx", rems: { "0.6875rem": 1 } },
  { file: "plugins/phone-widget/components/PhoneWidget.tsx", rems: { "0.625rem": 1 } },
];

// Same pattern as chrome-text-follows-text-scale.test.ts: Tailwind arbitrary
// classes (incl. `text-[10px/14px]` and `text-[length:10px]`), raw CSS and
// JSX inline styles (`fontSize: "11px"` or the unitless `fontSize: 11`).
const PX_FONT_SIZE =
  /text-\[(?:length:)?[0-9.]+px[\]/]|font-size:\s*[0-9.]+px|fontSize:\s*(?:["'`][0-9.]+px["'`]|[0-9.]+\b)/g;

const count = (src: string, needle: string) => src.split(`text-[${needle}]`).length - 1;

describe("plugin text follows the visitor's text size (TREND34-b4)", () => {
  for (const { file, rems } of CASES) {
    const path = join(process.cwd(), file);
    it.skipIf(!existsSync(path))(`${file} has no px-locked font size`, () => {
      const src = readFileSync(path, "utf8");
      expect(src.match(PX_FONT_SIZE) ?? []).toEqual([]);
      for (const [rem, n] of Object.entries(rems)) {
        expect(count(src, rem), `text-[${rem}] in ${file}`).toBe(n);
      }
    });
  }
});
