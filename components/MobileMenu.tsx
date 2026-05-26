"use client";

import Link from "next/link";
import { useState } from "react";
import { brand } from "@/brand.config";
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
  const [open, setOpen] = useState(false);

  function closeMenu() {
    setOpen(false);
  }

  const isSaas = !ecommerceEnabled && industryTemplate === "saas";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
        </div>

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
                      href={`/kategori/${category.slug}`}
                      onClick={closeMenu}
                      className="block rounded-lg px-3 py-3 text-base font-medium text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
                <li className="pt-4">
                  <Link
                    href="/kurv"
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
                href="/konto"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand dark:hover:bg-white/5 hover:text-sol-accent"
              >
                Account
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
    </>
  );
}
