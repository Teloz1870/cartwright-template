/**
 * Apex — site-wide chrome (Header + Footer).
 *
 * Replaces the shared store chrome so the flagship webshop owns its whole
 * frame on EVERY page (PLP, PDP, cart, account, contact, …), not just the
 * homepage. Because Apex is a WEBSHOP design, the header keeps the storefront
 * navigable: shop link, cart + account icons and a "Shop now" CTA — the same
 * contract as designs/halo/chrome.tsx, spoken in Apex's own language (cw-*
 * palette utilities + Geist, so applyPaletteAsTheme re-tones the chrome to
 * the shop's palette exactly like the homepage sections).
 *
 * The mark is Apex's signature motif from the design language
 * (components/svg-items/design-motifs.ts: `orbit-mark`) — imported directly,
 * since the svg-item already reads the cw-* token chain Apex runs on.
 * Brand name reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/apex/index.ts).
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import { OrbitMark } from "@/components/svg-items/OrbitMark";

export function ApexHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className="sticky top-0 z-40 border-b border-cw-ink/10 bg-cw-paper/85 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link href={home} className="flex items-center gap-2.5 text-cw-ink">
          <OrbitMark className="size-8 shrink-0" />
          <span className="text-lg font-semibold tracking-tight">{brand.storeName}</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-cw-stone-600 sm:flex">
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/produkter`}>
            Shop
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#configure`}>
            Configure
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#story`}>
            The story
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`${home}/account`}
            aria-label="Account"
            className="text-cw-stone-600 transition-colors hover:text-cw-ink"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="5.6" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M2.8 15.2c.7-3 3.2-4.6 6.2-4.6s5.5 1.6 6.2 4.6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </Link>
          <Link
            href={`${home}/cart`}
            aria-label="Cart"
            className="text-cw-stone-600 transition-colors hover:text-cw-ink"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 2.6h2l1.4 8.2a1.4 1.4 0 0 0 1.38 1.16h6.04a1.4 1.4 0 0 0 1.37-1.1L15.4 5H5.1"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="7.2" cy="15" r="1.05" fill="currentColor" />
              <circle cx="13" cy="15" r="1.05" fill="currentColor" />
            </svg>
          </Link>
          <Link
            href={`${home}/produkter`}
            className="inline-flex h-9 items-center rounded-full bg-cw-terracotta px-4 text-sm font-medium text-cw-paper transition-colors hover:bg-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))]"
          >
            Shop now
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function ApexFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 text-cw-ink">
              <OrbitMark className="size-7 shrink-0" />
              <span className="text-base font-medium">{brand.storeName}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-cw-stone-500">
              One product, made without compromise — built only when you buy it.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cw-stone-500">
              Shop
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-cw-stone-600">
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}/produkter`}>
                  The collection
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}#configure`}>
                  Build your own
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}/cart`}>
                  Cart
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cw-stone-500">
              Discover
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-cw-stone-600">
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}#story`}>
                  The story
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}#configure`}>
                  In the showroom
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cw-stone-500">
              Support
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-cw-stone-600">
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}/account`}>
                  Your account
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-cw-ink/10 pt-6 text-xs text-cw-stone-500 sm:flex-row">
          <span>
            © {year} {brand.storeName}. All rights reserved.
          </span>
          <span>Designed to be the last one you buy.</span>
        </div>
      </div>
    </footer>
  );
}
