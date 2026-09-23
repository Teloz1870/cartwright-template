/**
 * Stillwater — site-wide chrome (Header + Footer).
 *
 * Replaces the shared store chrome so the calm-enterprise look owns its whole
 * frame: a light, hairline header with a mini three-ridge mountain mark + the
 * brand name in Fraunces, three quiet anchors (Platform / Proof / Contact) and
 * one pill CTA; a footer with a ridgeline divider and an English © line.
 * Reads brand.storeName so every install shows its own identity. Wired via
 * DesignPack.siteChrome (designs/stillwater/index.ts).
 *
 * Server components, palette-adaptive: all paint reads cw-* tokens (the SVG
 * marks use the FableButterfly var-fallback chains).
 */
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { brand } from "@/brand.config";
import { cn } from "@/lib/utils";
import type { DesignChromeProps } from "../types";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-stillwater-chrome",
  display: "swap",
  weight: ["400", "500", "600"],
});

// Palette-adaptive paint (FableButterfly fallback-chain convention).
const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";

/**
 * The Stillwater mark — three overlapping ridgelines fading into the distance
 * (the signature Scape, distilled to a favicon-sized glyph) over a still
 * waterline. Hand-authored, palette-adaptive, no gradients (id-collision-free
 * anywhere it's repeated).
 */
export function StillwaterMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("size-7", className)}
    >
      {/* far ridge */}
      <path d="M2 19 L9 9 L14 15.5 L18 11 L23 17 L27 13.5 L30 17.5 L30 19 Z" fill={ACCENT} fillOpacity="0.3" />
      {/* mid ridge */}
      <path d="M2 21.5 L7.5 14.5 L12.5 19.5 L17 14 L22.5 20 L26 17 L30 21 L30 21.5 Z" fill={ACCENT} fillOpacity="0.6" />
      {/* near ridge */}
      <path d="M2 24 L10 17 L15.5 21.5 L21 16.5 L30 24 Z" fill={ACCENT_DEEP} />
      {/* still water */}
      <g stroke={INK} strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round">
        <line x1="4" y1="27" x2="28" y2="27" />
      </g>
      <g stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round">
        <line x1="9" y1="30" x2="23" y2="30" />
      </g>
    </svg>
  );
}

/**
 * Footer divider — a hairline rule that rises into a small mountain range and
 * settles back to still water. Purely decorative.
 */
export function StillwaterRidgeDivider({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-8 w-full", className)}
    >
      <path
        d="M0 30 L 460 30 L 500 14 L 530 26 L 560 8 L 596 28 L 626 16 L 656 30 L 700 30 L 1200 30"
        fill="none"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1="520"
        y1="36"
        x2="640"
        y2="36"
        stroke={ACCENT}
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StillwaterHeader({ locale }: DesignChromeProps) {
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
          <StillwaterMark className="shrink-0" />
          <span
            className="text-lg font-medium tracking-tight"
            style={{ fontFamily: "var(--font-stillwater-chrome), Georgia, serif" }}
          >
            {brand.storeName}
          </span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-cw-stone-600 sm:flex">
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#panels`}>
            Platform
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}#metrics`}>
            Proof
          </Link>
          <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
            Contact
          </Link>
        </div>
        <Link
          href={`${home}/contact`}
          className="inline-flex h-9 items-center rounded-full bg-cw-terracotta px-4 text-sm font-medium text-cw-paper transition-colors hover:bg-[var(--color-cw-terracotta-strong,var(--color-cw-terracotta))]"
        >
          Find your stillness
        </Link>
      </nav>
    </header>
  );
}

export function StillwaterFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-cw-ink/10 bg-cw-paper">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <StillwaterRidgeDivider className="mb-10 text-cw-stone-400" />
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2.5 text-cw-ink">
            <StillwaterMark className="size-6 shrink-0" />
            <span className="text-base font-medium">{brand.storeName}</span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-cw-stone-500"
          >
            <Link className="transition-colors hover:text-cw-ink" href={`${home}#panels`}>
              Platform
            </Link>
            <Link className="transition-colors hover:text-cw-ink" href={`${home}#metrics`}>
              Proof
            </Link>
            <Link className="transition-colors hover:text-cw-ink" href={`${home}/contact`}>
              Contact
            </Link>
          </nav>
          <p className="text-xs text-cw-stone-500">
            © {year} {brand.storeName}. From noise to stillness.
          </p>
        </div>
      </div>
    </footer>
  );
}
