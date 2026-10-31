/**
 * Jungle — site-wide chrome (Header + Footer).
 *
 * Replaces the shared store chrome so the friendly organic look owns its
 * whole frame on EVERY page (contact, info, …), not just the homepage — the
 * same contract as designs/fable/chrome.tsx, spoken in Jungle's own language:
 * cw-* utilities on the palette-adaptive chain (the lush green default, or
 * whatever palette a Voice/theme sets), Geist type, soft rounded shapes.
 *
 * The mark derives from Jungle's signature motif in the design language
 * (components/svg-items/design-motifs.ts: `vine-divider`): the footer lays
 * the full VineDivider rule across the page, and the header mark is a compact
 * sprig composed from the SAME vine vocabulary (almond leaf + bud + five-petal
 * bloom), re-rendered on the identical cw-* token chain. Brand name reads
 * brand.storeName so every install shows its own identity. Wired via
 * DesignPack.siteChrome (designs/jungle/index.ts). Nav anchors
 * (#values / #features) are the homepage's story sections.
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import { VineDivider } from "@/components/svg-items/VineDivider";

/* The same palette roles the vine-divider reads — cw-* with the engine
 * fallback chain, so the sprig re-tones with the shop exactly like the page. */
const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const OKER_DEEP = "var(--color-cw-gold-deep, var(--color-cw-oker-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/**
 * A compact sprig in the vine-divider's vocabulary: one curving stem carrying
 * two almond leaves (one warm), a closed bud, and the five-petal centre bloom
 * at the tip. Square mark for the header/footer brand row.
 */
function JungleSprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* The stem — one breathing curve from root to bloom */}
      <path
        d="M6 28 C 10 24, 12 19, 14 14.5 C 15.5 11, 17.5 8.5, 20.5 7"
        fill="none"
        stroke={INK}
        strokeOpacity="0.55"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* Lower leaf — accent green, vein in cream */}
      <g transform="translate(10.5 22.5) rotate(-130)">
        <path
          d="M0 0 C 2.5 -5, 7.5 -8.5, 13 -8 C 11 -3.5, 6 -0.5, 0 0 Z"
          fill={ACCENT}
          fillOpacity="0.8"
          stroke={ACCENT_DEEP}
          strokeOpacity="0.5"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        <path
          d="M1.5 -1 C 5 -3.2, 8.5 -5.2, 11.8 -7"
          fill="none"
          stroke={CREAM}
          strokeOpacity="0.55"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
      </g>
      {/* Upper leaf — warm, flipped to the other side */}
      <g transform="translate(14.5 13.5) rotate(10)">
        <path
          d="M0 0 C 2.5 -5, 7.5 -8.5, 13 -8 C 11 -3.5, 6 -0.5, 0 0 Z"
          fill={OKER}
          fillOpacity="0.7"
          stroke={OKER_DEEP}
          strokeOpacity="0.5"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        <path
          d="M1.5 -1 C 5 -3.2, 8.5 -5.2, 11.8 -7"
          fill="none"
          stroke={CREAM}
          strokeOpacity="0.55"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
      </g>
      {/* A closed bud on a short stalk off the stem */}
      <g transform="translate(9 16) rotate(-30)">
        <path d="M0 0 L0 -4" stroke={MUTED} strokeOpacity="0.7" strokeWidth="0.75" strokeLinecap="round" />
        <circle cx="0" cy="-5.6" r="1.9" fill={ACCENT_DEEP} fillOpacity="0.85" />
        <circle cx="-0.5" cy="-6.1" r="0.6" fill={CREAM} fillOpacity="0.7" />
      </g>
      {/* The bloom at the tip — five petals around a warm heart */}
      <g transform="translate(23.5 6.5)">
        <g fill={ACCENT} fillOpacity="0.85" stroke={ACCENT_DEEP} strokeOpacity="0.4" strokeWidth="0.75">
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(72)" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(144)" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(216)" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(288)" />
        </g>
        <circle r="2" fill={OKER} />
        <circle r="0.8" fill={OKER_DEEP} />
        <circle cx="-0.6" cy="-0.6" r="0.4" fill={CREAM} fillOpacity="0.9" />
      </g>
      {/* Pollen drifting off the bloom */}
      <circle cx="28.5" cy="11" r="0.7" fill={OKER} fillOpacity="0.5" />
      <circle cx="18.5" cy="3.5" r="0.6" fill={ACCENT} fillOpacity="0.45" />
    </svg>
  );
}

export function JungleHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className="sticky top-0 z-40 border-b border-cw-ink/10 bg-cw-paper/85 backdrop-blur-md dark:border-cw-stone-800 dark:bg-cw-ink/85">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link
          href={home}
          className="flex items-center gap-2.5 text-cw-ink dark:text-cw-stone-50"
        >
          <JungleSprig className="size-8 shrink-0" />
          <span className="text-lg font-semibold tracking-tight">{brand.storeName}</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-cw-stone-600 sm:flex dark:text-cw-stone-400">
          <Link
            className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
            href={`${home}#values`}
          >
            Why us
          </Link>
          <Link
            className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
            href={`${home}#features`}
          >
            What we do
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
          Say hello
        </Link>
      </nav>
    </header>
  );
}

export function JungleFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper dark:border-cw-stone-800 dark:bg-cw-ink">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <VineDivider className="mx-auto mb-10 w-full max-w-xl" />
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2.5 text-cw-ink dark:text-cw-stone-50">
            <JungleSprig className="size-7 shrink-0" />
            <span className="text-base font-medium">{brand.storeName}</span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-cw-stone-500 dark:text-cw-stone-400"
          >
            <Link
              className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
              href={`${home}#values`}
            >
              Why us
            </Link>
            <Link
              className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
              href={`${home}#features`}
            >
              What we do
            </Link>
            <Link
              className="transition-colors hover:text-cw-ink dark:hover:text-cw-stone-50"
              href={`${home}/contact`}
            >
              Contact
            </Link>
          </nav>
          <p className="text-xs text-cw-stone-500 dark:text-cw-stone-400">
            © {year} {brand.storeName}. Growing something good.
          </p>
        </div>
      </div>
    </footer>
  );
}
