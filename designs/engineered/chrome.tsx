/**
 * Engineered — site-wide chrome (Header + Footer).
 *
 * Gives the dark-luxe pack a design-matched frame on EVERY page (contact,
 * info, …), not just the homepage overlay. Reuses the pack's own scoped CSS
 * vocabulary (.studio__nav / .studio__btn / .studio__footer from
 * engineered.css) + its next/font stack, so the chrome is byte-for-byte the
 * same visual language as the homepage. The mark is Engineered's signature
 * motif from the design language (components/svg-items/design-motifs.ts:
 * `lattice-mark`), re-rendered here with the pack's OWN locked tokens
 * (mint / amber / cream on navy-black) instead of the cw-* palette chain.
 *
 * Brand name reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/engineered/index.ts). On the
 * homepage the pack's fixed overlay covers this chrome — the inline nav
 * there remains the primary navigation for `/`.
 */
import Link from "next/link";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import "./engineered.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["600", "700", "800"],
});
const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
});

const Arrow = () => (
  <svg className="studio__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Engineered's locked paint roles for the motif — the pack's own tokens
 * (NOT the cw-* chain: this is a whole skin with its own prefix). The vars
 * resolve from the `.studio` root class; hex fallbacks are the locked theme. */
const MINT = "var(--accent, #5fe6c4)";
const NAVY = "var(--accent-deep, #1e3f5a)";
const AMBER = "var(--amber, #e8a06a)";
const CREAM = "var(--cream, #f4efe6)";

/**
 * The lattice-mark signature motif (same geometry as
 * components/svg-items/LatticeMark.tsx), re-toned for the locked dark theme:
 * mint square + amber circle + cream diamond woven over a cream lattice
 * heart. ClipPath id is namespaced `eng-*` so it can't collide with the
 * cw-* library item if both ever render on one page.
 */
function EngineeredLattice({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <clipPath id="eng-lattice-heart">
          <circle cx="60" cy="60" r="25" />
        </clipPath>
      </defs>

      {/* Outer reference circle */}
      <circle cx="60" cy="60" r="46" fill="none" stroke={CREAM} strokeOpacity="0.18" strokeWidth="0.75" />

      {/* Strand 1 — the diamond (square rotated 45°), drawn first (lowest) */}
      <path
        d="M60 16 L104 60 L60 104 L16 60 Z"
        fill="none"
        stroke={CREAM}
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Strand 2 — the circle, woven over the diamond, under the square */}
      <circle cx="60" cy="60" r="35" fill="none" stroke={AMBER} strokeOpacity="0.75" strokeWidth="1.25" />

      {/* Strand 3 — the upright square, drawn last (highest) */}
      <path
        d="M29 29 L91 29 L91 91 L29 91 Z"
        fill="none"
        stroke={MINT}
        strokeOpacity="0.85"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Weave pass A — the diamond climbs back OVER the square */}
      <g stroke={CREAM} strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M69 25 L77 33" />
        <path d="M95 69 L87 77" />
        <path d="M51 95 L43 87" />
        <path d="M25 51 L33 43" />
      </g>

      {/* Weave pass B — the circle rises OVER the square */}
      <g stroke={AMBER} strokeOpacity="0.75" strokeWidth="1.25" fill="none" strokeLinecap="round">
        <path d="M72.5 27.3 A 35 35 0 0 1 80.1 31.3" />
        <path d="M92.7 72.5 A 35 35 0 0 1 88.7 80.1" />
        <path d="M47.5 92.7 A 35 35 0 0 1 39.9 88.7" />
        <path d="M27.3 47.5 A 35 35 0 0 1 31.3 39.9" />
      </g>

      {/* Heart — fine diagonal lattice clipped to the inner circle */}
      <g clipPath="url(#eng-lattice-heart)">
        <g stroke={CREAM} strokeOpacity="0.25" strokeWidth="0.75">
          <path d="M22 74 L74 22" />
          <path d="M28 92 L92 28" />
          <path d="M46 98 L98 46" />
          <path d="M22 46 L74 98" />
          <path d="M28 28 L92 92" />
          <path d="M46 22 L98 74" />
        </g>
        <circle cx="60" cy="60" r="1.5" fill={MINT} fillOpacity="0.9" />
        <circle cx="48" cy="60" r="1" fill={MINT} fillOpacity="0.6" />
        <circle cx="72" cy="60" r="1" fill={MINT} fillOpacity="0.6" />
        <circle cx="60" cy="48" r="1" fill={AMBER} fillOpacity="0.6" />
        <circle cx="60" cy="72" r="1" fill={AMBER} fillOpacity="0.6" />
      </g>
      <circle cx="60" cy="60" r="25" fill="none" stroke={CREAM} strokeOpacity="0.3" strokeWidth="0.75" />

      {/* Cardinal pearls on the diamond's points */}
      <circle cx="60" cy="16" r="1.5" fill={MINT} fillOpacity="0.9" />
      <circle cx="104" cy="60" r="1.5" fill={MINT} fillOpacity="0.9" />
      <circle cx="60" cy="104" r="1.5" fill={MINT} fillOpacity="0.9" />
      <circle cx="16" cy="60" r="1.5" fill={MINT} fillOpacity="0.9" />
      {/* Smaller warm pearls on the square's corners */}
      <circle cx="29" cy="29" r="1.1" fill={AMBER} fillOpacity="0.8" />
      <circle cx="91" cy="29" r="1.1" fill={AMBER} fillOpacity="0.8" />
      <circle cx="91" cy="91" r="1.1" fill={AMBER} fillOpacity="0.8" />
      <circle cx="29" cy="91" r="1.1" fill={AMBER} fillOpacity="0.8" />
      {/* Hairline ticks marking the outer circle's cardinal points */}
      <g stroke={NAVY} strokeOpacity="0.9" strokeWidth="0.75" strokeLinecap="round">
        <path d="M60 11.5 L60 14.5" />
        <path d="M105.5 60 L108.5 60" />
        <path d="M60 105.5 L60 108.5" />
        <path d="M11.5 60 L14.5 60" />
      </g>
    </svg>
  );
}

const fontVars = () => `${display.variable} ${body.variable} ${mono.variable}`;

export function EngineeredHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className={`studio studio--chrome ${fontVars()}`}>
      <nav className="studio__nav" aria-label="Site">
        <div className="studio__inner studio__navbar">
          <Link className="studio__brand" href={home}>
            <EngineeredLattice className="studio__chrome-mark" />
            {brand.storeName}
          </Link>
          <div className="studio__navlinks">
            <Link href={`${home}#services`}>Services</Link>
            <Link href={`${home}#process`}>Process</Link>
            <Link href={`${home}#work`}>Work</Link>
            <Link href={`${home}/contact`}>Contact</Link>
          </div>
          <Link className="studio__btn" href={`${home}/contact`}>
            Book a call <Arrow />
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function EngineeredFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className={`studio studio--chrome-foot ${fontVars()}`}>
      <div className="studio__footer">
        <div className="studio__inner">
          <div className="studio__chrome-divider" aria-hidden="true">
            <EngineeredLattice />
          </div>
          <div className="studio__chrome-foot-row">
            <div className="studio__brand">
              <EngineeredLattice className="studio__chrome-mark" />
              {brand.storeName}
            </div>
            <nav className="studio__chrome-foot-nav" aria-label="Footer">
              <Link href={`${home}#services`}>Services</Link>
              <Link href={`${home}#process`}>Process</Link>
              <Link href={`${home}#work`}>Work</Link>
              <Link href={`${home}/contact`}>Contact</Link>
            </nav>
          </div>
          <div className="studio__footer-bottom">
            <span>© {year} {brand.storeName}. All rights reserved.</span>
            <span>Engineered · not a template</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
