/**
 * Drive — site-wide chrome (Shell + Header + Footer).
 *
 * Moves the slim sticky nav + small footer out of the homepage so the Drive
 * silent-luxury look reaches EVERY page (contact, info, …), not just `/`. The
 * Shell applies the `.drv` root class + next/font variables ONCE around all page
 * content, so the locked light theme, Montserrat, and the scoped `.drv__*` styles
 * work on any page rendered inside it. Server components, CSS-only — same contract
 * as the homepage.
 *
 * Wired via DesignPack.siteChrome (designs/drive/index.ts). When a design sets
 * siteChrome, app/[locale]/layout.tsx renders the design's chrome instead of the
 * shared Header/Footer and wraps the page in the Shell.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Montserrat } from "next/font/google";
import type { DesignChromeProps } from "../types";
import "./drv.css";

const display = Montserrat({
  subsets: ["latin"],
  variable: "--font-drv-display",
  display: "swap",
  weight: ["500", "600", "700"],
});
const body = Montserrat({
  subsets: ["latin"],
  variable: "--font-drv-body",
  display: "swap",
  weight: ["400", "500"],
});

/** Wraps all page content: applies the `.drv` theme + fonts once, site-wide. */
export function DriveShell({ children }: { children: ReactNode; locale: string }) {
  return (
    <div className={`drv ${display.variable} ${body.variable}`}>
      <div className="drv__wrap">{children}</div>
    </div>
  );
}

export function DriveHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <nav className="drv__nav" aria-label="Primary">
      <div className="drv__nav-inner">
        <div className="drv__nav-side drv__nav-side--left">
          <Link href={`${home}#range`}>Range</Link>
          <Link href={`${home}#autonomy`}>Autopilot</Link>
          <Link href={`${home}#energy`}>Energy</Link>
        </div>
        <Link className="drv__wordmark" href={home}>VOLTÉRA</Link>
        <div className="drv__nav-side drv__nav-side--right">
          <Link href={`${home}/contact`}>Contact</Link>
          <Link href={`${home}#shop`}>Shop</Link>
          <Link className="drv__nav-menu" href={`${home}/contact`} aria-label="Menu">
            <span /><span /><span />
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function DriveFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <footer className="drv__footer">
      <div className="drv__footer-inner">
        <span className="drv__footer-brand">VOLTÉRA</span>
        <nav className="drv__footer-links" aria-label="Footer">
          <Link href={home}>Vehicles</Link>
          <Link href={`${home}#energy`}>Energy</Link>
          <Link href={`${home}#charging`}>Charging</Link>
          <Link href={`${home}/contact`}>Support</Link>
          <Link href={`${home}/contact`}>Contact</Link>
        </nav>
        <span className="drv__footer-meta">© 2026 Voltéra Motors · Fictional brand</span>
      </div>
    </footer>
  );
}
