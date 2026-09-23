/**
 * Halo — site-wide chrome (Shell + Header + Footer).
 *
 * Moves the nav + footer out of the homepage so the Halo look reaches EVERY page
 * (contact, info, cart, account, …), not just `/`. The Shell applies the `.halo`
 * root class + next/font variables ONCE around all page content, so the locked
 * light theme, the fonts, and the scoped `.halo__*` styles work on any page
 * rendered inside it. Server components, CSS-only — same contract as the homepage.
 *
 * Halo is a WEBSHOP-mode design, so this Header replaces the shared e-commerce
 * header: it keeps the clean, Apple-like minimal nav style while adding the
 * product nav + cart + account links so the storefront stays navigable.
 *
 * Wired via DesignPack.siteChrome (designs/halo/index.ts). When a design sets
 * siteChrome, app/[locale]/layout.tsx renders the design's chrome instead of the
 * shared Header/Footer and wraps the page in the Shell.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Manrope, Inter } from "next/font/google";
import type { DesignChromeProps } from "../types";
import "./halo.css";

const display = Manrope({
  subsets: ["latin"],
  variable: "--font-halo-display",
  display: "swap",
  weight: ["600", "700", "800"],
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-halo-body",
  display: "swap",
});

/** Wraps all page content: applies the `.halo` theme + fonts once, site-wide. */
export function HaloShell({ children }: { children: ReactNode; locale: string }) {
  return (
    <div className={`halo ${display.variable} ${body.variable}`}>
      <div className="halo__wrap">{children}</div>
    </div>
  );
}

export function HaloHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <nav className="halo__nav" aria-label="Primary">
      <div className="halo__inner halo__navbar">
        <Link className="halo__brand" href={home}>
          <span className="halo__brand-mark" aria-hidden="true" />
          Halo
        </Link>
        <div className="halo__navlinks">
          <Link href={`${home}#overview`}>Overview</Link>
          <Link href={`${home}#display`}>Display</Link>
          <Link href={`${home}#specs`}>Tech Specs</Link>
          <Link href={`${home}/produkter`}>Shop</Link>
          <Link href={`${home}/contact`}>Contact</Link>
        </div>
        <div className="halo__nav-right">
          <Link className="halo__nav-icon" href={`${home}/account`} aria-label="Account">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="5.6" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2.8 15.2c.7-3 3.2-4.6 6.2-4.6s5.5 1.6 6.2 4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </Link>
          <Link className="halo__nav-icon" href={`${home}/cart`} aria-label="Cart">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 2.6h2l1.4 8.2a1.4 1.4 0 0 0 1.38 1.16h6.04a1.4 1.4 0 0 0 1.37-1.1L15.4 5H5.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="7.2" cy="15" r="1.05" fill="currentColor" />
              <circle cx="13" cy="15" r="1.05" fill="currentColor" />
            </svg>
          </Link>
          <Link className="halo__pill-btn" href={`${home}/produkter`}>Buy</Link>
        </div>
      </div>
    </nav>
  );
}

export function HaloFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <footer className="halo__footer">
      <div className="halo__inner">
        <div className="halo__footer-grid">
          <div>
            <h4>Shop</h4>
            <ul>
              <li><Link href={`${home}/produkter`}>Halo Pro</Link></li>
              <li><Link href={`${home}#specs`}>Tech Specs</Link></li>
              <li><Link href={`${home}/produkter`}>Financing</Link></li>
              <li><Link href={`${home}/produkter`}>Trade In</Link></li>
            </ul>
          </div>
          <div>
            <h4>Discover</h4>
            <ul>
              <li><Link href={`${home}#overview`}>Overview</Link></li>
              <li><Link href={`${home}#display`}>Display</Link></li>
              <li><Link href={`${home}/produkter`}>Accessories</Link></li>
            </ul>
          </div>
          <div>
            <h4>Support</h4>
            <ul>
              <li><Link href={`${home}/account`}>Help Center</Link></li>
              <li><Link href={`${home}/account`}>Warranty</Link></li>
              <li><Link href={`${home}/contact`}>Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link href={`${home}/contact`}>About</Link></li>
              <li><Link href={`${home}/contact`}>Sustainability</Link></li>
              <li><Link href={`${home}/contact`}>Newsroom</Link></li>
            </ul>
          </div>
        </div>
        <div className="halo__footer-bottom">
          <span>© 2026 Halo. All rights reserved.</span>
          <span>Designed for the people who notice.</span>
        </div>
      </div>
    </footer>
  );
}
