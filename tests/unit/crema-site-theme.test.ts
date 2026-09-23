import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cremaDesign } from "@/designs/crema";
import { CHROME_DESIGN_SLUGS } from "@/designs/chrome-slugs";

/**
 * Crema's site-wide dark theme is TWO cooperating mechanisms, and losing
 * either one silently reopens the dark/light seam this shipped to close
 * (homepage/PDP dark, PLP/cart/checkout/account light — measured live on
 * demo.cartwright.app before this):
 *
 *  1. `applyPaletteAsTheme` — root bridge: the sol- and cw- token families
 *     remapped at :root so every default body self-darkens.
 *  2. `siteChrome.Shell` — the `.crema-site` scope: fonts, scoped sol pins
 *     (immune to a stray DB themeJson), color-scheme, and compensation for
 *     hardcoded light utilities.
 */
describe("crema site-wide theme contract", () => {
  it("bridges its palette onto the theme tokens", () => {
    expect(cremaDesign.applyPaletteAsTheme).toBe(true);
  });

  it("ships a theme Shell but keeps the shared header/footer", () => {
    expect(typeof cremaDesign.siteChrome?.Shell).toBe("function");
    expect(cremaDesign.siteChrome?.Header).toBeUndefined();
    expect(cremaDesign.siteChrome?.Footer).toBeUndefined();
  });

  it("stays out of CHROME_DESIGN_SLUGS (that set = packs whose header/footer REPLACE the shared chrome and feed the mixer's part catalogue)", () => {
    expect(CHROME_DESIGN_SLUGS.has("crema")).toBe(false);
  });

  it("extraTokens covers every auxiliary sol token the root bridge does not derive", () => {
    // The bridge (paletteToFullThemeCss) derives the six core sol tokens from
    // the palette. Everything else the theme CSS defines (glass family, sun,
    // hero overlay, accent variants) keeps its LIGHT value unless the pack
    // overrides it — so the aux set is derived from themes/generic.css and
    // each member must have a crema value. A token added to the theme later
    // fails here instead of rendering light-on-dark in the mobile menu.
    const themeCss = readFileSync(
      join(process.cwd(), "themes/generic.css"),
      "utf8",
    );
    const allSolTokens = new Set(
      [...themeCss.matchAll(/--color-sol-[a-z-]+/g)].map((m) => m[0]),
    );
    const bridgeDerived = new Set([
      "--color-sol-accent",
      "--color-sol-accent-deep",
      "--color-sol-cream",
      "--color-sol-sand",
      "--color-sol-ink",
      "--color-sol-muted",
    ]);
    const extraKeys = new Set(
      Object.keys(cremaDesign.tokens.extraTokens ?? {}).map((k) => `--${k}`),
    );
    for (const token of allSolTokens) {
      if (bridgeDerived.has(token)) continue;
      expect(extraKeys.has(token), `${token} needs a crema value`).toBe(true);
    }
  });

  it(".crema-site scope pins the core sol tokens and compensates hardcoded light utilities", () => {
    const css = readFileSync(
      join(process.cwd(), "designs/crema/crema.css"),
      "utf8",
    );
    const siteBlock = css.slice(css.indexOf(".crema-site {"));
    expect(siteBlock.length).toBeGreaterThan(0);
    for (const pin of [
      "--color-sol-accent:",
      "--color-sol-cream:",
      "--color-sol-sand:",
      "--color-sol-ink:",
      "--color-sol-muted:",
      "--color-sol-sun:",
      "--font-display:",
      "--color-green-800:",
    ]) {
      expect(siteBlock).toContain(pin);
    }
    expect(css).toContain(".crema-site .bg-white");
  });
});
