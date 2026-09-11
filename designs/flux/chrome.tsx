/**
 * Flux — site-wide chrome (Shell + Header + Footer).
 *
 * Moves the nav + footer out of the homepage so the Flux look reaches EVERY page
 * (contact, info, …), not just `/`. The Shell applies the `.flux` root class +
 * next/font variables ONCE around all page content, so the locked light theme,
 * the fonts, and the scoped `.flux__*` styles work on any page rendered inside
 * it. Server components, CSS-only — same contract as the homepage.
 *
 * Wired via DesignPack.siteChrome (designs/flux/index.ts). When a design sets
 * siteChrome, app/[locale]/layout.tsx renders the design's chrome instead of the
 * shared Header/Footer and wraps the page in the Shell.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Sora, Inter, JetBrains_Mono } from "next/font/google";
import type { DesignChromeProps } from "../types";
import "./flux.css";

const display = Sora({
  subsets: ["latin"],
  variable: "--font-flux-display",
  display: "swap",
  weight: ["600", "700", "800"],
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-flux-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-flux-mono",
  display: "swap",
  weight: ["400", "500", "700"],
});

const Chevron = () => (
  <span className="flux__chev" aria-hidden="true">
    ›
  </span>
);

const BrandMark = () => (
  <span className="flux__brand-mark" aria-hidden="true">
    F
  </span>
);

/** Wraps all page content: applies the `.flux` theme + fonts once, site-wide. */
export function FluxShell({ children }: { children: ReactNode; locale: string }) {
  return (
    <div className={`flux ${display.variable} ${body.variable} ${mono.variable}`}>
      <div className="flux__wrap">{children}</div>
    </div>
  );
}

export function FluxHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <nav className="flux__nav" aria-label="Primary">
      <div className="flux__inner flux__navbar">
        <Link className="flux__brand" href={home}>
          <BrandMark />
          Flux
        </Link>
        <div className="flux__navlinks">
          <Link href={`${home}#features`}>Products</Link>
          <Link href={`${home}#developers`}>Developers</Link>
          <Link href={`${home}#stats`}>Scale</Link>
          <Link href={`${home}#start`}>Pricing</Link>
        </div>
        <div className="flux__nav-right">
          <Link className="flux__signin" href={`${home}/contact`}>
            Sign in
          </Link>
          <Link className="flux__btn" href={`${home}/contact`}>
            Start now <Chevron />
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function FluxFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <footer className="flux__footer">
      <div className="flux__inner">
        <div className="flux__footer-grid">
          <div>
            <div className="flux__brand">
              <BrandMark />
              Flux
            </div>
            <p style={{ marginBlockStart: "1rem", maxInlineSize: "32ch" }}>
              Payments infrastructure for the internet. One developer-first API for charges, billing, and
              global money movement.
            </p>
          </div>
          <div>
            <h4>Products</h4>
            <ul>
              <li><Link href={`${home}#features`}>Payments</Link></li>
              <li><Link href={`${home}#features`}>Billing</Link></li>
              <li><Link href={`${home}#features`}>Connect</Link></li>
            </ul>
          </div>
          <div>
            <h4>Developers</h4>
            <ul>
              <li><Link href={`${home}#developers`}>API reference</Link></li>
              <li><Link href={`${home}#developers`}>SDKs</Link></li>
              <li><Link href={`${home}#stats`}>Status</Link></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><Link href={`${home}/contact`}>Talk to us</Link></li>
              <li><Link href={home}>flux.dev</Link></li>
            </ul>
          </div>
        </div>
        <div className="flux__footer-bottom">
          <span>© 2026 Flux Payments, Inc.</span>
          <span>Crafted, not templated.</span>
        </div>
      </div>
    </footer>
  );
}
