"use client";

import Link from "next/link";
import { useState } from "react";
import { brand } from "@/brand.config";

type MobileMenuProps = {
  categories: { name: string; slug: string }[];
};

export default function MobileMenu({ categories }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sol-ink transition hover:bg-sol-sun/30 md:hidden"
        aria-label="Åbn menu"
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
          "fixed inset-0 z-50 bg-sol-ink/35 transition-opacity duration-200 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        aria-hidden={!open}
        onClick={closeMenu}
      />

      <aside
        id="mobile-menu"
        className={[
          "fixed right-0 top-0 z-50 h-dvh w-[min(86vw,22rem)] bg-white shadow-2xl transition-transform duration-200 md:hidden",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex h-16 items-center justify-between border-b border-sol-ink/10 px-5">
          <span className="font-black text-sol-ink">Menu</span>
          <button
            type="button"
            onClick={closeMenu}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sol-ink transition hover:bg-sol-sand"
            aria-label="Luk menu"
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

        <nav className="px-5 py-6" aria-label="Mobil navigation">
          <ul className="space-y-1">
            <li>
              <Link
                href="/produkter"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand hover:text-sol-accent"
              >
                {brand.uiLabels.allProductsLink}
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/kategori/${category.slug}`}
                  onClick={closeMenu}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-sol-ink transition hover:bg-sol-sand hover:text-sol-accent"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li className="pt-4">
              <Link
                href="/konto"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand hover:text-sol-accent"
              >
                Konto
              </Link>
            </li>
            <li>
              <Link
                href="/kurv"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-bold text-sol-ink transition hover:bg-sol-sand hover:text-sol-accent"
              >
                Kurv
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
    </>
  );
}
