"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/brand.config";
import { supportsDialog } from "@/lib/features";
import { useFeature } from "@/lib/feature-flags/context";
import { useTranslations } from "next-intl";

type MobileMenuProps = {
  categories: { name: string; slug: string }[];
  navPages?: { slug: string; title: string }[];
  ecommerceEnabled?: boolean;
  industryTemplate?: string;
};

export default function MobileMenu({
  categories,
  navPages = [],
  ecommerceEnabled = true,
  industryTemplate = "generic"
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

  const isSaas = !ecommerceEnabled && industryTemplate === "saas";

  const menuContent = (
    <nav className="px-5 py-6" aria-label="Mobile navigation">
      <ul className="space-y-1">
        {ecommerceEnabled ? (
          <>
            <li>
              <Link
                href="/produkter"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
              >
                {brand.uiLabels.allProductsLink}
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
                Cart
              </Link>
            </li>
          </>
        ) : (
          <>
            {isSaas && (
              <>
                <li>
                  <Link
                    href="/services"
                    onClick={closeMenu}
                    className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                  >
                    {t("services")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cases"
                    onClick={closeMenu}
                    className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                  >
                    {t("cases")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/priser"
                    onClick={closeMenu}
                    className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                  >
                    {t("pricing")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cartwright"
                    onClick={closeMenu}
                    className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                  >
                    Cartwright
                  </Link>
                </li>
              </>
            )}
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
        <li className={ecommerceEnabled ? "" : "pt-4"}>
          <Link
            href="/account"
            onClick={closeMenu}
            className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
          >
            Account
          </Link>
        </li>
      </ul>
    </nav>
  );

  const closeButton = (
    <button
      type="button"
      onClick={closeMenu}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5"
      aria-label="Close menu"
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

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sol-ink transition hover:bg-sol-sun/30 md:hidden"
        aria-label="Open menu"
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
            aria-label="Mobile navigation"
            onClose={() => setOpen(false)}
            onClick={(e) => {
              if (e.target === dialogRef.current) closeMenu();
            }}
            className="mobile-menu-native ml-auto mr-0 mt-0 mb-auto h-dvh max-h-none w-[min(86vw,22rem)] bg-white p-0 dark:bg-[#0A0A0A] border-l border-l-sol-ink/10 dark:border-l-white/5 shadow-2xl md:hidden backdrop:bg-sol-ink/35 dark:backdrop:bg-black/60"
          >
            <div className="flex h-16 items-center justify-between border-b border-sol-ink/10 dark:border-white/5 px-5">
              <span className="font-black text-sol-ink">Menu</span>
              {closeButton}
            </div>
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
            <div className="flex h-16 items-center justify-between border-b border-sol-ink/10 dark:border-white/5 px-5">
              <span className="font-black text-sol-ink">Menu</span>
              {closeButton}
            </div>
            {menuContent}
          </aside>
        </>
      )}
    </>
  );
}
