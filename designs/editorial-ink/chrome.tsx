/**
 * Editorial Ink — site-wide chrome (Header + Footer).
 *
 * Gives the magazine pack a design-matched frame on EVERY page (contact,
 * info, …), not just the homepage overlay. Reuses the pack's own scoped CSS
 * vocabulary (.edi__nav / .edi__btn / .edi__footer from editorial-ink.css)
 * + its Fraunces/Hanken Grotesk/Space Mono font stack, so the chrome speaks
 * exactly the homepage's language. The mark is Editorial Ink's signature
 * motif from the design language (components/svg-items/design-motifs.ts:
 * `prism-mark`), re-rendered here with the pack's OWN locked tokens
 * (oxblood spectrum on warm paper) instead of the cw-* palette chain.
 *
 * Brand name reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/editorial-ink/index.ts). On the
 * homepage the pack's fixed overlay covers this chrome — the inline nav
 * there remains the primary navigation for `/`.
 */
import Link from "next/link";
import { Fraunces, Hanken_Grotesk, Space_Mono } from "next/font/google";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import "./editorial-ink.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});
const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});
const mono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-spacemono",
  display: "swap",
  weight: ["400", "700"],
});

const Arrow = () => (
  <svg className="edi__arrow" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Editorial Ink's locked paint roles for the motif — the pack's own tokens
 * (NOT the cw-* chain: this is a whole skin with its own prefix). The vars
 * resolve from the `.edi` root class; hex fallbacks are the locked theme. */
const OXBLOOD = "var(--accent, #7c2230)";
const OXBLOOD_DEEP = "var(--accent-deep, #511620)";
const SAND = "var(--sand, #c9bca2)";
const PAPER = "var(--paper, #f6f1e7)";
const INK = "var(--ink, #1c1916)";
const MUTED = "var(--muted, #6b6356)";

/** Spectrum bands — each fans out from the exit face and fades right. */
const BANDS: ReadonlyArray<{ id: string; d: string; color: string; peak: number }> = [
  { id: "edi-prism-b1", d: "M64 50.5 L114 25 L114 33 L64 54 Z", color: SAND, peak: 0.7 },
  { id: "edi-prism-b2", d: "M64 54 L114 35 L114 44 L64 57 Z", color: OXBLOOD, peak: 0.65 },
  { id: "edi-prism-b3", d: "M64 57 L114 46 L114 56 L64 60 Z", color: OXBLOOD_DEEP, peak: 0.7 },
  { id: "edi-prism-b4", d: "M64 60 L114 58 L114 68 L64 63 Z", color: MUTED, peak: 0.55 },
  { id: "edi-prism-b5", d: "M64 63 L114 70 L114 79 L64 66 Z", color: INK, peak: 0.35 },
];

/**
 * The prism-mark signature motif (same geometry as
 * components/svg-items/PrismMark.tsx), re-toned for the paper-and-ink
 * register: one beam refracting into an oxblood-led tonal fan. Gradient ids
 * are namespaced `edi-*` so they can't collide with the cw-* library item.
 */
function EditorialPrism({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        {BANDS.map((b) => (
          <linearGradient key={b.id} id={b.id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={b.color} stopOpacity={b.peak} />
            <stop offset="0.75" stopColor={b.color} stopOpacity={b.peak * 0.35} />
            <stop offset="1" stopColor={b.color} stopOpacity="0.04" />
          </linearGradient>
        ))}
        <linearGradient id="edi-prism-glass" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={PAPER} stopOpacity="0.5" />
          <stop offset="0.55" stopColor={SAND} stopOpacity="0.35" />
          <stop offset="1" stopColor={SAND} stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="52" cy="89" rx="26" ry="2.6" fill={INK} fillOpacity="0.08" />

      {/* Incoming beam — soft warm under-glow with a fine dark core */}
      <path d="M6 64.5 L40 57.5" stroke={SAND} strokeOpacity="0.4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M6 64.5 L40 57.5" stroke={INK} strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />
      {/* Entry shimmer ticks trailing the beam */}
      <g stroke={SAND} strokeOpacity="0.7" strokeWidth="0.75" strokeLinecap="round">
        <path d="M12 60 L17 59" />
        <path d="M20 68 L25 67" />
      </g>

      {/* Spectrum fan — drawn behind the prism so the exit face overlaps it */}
      {BANDS.map((b) => (
        <path key={b.id} d={b.d} fill={`url(#${b.id})`} />
      ))}
      {/* Hairline seams between bands */}
      <g stroke={PAPER} strokeOpacity="0.5" strokeWidth="0.75">
        <path d="M64 54 L108 36.5" />
        <path d="M64 57 L108 48" />
        <path d="M64 60 L108 58.8" />
        <path d="M64 63 L108 69.2" />
      </g>

      {/* Prism body — glass gradient over a crisp ink outline */}
      <path
        d="M52 28 L76 86 L28 86 Z"
        fill="url(#edi-prism-glass)"
        stroke={INK}
        strokeOpacity="0.7"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Beam travelling inside the glass, widening toward the exit face */}
      <path d="M40 57.5 L64 51.5 L64 65 Z" fill={PAPER} fillOpacity="0.5" />
      <path d="M40 57.5 L64 51.5" stroke={PAPER} strokeOpacity="0.6" strokeWidth="0.75" />
      {/* Internal facet + sheen lines */}
      <path d="M52 28 L52 86" stroke={INK} strokeOpacity="0.12" strokeWidth="0.75" />
      <path d="M49 36 L33 76" stroke={PAPER} strokeOpacity="0.65" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M55.5 38 L70 74" stroke={PAPER} strokeOpacity="0.3" strokeWidth="1" strokeLinecap="round" />
      {/* Base reflection inside the glass */}
      <path d="M34 82.5 L70 82.5" stroke={INK} strokeOpacity="0.15" strokeWidth="0.75" />

      {/* Vertex jewels */}
      <circle cx="52" cy="28" r="1.4" fill={OXBLOOD} fillOpacity="0.9" />
      <circle cx="28" cy="86" r="1.1" fill={MUTED} fillOpacity="0.7" />
      <circle cx="76" cy="86" r="1.1" fill={MUTED} fillOpacity="0.7" />

      {/* Refraction sparkle at the entry point */}
      <g stroke={OXBLOOD_DEEP} strokeOpacity="0.7" strokeWidth="0.75" strokeLinecap="round">
        <path d="M40 51.5 L40 55" />
        <path d="M36.5 54.5 L43 53.5" />
      </g>
      <circle cx="40" cy="57.5" r="1.2" fill={OXBLOOD} fillOpacity="0.9" />
      <circle cx="39.5" cy="57" r="0.5" fill={PAPER} fillOpacity="0.9" />

      {/* Drift motes riding the spectrum */}
      <circle cx="86" cy="34" r="0.9" fill={SAND} fillOpacity="0.8" />
      <circle cx="96" cy="49" r="0.7" fill={OXBLOOD} fillOpacity="0.45" />
      <circle cx="90" cy="64.5" r="0.8" fill={OXBLOOD_DEEP} fillOpacity="0.4" />
      <circle cx="100" cy="73" r="0.6" fill={MUTED} fillOpacity="0.45" />
      {/* Quiet dust under the beam */}
      <circle cx="16" cy="72" r="0.6" fill={INK} fillOpacity="0.25" />
      <circle cx="26" cy="50" r="0.6" fill={INK} fillOpacity="0.2" />
    </svg>
  );
}

const fontVars = () => `${display.variable} ${body.variable} ${mono.variable}`;

export function EditorialInkHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className={`edi edi--chrome ${fontVars()}`}>
      <nav className="edi__nav" aria-label="Site">
        <div className="edi__inner edi__navbar">
          <Link className="edi__brand" href={home}>
            <EditorialPrism className="edi__chrome-mark" />
            <em>{brand.storeName}</em>
          </Link>
          <div className="edi__navlinks">
            <Link href={`${home}#features`}>Sections</Link>
            <Link href={`${home}#dispatch`}>Dispatch</Link>
            <Link href={`${home}#voices`}>Voices</Link>
            <Link href={`${home}/contact`}>Contact</Link>
          </div>
          <Link className="edi__btn" href={`${home}#subscribe`}>
            Subscribe <Arrow />
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function EditorialInkFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className={`edi edi--chrome-foot ${fontVars()}`}>
      <div className="edi__footer">
        <div className="edi__inner">
          <div className="edi__chrome-divider" aria-hidden="true">
            <EditorialPrism />
          </div>
          <div className="edi__chrome-foot-row">
            <div className="edi__brand">
              <EditorialPrism className="edi__chrome-mark" />
              <em>{brand.storeName}</em>
            </div>
            <nav className="edi__chrome-foot-nav" aria-label="Footer">
              <Link href={`${home}#features`}>Sections</Link>
              <Link href={`${home}#dispatch`}>Dispatch</Link>
              <Link href={`${home}#voices`}>Voices</Link>
              <Link href={`${home}/contact`}>Contact</Link>
            </nav>
          </div>
          <div className="edi__footer-bottom">
            <span>© {year} {brand.storeName}. All rights reserved.</span>
            <span>Set in ink · not a template</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
