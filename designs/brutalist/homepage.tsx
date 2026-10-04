/**
 * "Brutalist" — a premium, code-built DesignPack homepage (neo-brutalist).
 * Paper-white canvas, hard black ink + THICK black borders, one acid-lime accent,
 * monospace labels + bold grotesque headlines. Hard (no-blur) drop-shadows, visible
 * grid, offset slab, marquee — confident and raw but legible. CSS-only visuals +
 * motion (NO 3D). Server-rendered for LCP. LOCKED light theme (no `dark:` variants).
 *
 * Selectable like any design via /admin/designs (slug "brutalist") → flows through
 * the template pipeline. Copy is English-first.
 */
import type { DesignHomepageProps } from "../types";
import { Archivo, Space_Grotesk, Space_Mono } from "next/font/google";
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

const features = [
  { icon: "■", t: "Brand systems with teeth", b: "Identity that refuses to blend in — type, color and grid engineered to be unmistakable at a glance.", cls: "bru__card--feature", n: "01" },
  { icon: "▶", t: "Sites that load like a punch", b: "Edge-rendered, INP-tuned, zero fluff. Speed you can feel.", cls: "bru__card--mid", n: "02" },
  { icon: "◆", t: "Commerce, no compromise", b: "Cart to checkout, built on the Cartwright engine.", cls: "bru__card--mid", n: "03" },
  { icon: "✦", t: "Motion with intent", b: "CSS-driven, accessible, never decorative for its own sake.", cls: "bru__card--narrow", n: "04" },
  { icon: "▲", t: "SEO + GEO", b: "Structured data and llms.txt — readable by Google and by machines.", cls: "bru__card--narrow", n: "05" },
  { icon: "●", t: "Ship & iterate", b: "Measure, test, repeat. We don't disappear at launch.", cls: "bru__card--narrow", n: "06" },
];

const stats = [
  { num: "120+", label: "Brands shipped" },
  { num: "48h", label: "Idea → live" },
  { num: "0.4s", label: "Median LCP" },
  { num: "100%", label: "Hand-built" },
];

const steps = [
  { t: "Strip it back", b: "We cut the noise. What is the one thing this brand must say? Everything else gets thrown out." },
  { t: "Build it raw", b: "Real code on the Cartwright engine — high-contrast, fast, and yours from the first commit." },
  { t: "Make it loud", b: "Launch, measure, and push harder. Distinctive doesn't mean done." },
];

export default function brutalistHomepage(_props: DesignHomepageProps) {
  return (
    <div
      className={`bru ${display.variable} ${grotesk.variable} ${mono.variable}`}
      style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "auto" }}
    >
      <div className="bru__wrap">
        {/* NAV */}
        <nav className="bru__nav" aria-label="Primary">
          <div className="bru__inner bru__navbar">
            <a className="bru__brand" href="#top">
              <span className="bru__brand-mark" aria-hidden="true">V</span>
              VOLTAGE
            </a>
            <div className="bru__navlinks">
              <a href="#work">Work</a>
              <a href="#process">Process</a>
              <a href="#stats">Results</a>
              <a href="#contact">Contact</a>
            </div>
            <a className="bru__btn" href="#contact">
              Start <Arrow />
            </a>
          </div>
        </nav>

        {/* HERO */}
        <header className="bru__hero" id="top">
          <span className="bru__hero-slab" aria-hidden="true" />
          <div className="bru__inner bru__hero-grid">
            <div>
              <span className="bru__eyebrow bru__reveal" data-d="1">Design Studio — No Filler</span>
              <h1 className="bru__h1 bru__reveal" data-d="2">
                We make brands<br />
                <span className="bru__outline">impossible</span> to<br />
                <mark>ignore.</mark>
              </h1>
              <p className="bru__lede bru__reveal" data-d="3">
                VOLTAGE is a neo-brutalist studio for brands that refuse to be
                wallpaper. Hard edges, loud type, fast code. We build the thing
                everyone screenshots.
              </p>
              <div className="bru__cta-row bru__reveal" data-d="4">
                <a className="bru__btn" href="#contact">Start a project <Arrow /></a>
                <a className="bru__btn bru__btn--ghost" href="#work">See the work</a>
              </div>
              <div className="bru__hero-meta bru__reveal" data-d="5">
                <div><div className="bru__num"><span>48</span>h</div><small>Idea → live</small></div>
                <div><div className="bru__num"><span>3×</span></div><small>More attention</small></div>
                <div><div className="bru__num"><span>0</span></div><small>Templates used</small></div>
              </div>
            </div>
          </div>
        </header>

        {/* MARQUEE */}
        <div className="bru__marquee" aria-hidden="true">
          <div className="bru__marquee-track">
            {["Branding", "Web", "Commerce", "Motion", "Type", "Art Direction", "SEO + GEO", "Strategy",
              "Branding", "Web", "Commerce", "Motion", "Type", "Art Direction", "SEO + GEO", "Strategy"].map((x, i) => (
              <span key={i}>{x} ✦</span>
            ))}
          </div>
        </div>

        {/* FEATURES / BENTO */}
        <section className="bru__section" id="work" aria-labelledby="work-h">
          <div className="bru__inner">
            <div className="bru__head bru__inview">
              <span className="bru__eyebrow">What we do</span>
              <h2 className="bru__h2" id="work-h">Loud on purpose.</h2>
              <p>We don&rsquo;t do quiet. Every project leaves with a voice, a grid, and the speed to back it up.</p>
            </div>
            <div className="bru__bento">
              {features.map((f) => (
                <article key={f.t} className={`bru__card bru__inview ${f.cls}`}>
                  <span className="bru__card-num" aria-hidden="true">{f.n}</span>
                  <span className="bru__card-icon" aria-hidden="true">{f.icon}</span>
                  <div>
                    <h3>{f.t}</h3>
                    <p>{f.b}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="bru__section bru__section--plain" id="stats" aria-label="Results">
          <div className="bru__inner">
            <div className="bru__stats bru__inview">
              {stats.map((s) => (
                <div key={s.label} className="bru__stat">
                  <div className="bru__stat-num">{s.num}</div>
                  <div className="bru__stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PROCESS */}
        <section className="bru__section" id="process" aria-labelledby="process-h">
          <div className="bru__inner">
            <div className="bru__head bru__inview">
              <span className="bru__eyebrow">How it works</span>
              <h2 className="bru__h2" id="process-h">Three moves. No fog.</h2>
            </div>
            <div className="bru__steps">
              {steps.map((s) => (
                <div key={s.t} className="bru__step bru__inview">
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="bru__section" aria-label="Testimonial">
          <div className="bru__inner">
            <div className="bru__quote bru__inview">
              <blockquote>
                &ldquo;VOLTAGE gave us a brand people actually <em>remember</em>. Our site is the one competitors screenshot.&rdquo;
              </blockquote>
              <cite>— Mara Vance, founder · DECK Supply Co.</cite>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="bru__section bru__section--plain" id="contact">
          <div className="bru__inner">
            <div className="bru__cta bru__inview">
              <span className="bru__eyebrow">Got a project?</span>
              <h2>Let&rsquo;s make something <mark>loud.</mark></h2>
              <p>Tell us what you&rsquo;re building. We reply within one business day — no auto-responders.</p>
              <a className="bru__btn" href="mailto:hello@voltage.studio">Email the studio <Arrow /></a>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="bru__footer">
          <div className="bru__inner">
            <div className="bru__footer-grid">
              <div>
                <div className="bru__brand"><span className="bru__brand-mark" aria-hidden="true">V</span>VOLTAGE</div>
                <p style={{ color: "var(--text-dim)", marginBlockStart: "1rem", maxInlineSize: "32ch", fontFamily: "var(--font-mono)", fontSize: "0.86rem" }}>
                  Neo-brutalist design studio. Loud brands, fast code. Built on the Cartwright engine.
                </p>
              </div>
              <div>
                <h4>Studio</h4>
                <ul>
                  <li><a href="#work">Work</a></li>
                  <li><a href="#process">Process</a></li>
                  <li><a href="#stats">Results</a></li>
                </ul>
              </div>
              <div>
                <h4>Services</h4>
                <ul>
                  <li><a href="#work">Branding</a></li>
                  <li><a href="#work">Web &amp; Commerce</a></li>
                  <li><a href="#work">SEO &amp; GEO</a></li>
                </ul>
              </div>
              <div>
                <h4>Contact</h4>
                <ul>
                  <li><a href="mailto:hello@voltage.studio">hello@voltage.studio</a></li>
                  <li><a href="#top">voltage.studio</a></li>
                </ul>
              </div>
            </div>
            <div className="bru__footer-bottom">
              <span>© 2026 Voltage Studio</span>
              <span>Brutalist · not a template</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
