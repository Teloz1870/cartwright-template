/**
 * Minimal header — neutral, design-agnostic chrome part (Mixer 2.0 Phase 1).
 *
 * Brand mark + name on the left, three quiet links, one pill CTA. Server
 * component, English-first, fully palette-adaptive: ALL paint reads the cw-*
 * token chains (paletteToFullThemeCss re-tones it to any shop palette), so it
 * composes onto every mixable design. Registered as `minimal-header` in
 * lib/builder/chrome-registry.tsx; selected via BrandingSettings.chromeJson.
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import Logo from "@/components/Logo";
import type { DesignChromeProps } from "@/designs/types";

export function MinimalHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className="sticky top-0 z-40 border-b border-cw-ink/10 bg-cw-paper/85 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link href={home} className="flex items-center text-cw-ink">
          <Logo />
        </Link>
        <div className="hidden items-center gap-7 text-sm text-cw-stone-600 sm:flex">
          <Link className="transition-colors hover:text-cw-ink" href={home}>
            Home
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/services`}>
            Services
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
        </div>
        <Link
          href={`${home}/contact`}
          className="inline-flex h-9 items-center rounded-full bg-cw-terracotta px-4 text-sm font-medium text-cw-paper transition-colors hover:bg-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))]"
        >
          {brand.website.cta || "Get started"}
        </Link>
      </nav>
    </header>
  );
}
