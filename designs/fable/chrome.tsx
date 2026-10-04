/**
 * Fable — site-wide chrome (Header + Footer).
 *
 * Replaces the shared store chrome so the flagship owns its whole frame: a
 * minimal ivory header with the butterfly mark + the brand name in Fraunces,
 * and a calm, English-first footer. Reads brand.storeName so every install
 * shows its own identity — in Fable's voice, not the shared webshop nav.
 * Wired via DesignPack.siteChrome (designs/fable/index.ts): when set,
 * app/[locale]/layout.tsx renders this instead of the shared Header/Footer.
 */
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import { FableButterfly, FableDivider } from "./sections/FableButterfly";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fable-chrome",
  display: "swap",
  weight: ["400", "600"],
});

export function FableHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header
      className={`${fraunces.variable} sticky top-0 z-40 border-b border-cw-ink/10 bg-cw-paper/85 backdrop-blur-md`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link href={home} className="flex items-center gap-2.5 text-cw-ink">
          <FableButterfly className="size-7 shrink-0" />
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-fable-chrome), Georgia, serif" }}
          >
            {brand.storeName}
          </span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-cw-stone-600 sm:flex">
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#metamorphosis`}>
            The story
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#numbers`}>
            Numbers
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
        </div>
        <Link
          href={`${home}/contact`}
          className="inline-flex h-9 items-center rounded-full bg-cw-terracotta px-4 text-sm font-medium text-cw-paper transition-colors hover:bg-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))]"
        >
          Get started
        </Link>
      </nav>
    </header>
  );
}

export function FableFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <FableDivider className="mb-10 text-cw-stone-400" />
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2.5 text-cw-ink">
            <FableButterfly className="size-6 shrink-0" />
            <span className="text-base font-medium">{brand.storeName}</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-6 text-sm text-cw-stone-500">
            <Link className="transition-colors hover:text-cw-ink" href={`${home}#metamorphosis`}>
              The story
            </Link>
            <Link className="transition-colors hover:text-cw-ink" href={`${home}#numbers`}>
              Numbers
            </Link>
            <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
              Contact
            </Link>
          </nav>
          <p className="text-xs text-cw-stone-500">
            © {year} {brand.storeName}. Every journey starts folded up in the dark.
          </p>
        </div>
      </div>
    </footer>
  );
}
