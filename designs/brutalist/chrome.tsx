/**
 * Brutalist — site-wide chrome (Header + Footer).
 *
 * Gives the neo-brutalist pack a design-matched frame on EVERY page (contact,
 * info, …), not just the homepage overlay. Reuses the pack's own scoped CSS
 * vocabulary (.bru__nav / .bru__btn / .bru__footer from brutalist.css) + its
 * Archivo/Space Grotesk/Space Mono font stack — hard black borders, paper
 * canvas, one acid accent. The mark is Brutalist's signature motif from the
 * design language (components/svg-items/design-motifs.ts: `sunburst-mark`),
 * re-rendered here with the pack's OWN locked tokens (acid-lime disc, hard
 * black rays, one safety-orange spark) instead of the cw-* palette chain.
 *
 * Brand name reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/brutalist/index.ts). On the
 * homepage the pack's fixed overlay covers this chrome — the inline nav
 * there remains the primary navigation for `/`.
 */
import Link from "next/link";
import { Archivo, Space_Grotesk, Space_Mono } from "next/font/google";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import "./brutalist.css";

const display = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  weight: ["700", "800", "900"],
});
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["400", "500", "700"],
});
const mono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
  weight: ["400", "700"],
});

const Arrow = () => (
  <svg className="bru__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" />
  </svg>
);

/* Brutalist's locked paint roles for the motif — the pack's own tokens
 * (NOT the cw-* chain: this is a whole skin with its own prefix). The vars
 * resolve from the `.bru` root class; hex fallbacks are the locked theme. */
const ACID = "var(--acid, #c8ff00)";
const ACID_DEEP = "var(--acid-deep, #9bcb00)";
const HOT = "var(--hot, #ff3d00)";
const PAPER = "var(--paper-2, #fffdf6)";
const INK = "var(--ink, #0a0a0a)";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 16 rays at 22.5° steps — even indices long, odd indices short. */
const RAYS = Array.from({ length: 16 }, (_, i) => {
  const a = (i * Math.PI) / 8 - Math.PI / 2;
  const long = i % 2 === 0;
  const from = long ? 22 : 21;
  const to = long ? 47 : 33.5;
  return {
    long,
    x1: r2(60 + from * Math.cos(a)),
    y1: r2(60 + from * Math.sin(a)),
    x2: r2(60 + to * Math.cos(a)),
    y2: r2(60 + to * Math.sin(a)),
    tx: r2(60 + 51 * Math.cos(a)),
    ty: r2(60 + 51 * Math.sin(a)),
  };
});

/** Quiet dots resting between the rays. */
const BETWEEN_DOTS = Array.from({ length: 16 }, (_, i) => {
  const a = (i * Math.PI) / 8 - Math.PI / 2 + Math.PI / 16;
  return { x: r2(60 + 27.5 * Math.cos(a)), y: r2(60 + 27.5 * Math.sin(a)) };
});

/**
 * The sunburst-mark signature motif (same geometry as
 * components/svg-items/SunburstMark.tsx), re-toned brutalist: an acid-lime
 * disc with hard black rays — heavier strokes, no soft halo washes.
 * Gradient id is namespaced `bru-*` so it can't collide with the cw-* item.
 */
function BrutalistSunburst({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <radialGradient id="bru-sun-disc" cx="0.36" cy="0.32" r="1">
          <stop offset="0" stopColor={PAPER} />
          <stop offset="0.45" stopColor={ACID} />
          <stop offset="1" stopColor={ACID_DEEP} />
        </radialGradient>
      </defs>

      {/* Halo washes + outermost ring — acid, kept graphic */}
      <circle cx="60" cy="60" r="24" fill={ACID} fillOpacity="0.18" />
      <circle cx="60" cy="60" r="54" fill="none" stroke={INK} strokeOpacity="0.5" strokeWidth="1" />

      {/* Rays — long rays heavy black, short rays acid-deep */}
      <g strokeLinecap="square" fill="none">
        {RAYS.map((ray, i) => (
          <path
            key={i}
            d={`M${ray.x1} ${ray.y1} L${ray.x2} ${ray.y2}`}
            stroke={ray.long ? INK : ACID_DEEP}
            strokeWidth={ray.long ? 2.5 : 1.5}
            strokeOpacity={ray.long ? 0.9 : 0.9}
          />
        ))}
      </g>
      {/* Cardinal tip jewels (every fourth ray) — the one hot spark */}
      {RAYS.filter((_, i) => i % 4 === 0).map((ray, i) => (
        <circle key={i} cx={ray.tx} cy={ray.ty} r="1.4" fill={HOT} fillOpacity="0.9" />
      ))}
      {/* Dotted ring resting between the rays */}
      {BETWEEN_DOTS.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="0.8" fill={INK} fillOpacity="0.55" />
      ))}

      {/* The disc — acid gradient body, hard black rim, inner ring */}
      <circle cx="60" cy="60" r="15.5" fill="url(#bru-sun-disc)" stroke={INK} strokeWidth="2" />
      <circle cx="60" cy="60" r="11.5" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1" />
      <path
        d="M50.5 55 C 51.5 50, 55 46.5, 59.5 45.8"
        fill="none"
        stroke={PAPER}
        strokeOpacity="0.8"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      {/* Face of the disc — engraved freckles + a hard core dot */}
      <circle cx="64.5" cy="63.5" r="1" fill={INK} fillOpacity="0.6" />
      <circle cx="57" cy="66" r="0.8" fill={INK} fillOpacity="0.5" />
      <circle cx="65" cy="56.5" r="0.7" fill={INK} fillOpacity="0.45" />
      <circle cx="60" cy="60" r="1.8" fill={INK} fillOpacity="0.85" />

      {/* Corner companions — hard sparks acknowledging the light */}
      <g stroke={INK} strokeOpacity="0.7" strokeWidth="1.25" strokeLinecap="square">
        <path d="M19 21 L19 25 M17 23 L21 23" />
        <path d="M102 96 L102 99.4 M100.3 97.7 L103.7 97.7" />
      </g>
      <circle cx="100" cy="22" r="1" fill={HOT} fillOpacity="0.8" />
      <circle cx="20" cy="98" r="1" fill={ACID_DEEP} fillOpacity="0.9" />
    </svg>
  );
}

const fontVars = () => `${display.variable} ${grotesk.variable} ${mono.variable}`;

export function BrutalistHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className={`bru bru--chrome ${fontVars()}`}>
      <nav className="bru__nav" aria-label="Site">
        <div className="bru__inner bru__navbar">
          <Link className="bru__brand" href={home}>
            <BrutalistSunburst className="bru__chrome-mark" />
            {brand.storeName}
          </Link>
          <div className="bru__navlinks">
            <Link href={`${home}#work`}>Work</Link>
            <Link href={`${home}#process`}>Process</Link>
            <Link href={`${home}#stats`}>Results</Link>
            <Link href={`${home}/contact`}>Contact</Link>
          </div>
          <Link className="bru__btn" href={`${home}/contact`}>
            Start <Arrow />
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function BrutalistFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className={`bru bru--chrome-foot ${fontVars()}`}>
      <div className="bru__footer">
        <div className="bru__inner">
          <div className="bru__chrome-divider" aria-hidden="true">
            <BrutalistSunburst />
          </div>
          <div className="bru__chrome-foot-row">
            <div className="bru__brand">
              <BrutalistSunburst className="bru__chrome-mark" />
              {brand.storeName}
            </div>
            <nav className="bru__chrome-foot-nav" aria-label="Footer">
              <Link href={`${home}#work`}>Work</Link>
              <Link href={`${home}#process`}>Process</Link>
              <Link href={`${home}#stats`}>Results</Link>
              <Link href={`${home}/contact`}>Contact</Link>
            </nav>
          </div>
          <div className="bru__footer-bottom">
            <span>© {year} {brand.storeName}. All rights reserved.</span>
            <span>Loud on purpose · not a template</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
