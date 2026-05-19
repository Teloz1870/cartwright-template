"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import SearchBox from "@/components/SearchBox";
import MobileMenu from "@/components/MobileMenu";
import NavLink from "@/components/NavLink";

type Category = { id: string; slug: string; name: string };

type Props = {
  categories: Category[];
  cartCount: number;
  signedIn: boolean;
  /** True når current bruger har role="admin" — vis admin-shortcut-pill */
  isAdmin?: boolean;
  /** UL8.1: brand-værdier passet ind fra server (Header.tsx getBrand()) */
  storeName: string;
  allProductsLabel: string;
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
  cartCount,
  signedIn,
  isAdmin = false,
  storeName,
  allProductsLabel,
}: Props) {
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

  const headerClasses = scrolled
    ? "sticky top-0 z-40 border-b border-sol-glass-border-dark bg-sol-cream/75 backdrop-blur-xl backdrop-saturate-150 shadow-[var(--shadow-sol-soft)] transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300"
    : "sticky top-0 z-40 border-b border-sol-ink/10 bg-white/95 backdrop-blur-sm transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300";

  return (
    <header className={headerClasses}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="shrink-0 text-sol-ink transition-colors hover:text-sol-accent"
            aria-label={`${storeName} forside`}
          >
            <Logo />
          </Link>

          <nav
            className="hidden flex-1 items-center justify-center gap-6 md:flex lg:gap-8"
            aria-label="Kategorier"
          >
            <NavLink href="/produkter">{allProductsLabel}</NavLink>
            {categories.map((cat) => (
              <NavLink key={cat.id} href={`/kategori/${cat.slug}`}>
                {cat.name}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden lg:block">
              <SearchBox />
            </div>

            <Link
              href="/kurv"
              aria-label={`Indkøbskurv (${cartCount} varer)`}
              className="relative rounded-full p-2 text-sol-ink transition-colors hover:bg-sol-sun/30 hover:text-sol-accent"
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

            {/* Admin-shortcut: synlig pill når admin er logget ind. Kunde-
                brugere ser den ikke. Skjult på mobil (md+) — admin bruger
                konto-link → /konto → admin-button på mobil. */}
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden items-center gap-1 rounded-full bg-sol-ink px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-sol-accent md:inline-flex"
              >
                🔐 Admin
              </Link>
            )}

            <Link
              href={signedIn ? "/konto" : "/konto/login"}
              aria-label={signedIn ? "Min konto" : "Log ind"}
              className="rounded-full p-2 text-sol-ink transition-colors hover:bg-sol-sun/30 hover:text-sol-accent"
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

            <MobileMenu categories={categories} />
          </div>
        </div>
      </div>
    </header>
  );
}
