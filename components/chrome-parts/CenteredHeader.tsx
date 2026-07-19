/**
 * Centered header — neutral, design-agnostic chrome part (Mixer 2.0 Phase 1).
 *
 * Editorial stacked layout: the brand name sits centered ABOVE a centered nav
 * row — the boutique/magazine masthead. Server component, English-first,
 * fully palette-adaptive (cw-* token chains only), so it composes onto every
 * mixable design. Registered as `centered-header` in
 * lib/builder/chrome-registry.tsx; selected via BrandingSettings.chromeJson.
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "@/designs/types";

export function CenteredHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className="sticky top-0 z-40 border-b border-cw-ink/10 bg-cw-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 py-4 sm:px-8">
        <Link
          href={home}
          className="text-xl font-semibold tracking-[0.18em] text-cw-ink uppercase"
        >
          {brand.storeName}
        </Link>
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-center gap-x-7 gap-y-1 text-sm text-cw-stone-600"
        >
          <Link className="transition-colors hover:text-cw-ink" href={home}>
            Home
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/services`}>
            Services
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
          <span aria-hidden="true" className="hidden h-3 w-px bg-cw-ink/15 sm:block" />
          <Link
            href={`${home}/contact`}
            className="font-medium text-cw-terracotta transition-colors hover:text-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))]"
          >
            {brand.website.cta || "Get started"} →
          </Link>
        </nav>
      </div>
    </header>
  );
}
