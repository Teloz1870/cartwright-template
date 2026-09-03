"use client";

import { useEffect, useState } from "react";
import type { MergedBrand } from "@/lib/brand";
import { Link } from "@/i18n/routing";
import Logo from "@/components/Logo";
import { CartwrightLogo } from "@/components/CartwrightLogo";
import SearchBox from "@/components/SearchBox";
import MobileMenu from "@/components/MobileMenu";
import NavLink from "@/components/NavLink";
import { MARKETING_PAGES } from "@/components/nav/marketing-pages";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CurrencySwitcher from "@/components/CurrencySwitcher";
import { useTranslations } from "next-intl";

type Category = { id: string; slug: string; name: string };
type NavPage = { slug: string; title: string };

type Props = {
  categories: Category[];
  navPages?: NavPage[];
  cartCount: number;
  signedIn: boolean;
  /** True når current bruger har role="admin" — vis admin-shortcut-pill */
  isAdmin?: boolean;
  /** UL8.1: brand-værdier passet ind fra server (Header.tsx getBrand()) */
  storeName: string;
  allProductsLabel: string;
  ecommerceEnabled?: boolean;
  /** First-run: lead the header with the Cartwright wordmark until the owner brands the site. */
  firstRunBrand?: boolean;
  industryTemplate?: string;
  /** Dark-chrome flag resolved server-side from the active design's `chrome` hint. */
  darkChrome?: boolean;
  logo?: MergedBrand["logo"];
};

/**
 * Phase 7 Task A — client-wrapper for Header. RSC-data hentes i Header.tsx
 * og sendes som props; vi laver KUN scroll-state-tracking + className-morph
 * her, så vi ikke flytter Prisma/auth-calls til klienten.
 *
 * Pre-scroll (top 40px): bg-white/95 + subtle backdrop-blur — ren minimal look
 * Scrolled (>40px): bg-sol-cream/75 + backdrop-blur-xl + soft-shadow + sol-glass-border
 *
 * Threshold på 40px er valgt så scrollet ikke "blinker" ved overscroll-bounce.
 * Listener er passive for at undgå at blokere scroll-thread.
 */
export default function HeaderClient({
  categories,
  navPages = [],
  cartCount,
  signedIn,
  isAdmin = false,
  storeName,
  allProductsLabel,
  ecommerceEnabled = true,
  firstRunBrand = false,
  industryTemplate = "generic",
  darkChrome,
  logo,
}: Props) {
  const t = useTranslations("Header");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // rAF-throttle anbefalet af Gemini-review: forhindrer at setScrolled
    // ryger ind i Reacts render-kø for hvert scroll-event under hurtigt scroll.
    // React 18-batching afbøder meget, men rAF garanterer at vi kun reagerer
    // ~60Hz uafhængigt af scroll-event-frequency.
    let frame = 0;
    function update() {
      setScrolled(window.scrollY > 40);
      frame = 0;
    }
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }
    // Sæt initial-state hvis siden loades scrolled (browser-restoration)
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Dark chrome follows the active design's hint (passed from the server). Fall
  // back to the old saas heuristic only when the prop is absent (older callers).
  // This is PAINT ONLY. It used to be called `isSaas` and also decided which
  // pages the website-mode nav links to — so when the Aurora default flipped
  // the hint to light, the desktop nav silently dropped every marketing link
  // while the drawer (still on the old heuristic) kept rendering them.
  const darkUi = darkChrome ?? (!ecommerceEnabled && industryTemplate === "saas");

  // CONTENT: which pages this site HAS. Same predicate MobileMenu uses, so the
  // two halves of one navigation can no longer disagree.
  const marketingNav = !ecommerceEnabled && industryTemplate === "saas";

  // Light Mode (Standard Storefront / Generic Website)
  //
  // Phase F1 hotfix (2026-05-28): non-scrolled state now uses theme token
  // (bg-sol-cream/95) instead of hardcoded bg-white/95. Each canary's
  // theme CSS overrides --color-sol-cream to its branded warm-neutral.
  // Previously every canary rendered an identical pure-white header at
  // top of page regardless of brand.
  let headerClasses = scrolled
    ? "sticky top-0 z-40 border-b border-sol-glass-border-dark bg-sol-cream/75 backdrop-blur-xl backdrop-saturate-150 shadow-[var(--shadow-sol-soft)] transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300"
    : "sticky top-0 z-40 border-b border-sol-ink/10 bg-sol-cream/95 backdrop-blur-sm transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300";

  // Dark Mode (SaaS Template)
  if (darkUi) {
    headerClasses = scrolled
      ? "fixed w-full top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl backdrop-saturate-150 shadow-2xl transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300 text-white"
      : "fixed w-full top-0 z-50 border-b border-white/5 bg-black/30 backdrop-blur-md transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300 text-white";
  }

  return (
    <header data-site-header className={headerClasses}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className={`shrink-0 transition-colors ${darkUi ? "text-white hover:text-white/80" : "text-sol-ink hover:text-sol-accent"}`}
            aria-label={firstRunBrand || storeName === "Cartwright" ? "Cartwright" : t("homeAria", { store: storeName })}
          >
            {/* The Cartwright wordmark leads on first-run AND on Cartwright's own
                identity (storeName === "Cartwright"). A scaffolded customer's
                storeName is patched by create-cartwright, so the wordmark never
                stands in for their brand — they get their own Logo mark + name. */}
            {firstRunBrand || storeName === "Cartwright" ? (
              <CartwrightLogo className="text-[1.6rem]" />
            ) : (
              <Logo storeName={storeName} logo={logo} />
            )}
          </Link>

          {/* First run: hide the page/category nav — those point to seeded
              placeholder pages and are premature on a brand-new site. Returns
              once the owner brands the site (firstRunBrand goes false). */}
          {!firstRunBrand && (ecommerceEnabled ? (
            <nav
              className="hidden flex-1 items-center justify-center gap-6 md:flex lg:gap-8"
              aria-label={t("categories")}
            >
              {/* Dark chrome: NavLink's inactive text is sol-ink, which a
                  locked-dark pack (crema) does NOT bridge — the shop palette
                  can stay light, so the ink lands dark-on-dark. Same explicit
                  white-span convention as the website-mode nav below. */}
              <NavLink href="/produkter">
                <span className={darkUi ? "text-white/70 hover:text-white" : ""}>
                  {allProductsLabel}
                </span>
              </NavLink>
              {categories.map((cat) => (
                <NavLink key={cat.id} href={`/category/${cat.slug}`}>
                  <span className={darkUi ? "text-white/70 hover:text-white" : ""}>
                    {cat.name}
                  </span>
                </NavLink>
              ))}
            </nav>
          ) : (
            <nav
              className="hidden flex-1 items-center justify-center gap-6 md:flex lg:gap-8"
              aria-label={t("pages")}
            >
              {marketingNav &&
                MARKETING_PAGES.map((page) => (
                  <NavLink key={page.href} href={page.href}>
                    <span className={darkUi ? "text-white/70 hover:text-white" : ""}>
                      {page.key ? t(page.key) : page.label}
                    </span>
                  </NavLink>
                ))}
              {navPages.map((page) => (
                <NavLink key={page.slug} href={`/info/${page.slug}`}>
                  <span className={darkUi ? "text-white/70 hover:text-white" : ""}>
                    {page.title}
                  </span>
                </NavLink>
              ))}
            </nav>
          ))}

          <div className="flex shrink-0 items-center gap-2">
            {ecommerceEnabled && (
              <div className="hidden lg:block">
                <SearchBox />
              </div>
            )}

            {!firstRunBrand && <LanguageSwitcher />}

            {ecommerceEnabled && (
              <Link
                href="/cart"
                aria-label={t("cartAria", { count: cartCount })}
                className={`relative rounded-full p-2 transition-colors ${
                  darkUi
                    ? "text-white/80 hover:bg-white/10 hover:text-white"
                    : "text-sol-ink hover:bg-sol-sun/30 hover:text-sol-accent"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                {cartCount > 0 ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sol-accent px-1 text-[10px] font-black leading-none text-white"
                    aria-hidden="true"
                  >
                    {cartCount}
                  </span>
                ) : null}
              </Link>
            )}

            {/* Admin-shortcut: synlig pill når admin er logget ind. Kunde-
                brugere ser den ikke. Skjult på mobil (md+) — admin bruger
                konto-link → /konto → admin-button på mobil. */}
            {isAdmin && !firstRunBrand && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- hard nav across the storefront→admin boundary (next-intl soft-nav loops on /admin)
              <a
                href="/admin"
                aria-label={t("adminDashboard")}
                className="group/admin hidden items-center gap-1.5 rounded-full bg-sol-ink/90 px-3.5 py-[7px] text-[13px] font-semibold tracking-tight text-white shadow-sm ring-1 ring-inset ring-white/15 backdrop-blur transition duration-200 hover:-translate-y-px hover:bg-sol-ink hover:shadow-md md:inline-flex"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-3.5 opacity-90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="2.2" y="3" width="11.6" height="10" rx="2.4" />
                  <path d="M6.5 3.3v9.4" />
                </svg>
                Admin
                <span
                  aria-hidden
                  className="-ml-0.5 translate-x-0 opacity-0 transition-all duration-200 group-hover/admin:translate-x-0.5 group-hover/admin:opacity-100"
                >
                  →
                </span>
              </a>
            )}

            {/* Currency switcher — kun synlig hvis brand.features.currencySwitcher=true
                + ≥ 2 currencies i supportedCurrencies. Komponenten gater sig selv. */}
            {ecommerceEnabled && <CurrencySwitcher />}

            {/* Only show account link if ecommerceEnabled is true */}
            {ecommerceEnabled && (
              <Link
                href={signedIn ? "/account" : "/account/login"}
                aria-label={signedIn ? t("myAccount") : t("logIn")}
                className={`rounded-full p-2 transition-colors ${
                  darkUi
                    ? "text-white/80 hover:bg-white/10 hover:text-white"
                    : "text-sol-ink hover:bg-sol-sun/30 hover:text-sol-accent"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </Link>
            )}

            <MobileMenu
              categories={ecommerceEnabled ? categories : []}
              navPages={navPages}
              allProductsLabel={allProductsLabel}
              ecommerceEnabled={ecommerceEnabled}
              industryTemplate={industryTemplate}
              darkChrome={darkUi}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
