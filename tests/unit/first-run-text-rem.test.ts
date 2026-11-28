import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TREND34-b5 — the first-run welcome canvas follows the visitor's text size.
 *
 * Every text size on the canvas is in rem, so a visitor who raised the
 * browser/OS default font size gets bigger text here too; a px size ignores
 * that setting. px → rem was converted 1:1 (13px → 0.8125rem), which renders
 * pixel-identically at the 16px default.
 *
 * Static on purpose: the canvas only renders on an untouched scaffold, so no
 * canary exercises it. A site-profile scaffold has no admin module and
 * therefore no WelcomeCanvas — a missing file is skipped, not failed.
 */

const root = join(__dirname, "..", "..");
const FILES = [
  "components/first-run/WelcomeCanvas.tsx",
  "components/first-run/CopyCommand.tsx",
];

/** Tailwind arbitrary px text sizes and CSS px font-size declarations. */
const PX_TEXT_SIZE =
  /text-\[[^\]]*?[0-9.]+px(?![a-z])[^\]]*\]|font-size:[\t ]*[0-9.]+px|fontSize:[\t ]*["'`]?[0-9.]+(px)?\b/i;

function pxSizeLines(source: string): string[] {
  return source
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => PX_TEXT_SIZE.test(line))
    .map(({ line, n }) => `${n}: ${line.trim()}`);
}

describe("first-run welcome canvas text sizes are rem, not px (TREND34-b5)", () => {
  for (const file of FILES) {
    const path = join(root, file);
    it.skipIf(!existsSync(path))(`${file} sets no px font size`, () => {
      expect(pxSizeLines(readFileSync(path, "utf8"))).toEqual([]);
    });
  }

  it("the matcher catches each px form it is meant to forbid", () => {
    expect(pxSizeLines('<p className="text-[13px]">')).toHaveLength(1);
    expect(pxSizeLines(".a { font-size: 12px; }")).toHaveLength(1);
    expect(pxSizeLines("style={{ fontSize: 11 }}")).toHaveLength(1);
    expect(pxSizeLines('style={{ fontSize: "11px" }}')).toHaveLength(1);
    expect(pxSizeLines('<p className="text-[12PX]">')).toHaveLength(1);
    expect(pxSizeLines('<p className="text-[_12px_]">')).toHaveLength(1);
    expect(pxSizeLines(".a { FONT-SIZE: 12PX; }")).toHaveLength(1);
    expect(pxSizeLines('<p className="text-[length:13px]">')).toHaveLength(1);
    expect(pxSizeLines('<p className="text-[calc(13px)]">')).toHaveLength(1);
    expect(pxSizeLines('<p className="text-[clamp(0.75rem,2vw,14px)]">')).toHaveLength(1);
    expect(pxSizeLines('<p className="text-[var(--cw-brand)] shadow-[0_30px_70px_rgba(0,0,0,0.4)]">')).toEqual([]);
    expect(pxSizeLines('<p className="text-[0.8125rem] text-sm">')).toEqual([]);
  });

  // Once grown text pushes the copy button onto a row of its own, the button
  // must keep one command line of height (not shrink to its text) and carry
  // the divider from the command above it (TREND34-b5 R1).
  const copyPath = join(root, "components/first-run/CopyCommand.tsx");
  it.skipIf(!existsSync(copyPath))("the copy button keeps its height and a top divider when it wraps", () => {
    const source = readFileSync(copyPath, "utf8");
    const button = source.match(/<button[\s\S]*?className="([^"]*)"/);
    expect(button).not.toBeNull();
    const classes = button![1].split(/\s+/);
    expect(classes).toContain("min-h-[calc(1.25rem_+_0.6875rem_*_1.375)]");
    expect(classes).toContain("border-t");
    expect(classes).toContain("-mt-px");
  });

  // Wrapped, the button must fill its row so the divider and the click
  // target span the chip, not a corner box at the right (TREND34-b5 R2).
  // `grow` fills the row; the command's far larger grow keeps a shared row
  // as before; `-ml-px` + the command's `mr-px` hide the left border at a
  // row start without moving anything on a shared row.
  it.skipIf(!existsSync(copyPath))("the wrapped copy button fills its row and hides its left border", () => {
    const source = readFileSync(copyPath, "utf8");
    const button = source.match(/<button[\s\S]*?className="([^"]*)"/)![1].split(/\s+/);
    const code = source.match(/<code[\s\S]*?className="([^"]*)"/)![1].split(/\s+/);
    expect(button).toContain("grow");
    expect(button).not.toContain("ml-auto");
    expect(button).toContain("-ml-px");
    expect(code).toContain("mr-px");
    const codeGrow = code.find((c) => c.startsWith("flex-["));
    expect(codeGrow).toBeDefined();
    expect(Number(codeGrow!.slice(6).split("_")[0])).toBeGreaterThanOrEqual(100000);
  });

  // The two classes that make the wrap happen at all: without `flex-wrap`
  // the button never leaves the command's row, and without a min-width floor
  // the command shrinks to nothing instead of pushing the button down
  // (TREND34-b5 R3). The floor must stay small enough that the widest label
  // (Kopieret!) still fits beside it on a 320px phone at the default size,
  // or a click on Copy moves the button to its own row for two seconds.
  it.skipIf(!existsSync(copyPath))("the chip wraps, with a command floor small enough for the widest label", () => {
    const source = readFileSync(copyPath, "utf8");
    const chip = source.match(/<div[\s\S]*?className="([^"]*)"/)![1].split(/\s+/);
    const code = source.match(/<code[\s\S]*?className="([^"]*)"/)![1].split(/\s+/);
    expect(chip).toContain("flex");
    expect(chip).toContain("flex-wrap");
    expect(code).toContain("min-w-[min(100%,7rem)]");
  });

  // The admin email in the setup hint may break mid-address, so a long one
  // cannot push the card wider than the screen.
  const canvasPath = join(root, "components/first-run/WelcomeCanvas.tsx");
  it.skipIf(!existsSync(canvasPath))("the setup hint may break inside the admin email", () => {
    const source = readFileSync(canvasPath, "utf8");
    const hint = source.match(/<p className="([^"]*)">\s*\{t\("setupHint"/);
    expect(hint).not.toBeNull();
    expect(hint![1].split(/\s+/)).toContain("[overflow-wrap:anywhere]");
  });
});
