"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDown, Menu, Search, X } from "lucide-react";

import Logo from "@/components/Logo";
import AdminNav from "@/components/admin/AdminNav";
import type { MergedBrand } from "@/lib/brand";
import type { NavContext } from "@/lib/admin/nav";

/**
 * AdminTopBar — Shopify-style sticky top bar: global search (opens the
 * existing ⌘K command palette via a window event), account dropdown, and on
 * mobile a hamburger that opens a slide-in drawer with the full grouped nav.
 *
 * Dropdown + drawer bruger Popover API'et (`popover="auto"` + `popoverTarget`)
 * → top layer, light dismiss and Esc for free, without React state. Positioning is
 * `position: fixed` (the top bar is sticky at the top), so we avoid depending on
 * anchor positioning (not yet baseline). See themes/admin.css.
 */
type Props = {
  storeName: string;
  logo?: MergedBrand["logo"];
  email?: string | null;
  navCtx: NavContext;
};

export default function AdminTopBar({ storeName, logo, email, navCtx }: Props) {
  const initials = (email?.trim()?.[0] ?? "A").toUpperCase();

  function openCommand() {
    window.dispatchEvent(new Event("admin:open-command"));
  }

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 md:px-6"
      style={{
        background: "var(--admin-topbar-bg)",
        borderBottomColor: "var(--admin-topbar-border)",
      }}
    >
      {/* Mobil: hamburger → drawer */}
      <button
        type="button"
        popoverTarget="admin-mobile-nav"
        aria-label="Open menu"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sol-muted transition hover:bg-sol-cream hover:text-sol-ink md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/* Mobile: logo (desktop has it in the sidebar) */}
      <Link href="/admin" className="text-sol-ink md:hidden">
        <Logo storeName={storeName} logo={logo} className="scale-90 origin-left" />
      </Link>

      {/* Global search — opens the ⌘K palette */}
      <button
        type="button"
        onClick={openCommand}
        aria-label="Search (⌘K)"
        className="hidden max-w-md flex-1 items-center gap-2 rounded-lg border border-sol-glass-border-dark bg-sol-cream px-3 py-1.5 text-sm text-sol-muted transition hover:border-sol-accent/40 md:flex"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search products, orders, pages…</span>
        <kbd className="rounded border border-sol-glass-border-dark bg-sol-sand px-1.5 py-0.5 font-mono text-[10px] text-sol-muted">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {/* Mobile search icon */}
        <button
          type="button"
          onClick={openCommand}
          aria-label="Search (⌘K)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sol-muted transition hover:bg-sol-cream hover:text-sol-ink md:hidden"
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>

        {/* NB: ThemeToggle is deliberately removed from admin — the global `.dark`
            class themes the CUSTOMER'S storefront, and admin must never style the
            customer's site. The component lives on in components/ThemeToggle.tsx for
            design packs that later opt into storefront dark (Phase 3). */}

        {/* Konto-menu */}
        <button
          type="button"
          popoverTarget="admin-account-menu"
          aria-label="Account menu"
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-sol-cream"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sol-accent text-xs font-semibold text-white">
            {initials}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-sol-muted md:block" aria-hidden />
        </button>
      </div>

      {/* Konto-dropdown (Popover) */}
      <div id="admin-account-menu" popover="auto" className="admin-popover-menu">
        {email ? (
          <p className="truncate px-3 py-2 text-xs text-sol-muted">{email}</p>
        ) : null}
        <Link
          href="/admin/konto"
          className="block rounded-md px-3 py-2 text-sm text-sol-ink transition hover:bg-sol-cream"
        >
          My account
        </Link>
        <Link
          href="/"
          className="block rounded-md px-3 py-2 text-sm text-sol-ink transition hover:bg-sol-cream"
        >
          View store
        </Link>
        <button
          type="button"
          onClick={() => signOut({ redirectTo: "/" })}
          className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
        >
          Sign out
        </button>
      </div>

      {/* Mobile drawer (Popover) with the full grouped nav */}
      <div id="admin-mobile-nav" popover="auto" className="admin-drawer">
        <div className="flex items-center justify-between border-b border-sol-glass-border-dark px-4 py-3">
          <Link href="/admin" className="text-sol-ink">
            <Logo storeName={storeName} logo={logo} className="scale-90 origin-left" />
          </Link>
          <button
            type="button"
            popoverTarget="admin-mobile-nav"
            popoverTargetAction="hide"
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sol-muted transition hover:bg-sol-cream hover:text-sol-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <AdminNav variant="sidebar" {...navCtx} />
        <div className="border-t border-sol-glass-border-dark px-3 py-3">
          <Link
            href="/admin/konto"
            className="block rounded-lg px-3 py-2 text-sm text-sol-ink transition hover:bg-sol-cream"
          >
            My account
          </Link>
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-sm text-sol-ink transition hover:bg-sol-cream"
          >
            View store
          </Link>
        </div>
      </div>
    </header>
  );
}
