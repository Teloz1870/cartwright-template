/**
 * Aerospace — site-wide chrome (Shell + Header + Footer).
 *
 * Moves the nav + footer out of the homepage so the aero look reaches EVERY page
 * (contact, info, …), not just `/`. The Shell applies the `.aero` root class +
 * next/font variables ONCE around all page content, so the locked dark theme,
 * the fonts, and the scoped `.aero__*` styles work on any page rendered inside
 * it. Server components, CSS-only — same contract as the homepage.
 *
 * Wired via DesignPack.siteChrome (designs/aerospace/index.ts). When a design
 * sets siteChrome, app/[locale]/layout.tsx renders the design's chrome instead
 * of the shared Header/Footer and wraps the page in the Shell.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Oswald, Inter, JetBrains_Mono } from "next/font/google";
import type { DesignChromeProps } from "../types";
import "./aero.css";

const display = Oswald({
  subsets: ["latin"],
  variable: "--font-aero-display",
  display: "swap",
  weight: ["500", "600", "700"],
});
const body = Inter({ subsets: ["latin"], variable: "--font-aero-body", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-aero-mono",
  display: "swap",
  weight: ["400", "500", "700"],
});

const BrandMark = () => (
  <span className="aero__brand-mark" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 1.5 16 16l-6-3.6L4 16 10 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  </span>
);

const Arrow = () => (
  <svg className="aero__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Wraps all page content: applies the `.aero` theme + fonts once, site-wide. */
export function AeroShell({ children }: { children: ReactNode; locale: string }) {
  return (
    <div className={`aero ${display.variable} ${body.variable} ${mono.variable}`}>
      <div className="aero__wrap">{children}</div>
    </div>
  );
}

export function AeroHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <nav className="aero__nav" aria-label="Primary">
      <div className="aero__inner aero__navbar">
        <Link className="aero__brand" href={home}>
          <BrandMark />
          <span>
            ASTRA<span className="aero__brand-dim">DYNE</span>
          </span>
        </Link>
        <div className="aero__navlinks">
          <Link href={`${home}#vehicles`}>Vehicles</Link>
          <Link href={`${home}#metrics`}>Flight record</Link>
          <Link href={`${home}#sequence`}>Mission</Link>
          <Link href={`${home}/contact`}>Contact</Link>
        </div>
        <div className="aero__nav-right">
          <span className="aero__status" aria-label="Range status">
            <span className="aero__status-dot" aria-hidden="true" />
            RANGE GREEN
          </span>
          <Link className="aero__btn" href={`${home}/contact`}>
            Mission console <Arrow />
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function AeroFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <footer className="aero__footer">
      <div className="aero__inner">
        <div className="aero__footer-grid">
          <div>
            <div className="aero__brand">
              <BrandMark />
              <span>
                ASTRA<span className="aero__brand-dim">DYNE</span>
              </span>
            </div>
            <p className="aero__footer-blurb">
              A reusable launch system for everything you ship. Designed, built, and flown to come back.
            </p>
            <span className="aero__chip aero__chip--ghost aero__footer-coord">28.5246° N · 80.6080° W · PAD 39</span>
          </div>
          <div>
            <h4>Fleet</h4>
            <ul>
              <li><Link href={`${home}#vehicles`}>Vector</Link></li>
              <li><Link href={`${home}#vehicles`}>Meridian Heavy</Link></li>
              <li><Link href={`${home}#vehicles`}>Halo</Link></li>
            </ul>
          </div>
          <div>
            <h4>Program</h4>
            <ul>
              <li><Link href={`${home}#metrics`}>Flight record</Link></li>
              <li><Link href={`${home}#sequence`}>Mission sequence</Link></li>
              <li><Link href={`${home}/contact`}>Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4>Flight ops</h4>
            <ul>
              <li><Link href={`${home}/contact`}>Talk to flight ops</Link></li>
              <li><Link href={home}>Range status: GREEN</Link></li>
            </ul>
          </div>
        </div>
        <div className="aero__footer-bottom">
          <span>© 2026 ASTRADYNE Launch Systems. Fictional vehicle program.</span>
          <span>NOMINAL · NOMINAL · NOMINAL</span>
        </div>
      </div>
    </footer>
  );
}
