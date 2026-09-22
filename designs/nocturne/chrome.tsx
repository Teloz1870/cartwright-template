/**
 * Nocturne — site-wide chrome (Header + Footer).
 *
 * Gives the dark-organic pack a design-matched frame on EVERY page (contact,
 * info, …), not just the homepage overlay. Reuses the pack's own scoped CSS
 * vocabulary (.noc__nav / .noc__btn / .noc__footer from nocturne.css) + its
 * Fraunces-italic/Manrope font stack, so the chrome speaks exactly the
 * homepage's language. The mark is Nocturne's signature motif from the
 * design language (components/svg-items/design-motifs.ts:
 * `constellation-mark`), re-rendered here with the pack's OWN locked tokens
 * (champagne gold / dusty rose / cream on midnight aubergine) instead of the
 * cw-* palette chain.
 *
 * Brand name reads brand.storeName so every install shows its own identity.
 * Wired via DesignPack.siteChrome (designs/nocturne/index.ts). On the
 * homepage the pack's fixed overlay covers this chrome — the inline nav
 * there remains the primary navigation for `/`.
 */
import Link from "next/link";
import { Fraunces, Manrope } from "next/font/google";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";
import "./nocturne.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});
const body = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const Arrow = () => (
  <svg className="noc__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Nocturne's locked paint roles for the motif — the pack's own tokens
 * (NOT the cw-* chain: this is a whole skin with its own prefix). The vars
 * resolve from the `.noc` root class; hex fallbacks are the locked theme. */
const GOLD = "var(--accent, #e9c789)";
const GOLD_DEEP = "var(--accent-deep, #c79a52)";
const ROSE = "var(--rose, #b8657a)";
const CREAM = "var(--cream, #f3ebe1)";

/** The asterism, drawn in connection order (S8 loops back to S3). */
const STARS: ReadonlyArray<{ x: number; y: number; m: 1 | 2 | 3 }> = [
  { x: 28, y: 68, m: 2 },
  { x: 42, y: 52, m: 1 },
  { x: 57, y: 60, m: 3 },
  { x: 70, y: 42, m: 1 },
  { x: 88, y: 52, m: 2 },
  { x: 94, y: 72, m: 3 },
  { x: 76, y: 82, m: 2 },
  { x: 56, y: 78, m: 3 },
];

/** Chart-ring tick marks every 30° on the r=53 circle. */
const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    x1: r(60 + 50.5 * Math.cos(a)),
    y1: r(60 + 50.5 * Math.sin(a)),
    x2: r(60 + 53 * Math.cos(a)),
    y2: r(60 + 53 * Math.sin(a)),
  };
});

/** One star at the given magnitude: 1 = lucida, 2 = bright, 3 = faint. */
function Star({ x, y, m }: { x: number; y: number; m: 1 | 2 | 3 }) {
  if (m === 3) {
    return <circle cx={x} cy={y} r="1.1" fill={CREAM} fillOpacity="0.6" />;
  }
  if (m === 2) {
    return (
      <g>
        <circle cx={x} cy={y} r="4" fill={GOLD} fillOpacity="0.14" />
        <circle cx={x} cy={y} r="1.7" fill={GOLD} fillOpacity="0.95" />
        <circle cx={x - 0.5} cy={y - 0.5} r="0.5" fill={CREAM} fillOpacity="0.9" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} r="6.5" fill={GOLD} fillOpacity="0.16" />
      <path
        d={`M${x} ${y - 4.6} L${x + 1.1} ${y - 1.1} L${x + 4.6} ${y} L${x + 1.1} ${y + 1.1} L${x} ${y + 4.6} L${x - 1.1} ${y + 1.1} L${x - 4.6} ${y} L${x - 1.1} ${y - 1.1} Z`}
        fill={GOLD}
        fillOpacity="0.9"
      />
      <circle cx={x} cy={y} r="1.6" fill={GOLD_DEEP} />
      <circle cx={x - 0.5} cy={y - 0.6} r="0.55" fill={CREAM} fillOpacity="0.95" />
    </g>
  );
}

/**
 * The constellation-mark signature motif (same geometry as
 * components/svg-items/ConstellationMark.tsx), re-toned for the locked dark
 * theme: gold stars + cream chart hairlines on the midnight canvas.
 */
function NocturneConstellation({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Chart ring with graduation ticks + an inner dotted orbit */}
      <circle cx="60" cy="60" r="53" fill="none" stroke={CREAM} strokeOpacity="0.18" strokeWidth="0.75" />
      <g stroke={CREAM} strokeOpacity="0.3" strokeWidth="0.75" strokeLinecap="round">
        {TICKS.map((t, i) => (
          <path key={i} d={`M${t.x1} ${t.y1} L${t.x2} ${t.y2}`} />
        ))}
      </g>
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="none"
        stroke={CREAM}
        strokeOpacity="0.12"
        strokeWidth="0.75"
        strokeDasharray="0.5 5"
        strokeLinecap="round"
      />

      {/* Connecting hairlines, S1→…→S8, looping back to S3 */}
      <g stroke={CREAM} strokeOpacity="0.35" strokeWidth="0.75" strokeLinecap="round">
        {STARS.slice(0, -1).map((s, i) => {
          const n = STARS[i + 1];
          return <path key={i} d={`M${s.x} ${s.y} L${n.x} ${n.y}`} />;
        })}
        <path d={`M${STARS[7].x} ${STARS[7].y} L${STARS[2].x} ${STARS[2].y}`} />
      </g>
      {/* Dashed pointer from the lucida toward an outlying companion */}
      <path
        d="M70 42 L52 27"
        stroke={GOLD_DEEP}
        strokeOpacity="0.45"
        strokeWidth="0.75"
        strokeDasharray="2 3"
        strokeLinecap="round"
      />
      <circle cx="50" cy="25.5" r="1.2" fill={ROSE} fillOpacity="0.9" />
      <circle cx="50" cy="25.5" r="3" fill={ROSE} fillOpacity="0.16" />

      {/* The asterism itself */}
      {STARS.map((s, i) => (
        <Star key={i} x={s.x} y={s.y} m={s.m} />
      ))}

      {/* Field stars — anonymous background population */}
      <circle cx="36" cy="36" r="0.8" fill={CREAM} fillOpacity="0.45" />
      <circle cx="80" cy="26" r="0.6" fill={CREAM} fillOpacity="0.4" />
      <circle cx="97" cy="38" r="0.7" fill={CREAM} fillOpacity="0.5" />
      <circle cx="22" cy="52" r="0.6" fill={CREAM} fillOpacity="0.35" />
      <circle cx="30" cy="86" r="0.8" fill={CREAM} fillOpacity="0.5" />
      <circle cx="47" cy="94" r="0.6" fill={CREAM} fillOpacity="0.35" />
      <circle cx="66" cy="93" r="0.7" fill={CREAM} fillOpacity="0.4" />
      <circle cx="88" cy="92" r="0.6" fill={CREAM} fillOpacity="0.45" />
      <circle cx="104" cy="60" r="0.6" fill={CREAM} fillOpacity="0.35" />
      <circle cx="62" cy="22" r="0.7" fill={CREAM} fillOpacity="0.45" />
      {/* Two warm sparkle crosses */}
      <g stroke={ROSE} strokeOpacity="0.6" strokeWidth="0.75" strokeLinecap="round">
        <path d="M18 38 L18 42 M16 40 L20 40" />
        <path d="M101 81 L101 84.6 M99.2 82.8 L102.8 82.8" />
      </g>
    </svg>
  );
}

const fontVars = () => `${display.variable} ${body.variable}`;

export function NocturneHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    <header className={`noc noc--chrome ${fontVars()}`}>
      <nav className="noc__nav" aria-label="Site">
        <div className="noc__inner noc__navbar">
          <Link className="noc__brand" href={home}>
            <NocturneConstellation className="noc__chrome-mark" />
            <em>{brand.storeName}</em>
          </Link>
          <div className="noc__navlinks">
            <Link href={`${home}#craft`}>The craft</Link>
            <Link href={`${home}#process`}>Process</Link>
            <Link href={`${home}#story`}>Atelier</Link>
            <Link href={`${home}/contact`}>Contact</Link>
          </div>
          <Link className="noc__btn" href={`${home}/contact`}>
            Enquire <Arrow />
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function NocturneFooter({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className={`noc noc--chrome-foot ${fontVars()}`}>
      <div className="noc__footer">
        <div className="noc__inner">
          <div className="noc__chrome-divider" aria-hidden="true">
            <NocturneConstellation />
          </div>
          <div className="noc__chrome-foot-row">
            <div className="noc__brand">
              <NocturneConstellation className="noc__chrome-mark" />
              <em>{brand.storeName}</em>
            </div>
            <nav className="noc__chrome-foot-nav" aria-label="Footer">
              <Link href={`${home}#craft`}>The craft</Link>
              <Link href={`${home}#process`}>Process</Link>
              <Link href={`${home}#story`}>Atelier</Link>
              <Link href={`${home}/contact`}>Contact</Link>
            </nav>
          </div>
          <div className="noc__footer-bottom">
            <span>© {year} {brand.storeName}. All rights reserved.</span>
            <span>Composed after dark · <em>not a template</em></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
