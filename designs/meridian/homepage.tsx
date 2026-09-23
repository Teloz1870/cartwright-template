/**
 * "Meridian" — a premium, code-built DesignPack homepage (crisp modern light SaaS).
 * Hand-crafted server component + a LOCKED light theme (no `dark:` variants → no OS
 * dark-mode leak). CSS-only visuals (gradient mesh, dot-grid) + CSS-only motion
 * (staggered load reveal + scroll-driven reveals as progressive enhancement).
 * No 3D / no three.js. Server-rendered for LCP. Selectable like any design via
 * /admin/designs (slug "meridian") → flows through the template pipeline.
 *
 * Copy is English-first (Cartwright customers are primarily English).
 */
import type { DesignHomepageProps } from "../types";
import { Sora, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
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

const features = [
  {
    icon: "◆",
    t: "One config, every surface",
    b: "Define your product once and Meridian ships the marketing site, the docs, and the app shell from a single source of truth. No drift, no copy-paste.",
    tag: "Platform",
    cls: "mer__card--feature",
  },
  { icon: "⚡", t: "Edge-fast by default", b: "Streamed server rendering on the edge. INP under 200ms, LCP that wins the auction.", tag: "Performance", cls: "mer__card--mid" },
  { icon: "▦", t: "Precise design system", b: "Tokens, scales, and a tight grid — every screen lines up to the pixel.", tag: "Design", cls: "mer__card--mid" },
  { icon: "◇", t: "Type-safe end to end", b: "From schema to UI, the types flow. Refactor with confidence.", tag: "DX", cls: "mer__card--narrow" },
  { icon: "↻", t: "Ship on every push", b: "Preview deploys per branch. Promote to prod in one click.", tag: "CI/CD", cls: "mer__card--narrow" },
  { icon: "◈", t: "Built-in observability", b: "Web Vitals, traces, and error budgets — wired from commit one.", tag: "Insight", cls: "mer__card--narrow" },
];

const stats = [
  { num: "99.99%", label: "Edge uptime", grad: true },
  { num: "48ms", label: "Median TTFB", grad: false },
  { num: "12k+", label: "Teams shipping", grad: true },
  { num: "4.9/5", label: "Developer rating", grad: false },
];

const steps = [
  { t: "Connect", b: "Point Meridian at your repo. We detect your stack and wire previews, env, and observability in minutes." },
  { t: "Compose", b: "Build with a precise token system and a typed component library. Every surface stays in sync, automatically." },
  { t: "Ship", b: "Promote to production on the edge with one click. Watch Web Vitals and error budgets in real time." },
];

export default function MeridianHomepage(_props: DesignHomepageProps) {
  return (
    <div
      className={`mer ${display.variable} ${body.variable} ${mono.variable}`}
      style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "auto" }}
    >
      <div className="mer__wrap">
        {/* NAV */}
        <nav className="mer__nav" aria-label="Primary">
          <div className="mer__inner mer__navbar">
            <a className="mer__brand" href="#top">
              <span className="mer__brand-mark" aria-hidden="true">M</span>
              Meridian
            </a>
            <div className="mer__navlinks">
              <a href="#features">Product</a>
              <a href="#stats">Performance</a>
              <a href="#process">How it works</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="mer__nav-right">
              <a className="mer__signin" href="#signin">Sign in</a>
              <a className="mer__btn" href="#start">
                Start free <Arrow />
              </a>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <header className="mer__hero" id="top">
          <div className="mer__hero-mesh" aria-hidden="true" />
          <div className="mer__inner mer__hero-grid">
            <span className="mer__pill mer__reveal" data-d="1">
              <span className="mer__dot" aria-hidden="true" />
              <strong>v3.0</strong>&nbsp;— Edge runtime, now generally available
            </span>
            <h1 className="mer__h1 mer__reveal" data-d="2">
              The platform that ships <span className="mer__grad">at the speed of thought.</span>
            </h1>
            <p className="mer__lede mer__reveal" data-d="3">
              Meridian gives modern teams one precise system for marketing, docs, and app — type-safe,
              edge-fast, and observable from the very first commit. Build once. Ship everywhere.
            </p>
            <div className="mer__cta-row mer__reveal" data-d="4">
              <a className="mer__btn" href="#start">Start building free <Arrow /></a>
              <a className="mer__btn mer__btn--ghost" href="#demo">Book a demo</a>
              <span className="mer__kbd-hint">
                or press <span className="mer__kbd">⌘</span><span className="mer__kbd">K</span> to explore
              </span>
            </div>

            {/* product / terminal card */}
            <div className="mer__hero-frame mer__reveal" data-d="5" aria-hidden="true">
              <div className="mer__frame-bar">
                <i /><i /><i />
                <span>meridian — deploy</span>
              </div>
              <pre className="mer__frame-body">
{`> `}<span className="ln-prompt">meridian deploy</span>{` --prod
`}<span className="ln-dim">  ◷ building edge bundle…           </span><span className="ln-ok">done 1.8s</span>{`
`}<span className="ln-dim">  ◷ type-checking surfaces…         </span><span className="ln-ok">0 errors</span>{`
`}<span className="ln-dim">  ◷ optimizing LCP image…           </span><span className="ln-ok">done</span>{`
  `}<span className="ln-key">deployed</span>{` → `}<span className="ln-prompt">https://app.meridian.dev</span>{`
  `}<span className="ln-ok">✓ live in 4.2s · 17 regions · INP 86ms</span></pre>
              </div>
          </div>
        </header>

        {/* LOGOS */}
        <section className="mer__logos" aria-label="Trusted by">
          <div className="mer__inner">
            <p>Trusted by teams building the modern web</p>
            <div className="mer__logos-row">
              {["Northwind", "Helix", "Lumen", "Cobalt", "Vantage", "Quartz"].map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES / BENTO */}
        <section className="mer__section" id="features" aria-labelledby="features-h">
          <div className="mer__inner">
            <div className="mer__head mer__inview">
              <span className="mer__eyebrow">Product</span>
              <h2 className="mer__h2" id="features-h">Everything modern teams need, precisely composed.</h2>
              <p>One source of truth across every surface. Typed, fast, and observable — so you spend your time shipping, not stitching tools together.</p>
            </div>
            <div className="mer__bento">
              {features.map((f) => (
                <article key={f.t} className={`mer__card mer__inview ${f.cls}`}>
                  <span className="mer__card-icon" aria-hidden="true">{f.icon}</span>
                  <div>
                    <span className="mer__card-tag">{f.tag}</span>
                    <h3 style={{ marginBlockStart: "0.5rem" }}>{f.t}</h3>
                    <p style={{ marginBlockStart: "0.55rem" }}>{f.b}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="mer__section" id="stats" aria-labelledby="stats-h">
          <div className="mer__inner">
            <div className="mer__head mer__inview">
              <span className="mer__eyebrow">Performance</span>
              <h2 className="mer__h2" id="stats-h">Numbers your customers can feel.</h2>
            </div>
            <div className="mer__stats">
              {stats.map((s) => (
                <div key={s.label} className="mer__stat mer__inview">
                  <div className="mer__stat-num">{s.grad ? <span>{s.num}</span> : s.num}</div>
                  <small>{s.label}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PROCESS */}
        <section className="mer__section" id="process" aria-labelledby="process-h">
          <div className="mer__inner">
            <div className="mer__head mer__inview">
              <span className="mer__eyebrow">How it works</span>
              <h2 className="mer__h2" id="process-h">From repo to production in three steps.</h2>
            </div>
            <div className="mer__steps">
              {steps.map((s) => (
                <div key={s.t} className="mer__step mer__inview">
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="mer__section" id="story" aria-label="Testimonial">
          <div className="mer__inner">
            <div className="mer__quote mer__inview">
              <blockquote>
                &ldquo;We replaced four tools with Meridian and shipped our redesign in <em>nine days</em>.
                Our LCP dropped by half and the team has never moved faster.&rdquo;
              </blockquote>
              <cite>— Maya Okonkwo, VP Engineering · Helix Labs</cite>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mer__section" id="start">
          <div className="mer__inner">
            <div className="mer__cta mer__inview">
              <span className="mer__eyebrow">Get started</span>
              <h2 style={{ marginBlockStart: "1rem" }}>Ship your next idea on Meridian.</h2>
              <p>Free to start, no credit card. Deploy your first edge surface in under five minutes.</p>
              <div className="mer__cta-row" style={{ justifyContent: "center", marginBlockStart: 0 }}>
                <a className="mer__btn" href="#signup">Create free account <Arrow /></a>
                <a className="mer__btn mer__btn--ghost" href="#sales">Talk to sales</a>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mer__footer">
          <div className="mer__inner">
            <div className="mer__footer-grid">
              <div>
                <div className="mer__brand"><span className="mer__brand-mark" aria-hidden="true">M</span>Meridian</div>
                <p style={{ color: "var(--muted)", marginBlockStart: "1rem", maxInlineSize: "32ch" }}>
                  The precise platform for modern teams. One config, every surface — type-safe and edge-fast.
                </p>
              </div>
              <div>
                <h4>Product</h4>
                <ul>
                  <li><a href="#features">Platform</a></li>
                  <li><a href="#stats">Performance</a></li>
                  <li><a href="#pricing">Pricing</a></li>
                </ul>
              </div>
              <div>
                <h4>Company</h4>
                <ul>
                  <li><a href="#process">How it works</a></li>
                  <li><a href="#story">Customers</a></li>
                  <li><a href="#careers">Careers</a></li>
                </ul>
              </div>
              <div>
                <h4>Contact</h4>
                <ul>
                  <li><a href="mailto:hello@meridian.dev">hello@meridian.dev</a></li>
                  <li><a href="#top">meridian.dev</a></li>
                </ul>
              </div>
            </div>
            <div className="mer__footer-bottom">
              <span>© 2026 Meridian, Inc.</span>
              <span>Crafted, not templated.</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
