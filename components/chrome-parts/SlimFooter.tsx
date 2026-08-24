/**
 * Slim footer — neutral, design-agnostic chrome part (Mixer 2.0 Phase 1).
 *
 * One quiet line: © + brand name on the left, three links on the right.
 * Server component, English-first, fully palette-adaptive (cw-* token chains
 * only), so it composes onto every mixable design. Registered as
 * `slim-footer` in lib/builder/chrome-registry.tsx; selected via
 * BrandingSettings.chromeJson.
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "@/designs/types";

export function SlimFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 py-6 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
        <p className="text-xs text-cw-stone-500">
          © {year} {brand.storeName}. All rights reserved.
        </p>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-5 text-xs text-cw-stone-500"
        >
          <Link className="transition-colors hover:text-cw-ink" href={home}>
            Home
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/privacy`}>
            Privacy
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
