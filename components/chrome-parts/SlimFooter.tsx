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
import { getTranslations } from "next-intl/server";
import { brand } from "@/brand.config";
import { profileCapabilities } from "@/lib/profile-capabilities";
import type { DesignChromeProps } from "@/designs/types";

/**
 * `/privacy` belongs to the `trust-pages` module: a `site` scaffold only has it
 * with `--with trust-pages`, and this chrome part ships in every profile.
 * `Boolean(...)`, never `=== true` — the static twin is `as const` false, so an
 * equality comparison is TS2367 in a materialised scaffold (#550/#551/#572).
 * True in the engine, so the canaries render byte-identically.
 */
const trustPages = Boolean(profileCapabilities.trustPages);

export async function SlimFooter({ locale }: DesignChromeProps) {
  // Chrome parts render on any shop that selects them, so their a11y labels
  // follow the page locale. Routed through messages/{da,en}.json rather than
  // an inline dictionary — the second translation system that
  // design-copy-language.test.ts warns about is invisible to
  // /admin/translations and to anyone adding a third locale.
  const t = await getTranslations("Chrome");
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 py-6 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
        <p className="text-xs text-cw-stone-500">
          © {year} {brand.storeName}. All rights reserved.
        </p>
        <nav
          aria-label={t("navFooter")}
          className="flex flex-wrap items-center justify-center gap-5 text-xs text-cw-stone-500"
        >
          <Link className="transition-colors hover:text-cw-ink" href={home}>
            Home
          </Link>
          {trustPages && (
            <Link className="transition-colors hover:text-cw-ink" href={`${home}/privacy`}>
              Privacy
            </Link>
          )}
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
