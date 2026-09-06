"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/routing";
import { supportsDialog } from "@/lib/features";
import { useFeature } from "@/lib/feature-flags/context";
import { useTranslations } from "next-intl";

import { VISIBLE_MARKETING_PAGES } from "@/components/nav/marketing-pages";
import { profileCapabilities } from "@/lib/profile-capabilities";

type MobileMenuProps = {
  categories: { name: string; slug: string }[];
  navPages?: { slug: string; title: string }[];
  /**
   * The already-resolved "All products" label, handed down by HeaderClient so
   * the drawer and the desktop nav render the SAME string. Reading
   * brand.uiLabels.allProductsLink here instead was the last English leak in
   * the drawer: the desktop half resolves it through the Header namespace
   * (Header.tsx), so the two halves disagreed on a Danish shop.
   */
  allProductsLabel?: string;
  ecommerceEnabled?: boolean;
  industryTemplate?: string;
  /** Dark header chrome (design `chrome: "dark"`): the OPEN trigger sits on the
   *  dark header bar, where sol-ink isn't guaranteed light (locked-dark packs
   *  don't bridge the palette). The drawer PANEL is its own light surface and
   *  keeps its sol-ink styling. Default false = byte-identical light chrome. */
  darkChrome?: boolean;
};

export default function MobileMenu({
  categories,
  navPages = [],
  allProductsLabel,
  ecommerceEnabled = true,
  industryTemplate = "generic",
  darkChrome = false
}: MobileMenuProps) {
  const t = useTranslations("Header");
  const popoverApi = useFeature("popoverApi");
  const [open, setOpen] = useState(false);

  // Phase B4 follow-up: native <dialog> path when both the flag is on
  // and the browser supports it. Otherwise the original class-swap
  // overlay + drawer stays exactly as before. Critically, this is the
  // first MobileMenu version that supports Escape-to-close (the native
  // dialog handles it for free) — pre-B4 had no keyboard close at all.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [useNative, setUseNative] = useState(false);
  useEffect(() => {
    if (popoverApi && supportsDialog()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard: supportsDialog() is browser-only; starts false for SSR parity then flips to native <dialog> after mount.
      setUseNative(true);
    }
  }, [popoverApi]);

  useEffect(() => {
    if (!useNative) return;
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open, useNative]);

  function openMenu() {
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  // Which pages this site HAS — the same predicate HeaderClient's desktop nav
  // uses. Deliberately NOT the chrome hint: `darkChrome` paints the trigger,
  // it does not decide what the navigation contains.
  const marketingNav = !ecommerceEnabled && industryTemplate === "saas";

  const menuContent = (
    <nav className="px-5 py-6" aria-label={t("mobileNav")}>
      <ul className="space-y-1">
        {ecommerceEnabled ? (
          <>
            <li>
              <Link
                href="/produkter"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
              >
                {allProductsLabel ?? t("allProducts")}
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  onClick={closeMenu}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li className="pt-4">
              <Link
                href="/cart"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
              >
                {t("cart")}
              </Link>
            </li>
          </>
        ) : (
          <>
            {marketingNav &&
              VISIBLE_MARKETING_PAGES.map((page) => (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    onClick={closeMenu}
                    className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                  >
                    {page.key ? t(page.key) : page.label}
                  </Link>
                </li>
              ))}
            {navPages.map((page) => (
              <li key={page.slug}>
                <Link
                  href={`/info/${page.slug}`}
                  onClick={closeMenu}
                  className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </>
        )}
        {/* Route existence, not shop mode: the desktop header gates this on
            `ecommerceEnabled` (a website-mode shop hides it by choice), but the
            drawer rendered it unconditionally — so a `--profile site` scaffold,
            where `app/[locale]/account` is removed with the auth module, linked
            a 404 from every phone. A database-backed website keeps the link. */}
        {profileCapabilities.accountAndAdmin && (
          <li className={ecommerceEnabled ? "" : "pt-4"}>
            <Link
              href="/account"
              onClick={closeMenu}
              className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
            >
              {t("account")}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );

  // Hoisted out of BOTH branches: the native <dialog> and the fallback <aside>
  // shipped this row twice, verbatim. A typo in one copy stayed invisible
  // because only the fallback is reachable from renderToStaticMarkup — the
  // native branch is the one that actually runs wherever `popoverApi` is on.
  const closeButton = (
    <button
      type="button"
      onClick={closeMenu}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5"
      aria-label={t("closeMenu")}
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
        aria-hidden="true"
      >
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    </button>
  );

  const drawerHeader = (
    <div className="flex h-16 items-center justify-between border-b border-sol-ink/10 dark:border-white/5 px-5">
      <span className="font-black text-sol-ink">{t("menu")}</span>
      {closeButton}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition md:hidden ${
          darkChrome
            ? "text-white/80 hover:bg-white/10 hover:text-white"
            : "text-sol-ink hover:bg-sol-sun/30"
        }`}
        aria-label={t("openMenu")}
        aria-expanded={open}
        aria-controls="mobile-menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {useNative ? (
        <>
          {/*
            Native <dialog> path. Browser handles focus trap + Escape +
            the ::backdrop pseudo. Slide-in is preserved via the styles
            below: starting translate from 100%, with `display` and
            `overlay` listed in `transition-behavior: allow-discrete` so
            the property change animates across the top-layer toggle.
          */}
          <dialog
            ref={dialogRef}
            id="mobile-menu"
            aria-label={t("mobileNav")}
            onClose={() => setOpen(false)}
            onClick={(e) => {
              if (e.target === dialogRef.current) closeMenu();
            }}
            className="mobile-menu-native ml-auto mr-0 mt-0 mb-auto h-dvh max-h-none w-[min(86vw,22rem)] bg-white p-0 dark:bg-[#0A0A0A] border-l border-l-sol-ink/10 dark:border-l-white/5 shadow-2xl md:hidden backdrop:bg-sol-ink/35 dark:backdrop:bg-black/60"
          >
            {drawerHeader}
            {menuContent}
          </dialog>
          {/* Slide-in animation across the top-layer toggle. Requires
              `@starting-style` + `transition-behavior: allow-discrete`,
              both Baseline 2024+. Falls back to instant present in
              older engines — focus-trap and Escape still work there. */}
          <style jsx>{`
            :global(.mobile-menu-native) {
              translate: 100% 0;
              transition:
                translate 200ms ease-out,
                display 200ms ease-out allow-discrete,
                overlay 200ms ease-out allow-discrete;
            }
            :global(.mobile-menu-native[open]) {
              translate: 0 0;
            }
            @starting-style {
              :global(.mobile-menu-native[open]) {
                translate: 100% 0;
              }
            }
          `}</style>
        </>
      ) : (
        <>
          <div
            className={[
              "fixed inset-0 z-50 bg-sol-ink/35 dark:bg-black/60 transition-opacity duration-200 md:hidden",
              open ? "opacity-100" : "pointer-events-none opacity-0",
            ].join(" ")}
            aria-hidden={!open}
            onClick={closeMenu}
          />

          <aside
            id="mobile-menu"
            className={[
              "fixed right-0 top-0 z-50 h-dvh w-[min(86vw,22rem)] bg-white dark:bg-[#0A0A0A] border-l dark:border-white/5 shadow-2xl transition-transform duration-200 md:hidden",
              open ? "translate-x-0" : "translate-x-full",
            ].join(" ")}
            aria-hidden={!open}
          >
            {drawerHeader}
            {menuContent}
          </aside>
        </>
      )}
    </>
  );
}
