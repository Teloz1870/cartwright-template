/**
 * Studio — site-wide chrome (Header + Footer).
 *
 * Replaces the shared store chrome so the warm-tech agency look owns its
 * whole frame on EVERY page (contact, info, …), not just the homepage —
 * the same contract as designs/fable/chrome.tsx, spoken in Studio's own
 * language: cw-* utilities (terracotta + oker on paper), Geist type, the
 * quiet bordered sections of the homepage atoms.
 *
 * The mark is Studio's signature motif from the design language
 * (components/svg-items/design-motifs.ts: `bloom-illustration`) — imported
 * directly, since the svg-item already reads the cw-* token chain (and picks
 * up Studio's terracotta/oker via the `--color-cw-terracotta` fallbacks).
 * Brand name reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/studio/index.ts). Nav anchors
 * (#why / #features / #how) are the homepage's story sections.
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import { BloomIllustration } from "@/components/svg-items/BloomIllustration";

export function StudioHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className="sticky top-0 z-40 border-b border-cw-stone-200 bg-cw-paper/85 backdrop-blur-md dark:border-cw-stone-800 dark:bg-cw-ink/85">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link
          href={home}
          className="flex items-center gap-2.5 text-cw-ink dark:text-cw-stone-50"
        >
          <BloomIllustration className="size-8 shrink-0" />
          <span className="text-lg font-semibold tracking-tight">{brand.storeName}</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-cw-stone-600 sm:flex dark:text-cw-stone-400">
          <Link
            className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
            href={`${home}#why`}
          >
            Why us
          </Link>
          <Link
            className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
            href={`${home}#features`}
          >
            Capabilities
          </Link>
          <Link
            className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
            href={`${home}#how`}
          >
            Process
          </Link>
          <Link
            className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
            href={`${home}/contact`}
          >
            Contact
          </Link>
        </div>
        <Link
          href={`${home}/contact`}
          className="inline-flex h-9 items-center rounded-full bg-cw-terracotta px-4 text-sm font-medium text-cw-paper transition-colors hover:bg-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))]"
        >
          Start a project
        </Link>
      </nav>
    </header>
  );
}

export function StudioFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-stone-200 bg-cw-paper dark:border-cw-stone-800 dark:bg-cw-ink">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2.5 text-cw-ink dark:text-cw-stone-50">
            <BloomIllustration className="size-7 shrink-0" />
            <span className="text-base font-medium">{brand.storeName}</span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-cw-stone-500 dark:text-cw-stone-400"
          >
            <Link
              className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
              href={`${home}#why`}
            >
              Why us
            </Link>
            <Link
              className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
              href={`${home}#features`}
            >
              Capabilities
            </Link>
            <Link
              className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
              href={`${home}#how`}
            >
              Process
            </Link>
            <Link
              className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
              href={`${home}/contact`}
            >
              Contact
            </Link>
          </nav>
          <p className="text-xs text-cw-stone-500 dark:text-cw-stone-400">
            © {year} {brand.storeName}. Built with care, shipped with pride.
          </p>
        </div>
      </div>
    </footer>
  );
}
