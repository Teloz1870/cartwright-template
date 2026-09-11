/**
 * Meridian — site-wide chrome (Header + Footer).
 *
 * Gives the crisp-modern SaaS pack a design-matched frame on EVERY page
 * (contact, info, …), not just the homepage overlay. Reuses the pack's own
 * scoped CSS vocabulary (.mer__nav / .mer__btn / .mer__footer from
 * meridian.css) + its Sora/Plus Jakarta Sans/Space Mono font stack, so the
 * chrome speaks exactly the homepage's language. The mark is Meridian's
 * signature motif from the design language
 * (components/svg-items/design-motifs.ts: `comet-mark`), re-rendered here
 * with the pack's OWN locked tokens (electric blue / cyan-teal on cool
 * near-white) instead of the cw-* palette chain.
 *
 * Brand name reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/meridian/index.ts). On the
 * homepage the pack's fixed overlay covers this chrome — the inline nav
 * there remains the primary navigation for `/`.
 */
import Link from "next/link";
import { Sora, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import "./meridian.css";

const display = Sora({
  subsets: ["latin"],
  variable: "--font-mer-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});
const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-mer-body",
  display: "swap",
});
const mono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mer-mono",
  display: "swap",
  weight: ["400", "700"],
});

const Arrow = () => (
  <svg className="mer__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Meridian's locked paint roles for the motif — the pack's own tokens
 * (NOT the cw-* chain: this is a whole skin with its own prefix). The vars
 * resolve from the `.mer` root class; hex fallbacks are the locked theme. */
const BLUE = "var(--accent, #2563ff)";
const BLUE_DEEP = "var(--accent-deep, #143a9c)";
const TEAL = "var(--teal, #06b6d4)";
const CREAM = "var(--cream, #f7f9fc)";
const INK = "var(--ink, #0c1322)";
const MUTED = "var(--muted, #5b6577)";

/** Trailing dust — hand-placed along the tail arc, thinning toward the tip. */
const PARTICLES: ReadonlyArray<{ x: number; y: number; r: number; c: string; o: number }> = [
  { x: 47, y: 68, r: 1.4, c: BLUE, o: 0.6 },
  { x: 54, y: 74, r: 1.1, c: TEAL, o: 0.55 },
  { x: 60, y: 62, r: 1.2, c: BLUE_DEEP, o: 0.5 },
  { x: 66, y: 70, r: 0.9, c: MUTED, o: 0.5 },
  { x: 72, y: 52, r: 1.1, c: BLUE, o: 0.45 },
  { x: 79, y: 60, r: 0.8, c: TEAL, o: 0.45 },
  { x: 84, y: 42, r: 0.9, c: BLUE_DEEP, o: 0.4 },
  { x: 90, y: 50, r: 0.7, c: MUTED, o: 0.4 },
  { x: 95, y: 33, r: 0.8, c: BLUE, o: 0.35 },
  { x: 101, y: 40, r: 0.6, c: TEAL, o: 0.3 },
  { x: 105, y: 25, r: 0.6, c: BLUE_DEEP, o: 0.28 },
  { x: 111, y: 31, r: 0.5, c: MUTED, o: 0.25 },
];

/**
 * The comet-mark signature motif (same geometry as
 * components/svg-items/CometMark.tsx), re-toned with Meridian's electric
 * blue + cyan-teal. Gradient ids are namespaced `mer-*` so they can't
 * collide with the cw-* library item if both ever render on one page.
 */
function MeridianComet({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="mer-comet-outer" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={BLUE} stopOpacity="0.35" />
          <stop offset="0.6" stopColor={BLUE} stopOpacity="0.15" />
          <stop offset="1" stopColor={BLUE} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mer-comet-mid" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={BLUE_DEEP} stopOpacity="0.55" />
          <stop offset="0.65" stopColor={BLUE_DEEP} stopOpacity="0.2" />
          <stop offset="1" stopColor={BLUE_DEEP} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mer-comet-core" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={TEAL} stopOpacity="0.85" />
          <stop offset="0.7" stopColor={TEAL} stopOpacity="0.3" />
          <stop offset="1" stopColor={TEAL} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="mer-comet-coma" cx="0.4" cy="0.4" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.55" stopColor={BLUE} />
          <stop offset="1" stopColor={BLUE_DEEP} />
        </radialGradient>
      </defs>

      {/* Trajectory echo — the path it has already travelled */}
      <path
        d="M10 50 C 16 66, 22 76, 34 84"
        fill="none"
        stroke={INK}
        strokeOpacity="0.1"
        strokeWidth="0.75"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />

      {/* Tail — widest, softest strand first; each layer rides the same arc */}
      <path d="M35 81 C 56 69, 81 44, 108 17" fill="none" stroke="url(#mer-comet-outer)" strokeWidth="7" strokeLinecap="round" />
      <path d="M35 81 C 57 70, 83 47, 106 20" fill="none" stroke="url(#mer-comet-mid)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M35 81 C 55 70, 79 45, 102 22" fill="none" stroke="url(#mer-comet-core)" strokeWidth="1.5" strokeLinecap="round" />
      {/* A stray fourth strand peeling off below the main tail */}
      <path d="M37 84 C 61 76, 89 56, 110 32" fill="none" stroke="url(#mer-comet-mid)" strokeWidth="1" strokeLinecap="round" />

      {/* Trailing dust */}
      {PARTICLES.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.c} fillOpacity={p.o} />
      ))}

      {/* Head — glow, coma, nucleus, glint */}
      <circle cx="34" cy="82" r="11" fill={BLUE} fillOpacity="0.12" />
      <circle cx="34" cy="82" r="7.5" fill={BLUE} fillOpacity="0.14" />
      <circle cx="34" cy="82" r="5.6" fill="url(#mer-comet-coma)" stroke={BLUE_DEEP} strokeOpacity="0.5" strokeWidth="0.75" />
      <circle cx="32.6" cy="80.4" r="1.9" fill={CREAM} fillOpacity="0.9" />
      <circle cx="31.9" cy="79.7" r="0.7" fill={CREAM} />
      {/* Shock-front whiskers ahead of the head */}
      <g stroke={BLUE_DEEP} strokeOpacity="0.4" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M26.5 76 C 23.5 78, 22 81, 22 84.5" />
        <path d="M28 89 C 25.5 90.5, 24 92.5, 23.5 95" />
      </g>

      {/* Field — faint stars keeping the comet company */}
      <g stroke={INK} strokeOpacity="0.4" strokeWidth="0.75" strokeLinecap="round">
        <path d="M88 84 L88 88 M86 86 L90 86" />
        <path d="M18 26 L18 29.6 M16.2 27.8 L19.8 27.8" />
      </g>
      <circle cx="58" cy="24" r="0.8" fill={MUTED} fillOpacity="0.5" />
      <circle cx="42" cy="38" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="74" cy="92" r="0.7" fill={MUTED} fillOpacity="0.45" />
      <circle cx="104" cy="66" r="0.7" fill={INK} fillOpacity="0.35" />
      <circle cx="64" cy="106" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="14" cy="64" r="0.6" fill={MUTED} fillOpacity="0.4" />
    </svg>
  );
}

const fontVars = () => `${display.variable} ${body.variable} ${mono.variable}`;

export function MeridianHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className={`mer mer--chrome ${fontVars()}`}>
      <nav className="mer__nav" aria-label="Site">
        <div className="mer__inner mer__navbar">
          <Link className="mer__brand" href={home}>
            <MeridianComet className="mer__chrome-mark" />
            {brand.storeName}
          </Link>
          <div className="mer__navlinks">
            <Link href={`${home}#features`}>Product</Link>
            <Link href={`${home}#stats`}>Performance</Link>
            <Link href={`${home}#process`}>How it works</Link>
            <Link href={`${home}/contact`}>Contact</Link>
          </div>
          <div className="mer__nav-right">
            <Link className="mer__btn" href={`${home}/contact`}>
              Book a demo <Arrow />
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

export function MeridianFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className={`mer mer--chrome-foot ${fontVars()}`}>
      <div className="mer__footer">
        <div className="mer__inner">
          <div className="mer__chrome-divider" aria-hidden="true">
            <MeridianComet />
          </div>
          <div className="mer__chrome-foot-row">
            <div className="mer__brand">
              <MeridianComet className="mer__chrome-mark" />
              {brand.storeName}
            </div>
            <nav className="mer__chrome-foot-nav" aria-label="Footer">
              <Link href={`${home}#features`}>Product</Link>
              <Link href={`${home}#stats`}>Performance</Link>
              <Link href={`${home}#process`}>How it works</Link>
              <Link href={`${home}/contact`}>Contact</Link>
            </nav>
          </div>
          <div className="mer__footer-bottom">
            <span>© {year} {brand.storeName}. All rights reserved.</span>
            <span>Precise by default.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
