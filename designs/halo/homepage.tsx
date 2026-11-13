/**
 * "Halo" — homepage BODY (ultra-minimal product luxury). The nav, footer, `.halo`
 * root + fonts now live in the site-wide Shell + chrome (./chrome.tsx), so the
 * look reaches every page — this file is just the homepage's sections, rendered
 * inside `<main>` within the HaloShell. Server-rendered, CSS-only, LOCKED light
 * theme (no `dark:` variants → no OS dark-mode leak). Pure CSS product visuals
 * (metallic conic sheens, layered ambient shadows, gradient blobs) + the signature
 * alternating full-bleed light/near-black panels. No 3D / no three.js.
 *
 * Copy is English-first (Cartwright customers are primarily English). Original product
 * name + copy that EVOKE premium-device luxury without naming any real brand.
 */
import type { DesignHomepageProps } from "../types";
import "./halo.css";

const Chevron = () => (
  <svg className="halo__chev" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const panels = [
  {
    eyebrow: "Engineering",
    title: "Forged from a single ingot.",
    line: "Aerospace-grade titanium, milled to a tolerance you can feel but never see.",
    tone: "dark" as const,
    visual: "ingot" as const,
  },
  {
    eyebrow: "Display",
    title: "A screen that disappears.",
    line: "Edge-to-edge glass with a halo so deep the bezel reads as pure shadow.",
    tone: "light" as const,
    visual: "screen" as const,
  },
  {
    eyebrow: "Power",
    title: "All-day, every-day.",
    line: "An entire day of effortless use, then a full charge in the time it takes to breathe.",
    tone: "dark" as const,
    visual: "battery" as const,
  },
];

const specs = [
  { label: "Material", value: "Grade-5 titanium" },
  { label: "Display", value: "6.9″ haloOLED" },
  { label: "Resolution", value: "2868 × 1320" },
  { label: "Chip", value: "Aether A1 · 3nm" },
  { label: "Camera", value: "48MP fusion array" },
  { label: "Battery", value: "Up to 29 hrs video" },
  { label: "Weight", value: "187 grams" },
  { label: "Water", value: "IP68 · 6m / 30 min" },
];

export default function HaloHomepage(_props: DesignHomepageProps) {
  return (
    <>
      {/* HERO */}
      <header className="halo__hero" id="top">
          <div className="halo__inner halo__hero-inner">
            <span className="halo__eyebrow halo__reveal" data-d="1">New · Halo Pro</span>
            <h1 className="halo__h1 halo__reveal" data-d="2">
              Titanium.
              <br />
              Reimagined.
            </h1>
            <p className="halo__subhead halo__reveal" data-d="3">
              The lightest, most capable device we have ever made — distilled to its purest form.
            </p>

            {/* CSS-only "product" object */}
            <div className="halo__product halo__reveal" data-d="4" aria-hidden="true">
              <div className="halo__product-glow" />
              <div className="halo__device">
                <div className="halo__device-sheen" />
                <div className="halo__device-screen">
                  <span className="halo__device-notch" />
                </div>
                <div className="halo__device-island" />
              </div>
              <div className="halo__product-shadow" />
            </div>

            <div className="halo__hero-cta halo__reveal" data-d="5">
              <a className="halo__pill-btn halo__pill-btn--solid" href="#buy">Buy</a>
              <a className="halo__text-link" href="#overview">
                Learn more <Chevron />
              </a>
            </div>
            <p className="halo__from halo__reveal" data-d="6">From $999 or $41.62/mo. for 24 mo.</p>
          </div>
        </header>

        {/* ALTERNATING FULL-BLEED PANELS */}
        <section id="overview" aria-label="Highlights">
          {panels.map((p) => (
            <article
              key={p.title}
              id={p.visual === "screen" ? "display" : undefined}
              className={`halo__panel halo__panel--${p.tone}`}
            >
              <div className="halo__inner halo__panel-inner halo__inview">
                <span className="halo__eyebrow halo__eyebrow--accent">{p.eyebrow}</span>
                <h2 className="halo__panel-title">{p.title}</h2>
                <p className="halo__panel-line">{p.line}</p>
                <div className={`halo__viz halo__viz--${p.visual}`} aria-hidden="true">
                  <span className="halo__viz-core" />
                  <span className="halo__viz-sheen" />
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* SPEC GRID */}
        <section className="halo__section" id="specs" aria-labelledby="specs-h">
          <div className="halo__inner">
            <div className="halo__head halo__inview">
              <span className="halo__eyebrow halo__eyebrow--accent">Tech Specs</span>
              <h2 className="halo__h2" id="specs-h">Every detail, measured.</h2>
            </div>
            <dl className="halo__specs halo__inview">
              {specs.map((s) => (
                <div key={s.label} className="halo__spec">
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CLOSING CTA */}
        <section className="halo__section halo__section--cta" id="buy">
          <div className="halo__inner">
            <div className="halo__cta halo__inview">
              <span className="halo__eyebrow halo__eyebrow--accent">Available now</span>
              <h2 className="halo__cta-title">Get yours.</h2>
              <p className="halo__cta-line">
                From $999 or $41.62/mo. for 24 months. Trade in your current device and save.
              </p>
              <div className="halo__hero-cta" style={{ justifyContent: "center" }}>
                <a className="halo__pill-btn halo__pill-btn--solid" href="#order">Buy</a>
                <a className="halo__text-link" href="#financing">
                  See financing options <Chevron />
                </a>
              </div>
            </div>
          </div>
        </section>

    </>
  );
}
