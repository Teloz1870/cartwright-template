import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * TREND34-b3: the AI order flow, the AI stylist panel and the voice overlay
 * size their text in rem, never px — so it grows with the visitor's text size.
 *
 * A px font size ignores the browser's / OS's text-size setting. In these three
 * panels that hid the statutory 14-day right-of-withdrawal notice (PlanCard),
 * prices and stock (AIStylistPanel comparison) at a locked 9–11px. 1:1 rem
 * (10px → 0.625rem) renders identically at the default 16px root.
 *
 * A customer scaffold may prune a panel (scaffold/manifest.json modules), so a
 * missing file is skipped there; in the engine checkout (the repo-hygiene
 * probe) every file must exist, so a rename cannot make this pass vacuously.
 */
const ROOT = path.resolve(__dirname, "../..");
const isEngineCheckout = existsSync(path.join(ROOT, ".github", "sync-excludes.txt"));

const FILES = [
  "components/AIStylistPanel.tsx",
  "components/shared/PlanCard.tsx",
  "components/voice/VoiceShopOverlay.tsx",
];

/** Tailwind `text-[Npx]` and CSS `font-size: Npx` (inline style objects too). */
const PX_FONT_SIZE = /text-\[\d+(?:\.\d+)?px\]|font-?size["']?\s*:\s*["']?\d+(?:\.\d+)?px/gi;

function pxFontSizes(source: string): string[] {
  return source.match(PX_FONT_SIZE) ?? [];
}

describe("AI + voice panels: text sizes follow the visitor's text size (TREND34-b3)", () => {
  it("the pattern catches the forms it guards (not vacuous)", () => {
    expect(pxFontSizes('<p className="mt-2 text-[10px] leading-5">')).toEqual(["text-[10px]"]);
    expect(pxFontSizes(".x { font-size: 11px; }")).toEqual(["font-size: 11px"]);
    expect(pxFontSizes("style={{ fontSize: 9 }} style={{ fontSize: '9px' }}")).toEqual([
      "fontSize: '9px",
    ]);
    expect(pxFontSizes('<p className="text-[0.625rem] text-xs">')).toEqual([]);
  });

  for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    it(`${rel} has no px font size`, () => {
      if (!existsSync(abs)) {
        expect(isEngineCheckout, `${rel} is missing from the engine checkout`).toBe(false);
        return;
      }
      expect(pxFontSizes(readFileSync(abs, "utf8"))).toEqual([]);
    });
  }
});
