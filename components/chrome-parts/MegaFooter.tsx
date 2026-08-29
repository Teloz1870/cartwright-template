/**
 * Mega footer — neutral, design-agnostic chrome part (Mixer 2.0 Phase 1).
 *
 * Four-column link grid (brand blurb · Explore · Information · newsletter
 * slot) over a hairline divider with the © line. Server component,
 * English-first, fully palette-adaptive (cw-* token chains only), so it
 * composes onto every mixable design. The newsletter slot is a plain form
 * against the existing /api/newsletter/subscribe endpoint (same precedent as
 * the atelier/northern-coffee homepage signups). Registered as `mega-footer`
 * in lib/builder/chrome-registry.tsx.
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import Logo from "@/components/Logo";
import type { DesignChromeProps } from "@/designs/types";

export function MegaFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col items-start gap-3">
            <Link href={home} className="text-cw-ink">
              <Logo />
            </Link>
            {brand.website.tagline ? (
              <p className="max-w-xs text-sm leading-relaxed text-cw-stone-500">
                {brand.website.tagline}
              </p>
            ) : null}
          </div>

          {/* Explore */}
          <nav aria-label="Explore" className="flex flex-col gap-2.5 text-sm">
            <h3 className="text-xs font-semibold tracking-[0.14em] text-cw-stone-400 uppercase">
              Explore
            </h3>
            <Link className="text-cw-stone-600 transition-colors hover:text-cw-ink" href={home}>
              Home
            </Link>
            <Link
              className="text-cw-stone-600 transition-colors hover:text-cw-ink"
              href={`${home}/services`}
            >
              Services
            </Link>
            <Link
              className="text-cw-stone-600 transition-colors hover:text-cw-ink"
              href={`${home}/contact`}
            >
              Contact
            </Link>
          </nav>

          {/* Information */}
          <nav aria-label="Information" className="flex flex-col gap-2.5 text-sm">
            <h3 className="text-xs font-semibold tracking-[0.14em] text-cw-stone-400 uppercase">
              Information
            </h3>
            <Link
              className="text-cw-stone-600 transition-colors hover:text-cw-ink"
              href={`${home}/info/faq`}
            >
              FAQ
            </Link>
            <Link
              className="text-cw-stone-600 transition-colors hover:text-cw-ink"
              href={`${home}/info/terms`}
            >
              Terms
            </Link>
            <Link
              className="text-cw-stone-600 transition-colors hover:text-cw-ink"
              href={`${home}/privacy`}
            >
              Privacy
            </Link>
          </nav>

          {/* Newsletter slot */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-[0.14em] text-cw-stone-400 uppercase">
              Stay in the loop
            </h3>
            <p className="text-sm leading-relaxed text-cw-stone-500">
              Occasional news — no noise.
            </p>
            <form
              action="/api/newsletter/subscribe"
              method="post"
              className="flex max-w-xs gap-2"
            >
              <label className="sr-only" htmlFor="mega-footer-email">
                Email address
              </label>
              <input
                id="mega-footer-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-10 min-w-0 flex-1 rounded-full border border-cw-ink/15 bg-cw-paper px-4 text-sm text-cw-ink placeholder:text-cw-stone-400 focus:border-cw-terracotta focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex h-10 shrink-0 items-center rounded-full bg-cw-terracotta px-4 text-sm font-medium text-cw-paper transition-colors hover:bg-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))]"
              >
                Sign up
              </button>
            </form>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 border-t border-cw-ink/10 pt-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs text-cw-stone-500">
            © {year} {brand.storeName}. All rights reserved.
          </p>
          <nav aria-label="Footer" className="flex items-center gap-5 text-xs text-cw-stone-500">
            <Link className="transition-colors hover:text-cw-ink" href={`${home}/privacy`}>
              Privacy
            </Link>
            <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
              Contact
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
