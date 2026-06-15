/**
 * Ember — site-wide chrome (Header + Footer).
 *
 * Replaces the shared store chrome so the warm-glow pack owns its whole frame
 * on EVERY page. Ember runs in BOTH modes ("both"): the base header is a calm
 * paper bar with the EmberSpark mark + brand.storeName in Plus Jakarta Sans,
 * anchor nav + contact and an ink-pill CTA with the warm glow shadow. When the
 * shop is a webshop (brand.features.webshop), the header keeps the storefront
 * navigable — Shop link + cart/account icons — the same contract as
 * designs/apex/chrome.tsx, spoken in Ember's voice.
 *
 * Painted entirely in cw-* palette utilities (applyPaletteAsTheme re-tones the
 * chrome to the shop's palette exactly like the homepage sections). Brand name
 * reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/ember/index.ts).
 */
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import { EmberSpark, EmberDivider } from "./sections/EmberSpark";

const displayChrome = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ember-chrome",
  display: "swap",
  weight: ["600", "700"],
});

export function EmberHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const webshop = brand.features.webshop;
  return (
    <header
      className={`${displayChrome.variable} sticky top-0 z-40 border-b border-cw-ink/10 bg-cw-paper/85 backdrop-blur-md`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link href={home} className="flex items-center gap-2.5 text-cw-ink">
          <EmberSpark className="size-7 shrink-0" />
          <span
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: "var(--font-ember-chrome), ui-sans-serif, sans-serif" }}
          >
            {brand.storeName}
          </span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-cw-stone-600 sm:flex">
          {webshop ? (
            <Link className="transition-colors hover:text-cw-ink" href={`${home}/produkter`}>
              Shop
            </Link>
          ) : null}
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#glow`}>
            The glow
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#inside`}>
            Inside
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {webshop ? (
            <>
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
            </>
          ) : null}
          {/* Primary pill: ink + cream + warm glow (Ember's CTA signature) */}
          <Link
            href={webshop ? `${home}/produkter` : `${home}/contact`}
            className="inline-flex h-9 items-center rounded-full bg-cw-ink px-4 text-sm font-semibold text-cw-paper transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper"
            style={{
              boxShadow:
                "0 6px 20px color-mix(in oklab, var(--color-cw-terracotta) 26%, transparent)",
            }}
          >
            {webshop ? "Shop now" : "Start building"}
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function EmberFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const webshop = brand.features.webshop;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <EmberDivider className="mb-10 text-cw-stone-400" />
        <div className="grid gap-10 sm:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 text-cw-ink">
              <EmberSpark className="size-6 shrink-0" />
              <span className="text-base font-semibold">{brand.storeName}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-cw-stone-500">
              Soft tech, warm bloom — built while the idea is still glowing.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cw-stone-500">
              Explore
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-cw-stone-600">
              {webshop ? (
                <li>
                  <Link className="transition-colors hover:text-cw-ink" href={`${home}/produkter`}>
                    The collection
                  </Link>
                </li>
              ) : null}
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}#glow`}>
                  The glow
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-cw-ink" href={`${home}#inside`}>
                  Inside
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cw-stone-500">
              Support
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-cw-stone-600">
              {webshop ? (
                <>
                  <li>
                    <Link className="transition-colors hover:text-cw-ink" href={`${home}/cart`}>
                      Cart
                    </Link>
                  </li>
                  <li>
                    <Link className="transition-colors hover:text-cw-ink" href={`${home}/account`}>
                      Your account
                    </Link>
                  </li>
                </>
              ) : null}
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
          <span>Lit once, warm ever since.</span>
        </div>
      </div>
    </footer>
  );
}
