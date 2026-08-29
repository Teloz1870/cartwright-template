/**
 * Crema — site-wide theme Shell.
 *
 * Crema keeps the SHARED Header/Footer (dark via the `chrome: "dark"` hint) —
 * this Shell only wraps every page in the `.crema-site` scope so the locked
 * dark roast reaches ALL routes, not just the surfaces the pack templates:
 *
 *  - carries the pack's next/font variables site-wide (cart, checkout,
 *    account, /info/* render outside the homepage's `.crema-root` subtree);
 *  - pins the six sol-* chrome tokens to the crema palette (belt-and-
 *    suspenders under the `applyPaletteAsTheme` bridge in index.ts — a stray
 *    DB themeJson repaints `:root`, but a scoped pin beats `:root` at every
 *    use-site, so the theme stays genuinely locked);
 *  - sets `color-scheme: dark` + the compensation rules for the handful of
 *    hardcoded light utilities (`.bg-white` form panels, light-canvas green)
 *    — see `.crema-site` in crema.css.
 *
 * `flex w-full flex-1 flex-col` preserves the root layout's body flex chain
 * (body is `min-h-full flex flex-col`); without it the shared footer's
 * `mt-auto` stops sticking to the bottom on short pages.
 *
 * Deliberately NOT in CHROME_DESIGN_SLUGS: that set mirrors packs whose
 * Header/Footer REPLACE the shared chrome (it feeds the mixer's part
 * catalogue, which requires a header+footer part per listed slug). A
 * Shell-only pack renders the shared chrome and stays out of the set.
 */
import type { ReactNode } from "react";
import { cremaFontVars } from "./fonts";
import "./crema.css";

export function CremaShell({ children }: { children: ReactNode; locale: string }) {
  return (
    <div className={`${cremaFontVars} crema-site flex w-full flex-1 flex-col`}>
      {children}
    </div>
  );
}
