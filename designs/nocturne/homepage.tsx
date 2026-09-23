/**
 * "Nocturne" — a premium, code-built DesignPack homepage (dark ORGANIC luxe).
 * Midnight aubergine canvas, warm champagne gold accent, soft cream text;
 * flowing rounded organic shapes and soft glows. Built for a high-end
 * spirits / fragrance / architecture-studio voice.
 *
 * Hand-crafted components + a LOCKED dark theme (no `dark:` variants → no OS
 * dark-mode leak). Uses the shared palette-driven 3D aurora (DesignHero)
 * behind the hero, with a CSS-aurora gradient fallback painted underneath.
 * Server-rendered for LCP. Selectable like any design via /admin/designs
 * (slug "nocturne") → flows through the template pipeline.
 *
 * Copy is English-first (Cartwright customers are primarily English).
 */
import type { DesignHomepageProps } from "../types";
import { Fraunces, Manrope } from "next/font/google";
import { DesignHero } from "@/components/DesignHero";
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

const craft = [
  {
    icon: "❦",
    t: "Scent, distilled to a feeling",
    b: "Each composition begins with a memory and ends with a still, weightless presence. We chase the note you cannot name.",
    cls: "noc__card--feature",
  },
  { icon: "◐", t: "Slow maceration", b: "Naturals rested for months, never rushed. Time is the most expensive ingredient.", cls: "noc__card--mid" },
  { icon: "✶", t: "Small batches", b: "Numbered, signed, finite. We make less, on purpose.", cls: "noc__card--mid" },
  { icon: "❖", t: "Refillable vessels", b: "Hand-blown glass made to be kept and returned, not discarded.", cls: "noc__card--narrow" },
  { icon: "✦", t: "Single sourcing", b: "Direct from the field — orris, oud, rose de mai. Traceable to the row.", cls: "noc__card--narrow" },
  { icon: "☾", t: "Quiet sillage", b: "An aura, not an announcement. Made to be discovered up close.", cls: "noc__card--narrow" },
];

const steps = [
  { t: "The brief", b: "A conversation about a place, a person, an hour of the day. We listen before we blend." },
  { t: "The accord", b: "Dozens of trials over months until the structure holds its breath on the skin." },
  { t: "The reveal", b: "Bottled by hand, numbered, and delivered in a vessel made to outlast the scent." },
];

const stats = [
  { num: "18", suffix: "mo", label: "Average maceration before a fragrance leaves the atelier." },
  { num: "240", suffix: "", label: "Bottles per edition — and never a single one more." },
  { num: "97", suffix: "%", label: "Naturals by volume, sourced direct from growers we know by name." },
];

export default function NocturneHomepage(_props: DesignHomepageProps) {
  return (
    <div
      className={`noc ${display.variable} ${body.variable}`}
      style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "auto" }}
    >
      <div className="noc__wrap">
        {/* NAV */}
        <nav className="noc__nav" aria-label="Primary">
          <div className="noc__inner noc__navbar">
            <a className="noc__brand" href="#top">
              <span className="noc__brand-mark" aria-hidden="true">N</span>
              Maison <em>Noctuelle</em>
            </a>
            <div className="noc__navlinks">
              <a href="#craft">The craft</a>
              <a href="#process">Process</a>
              <a href="#story">Atelier</a>
              <a href="#contact">Enquire</a>
            </div>
            <a className="noc__btn" href="#contact">
              Request the catalogue <Arrow />
            </a>
          </div>
        </nav>

        {/* HERO */}
        <header className="noc__hero" id="top">
          {/* instant-paint CSS aurora fallback (always visible) */}
          <div className="noc__aurora" aria-hidden="true" />
          {/* palette-driven 3D aurora — renders nothing when unsupported */}
          <DesignHero className="noc__three" intensity={0.7} />
          <div className="noc__inner noc__hero-grid">
            <div>
              <span className="noc__eyebrow noc__reveal" data-d="1">Parfumeur · since the small hours</span>
              <h1 className="noc__h1 noc__reveal" data-d="2">
                Fragrance for the<br />hours that <em>linger.</em>
              </h1>
              <p className="noc__lede noc__reveal" data-d="3">
                Maison Noctuelle composes nocturnal perfume in small, numbered
                editions — slow-macerated naturals, hand-blown vessels, and a
                sillage that whispers rather than declares.
              </p>
              <div className="noc__cta-row noc__reveal" data-d="4">
                <a className="noc__btn" href="#craft">Discover the maison <Arrow /></a>
                <a className="noc__btn noc__btn--ghost" href="#story">Visit the atelier</a>
              </div>
              <div className="noc__hero-meta noc__reveal" data-d="5">
                <div><div className="noc__num"><span>18</span> mo</div><small>Macerated</small></div>
                <div><div className="noc__num"><span>240</span></div><small>Per edition</small></div>
                <div><div className="noc__num"><span>1</span> place</div><small>Each scent</small></div>
              </div>
            </div>
          </div>
        </header>

        {/* MARQUEE */}
        <div className="noc__marquee" aria-hidden="true">
          <div className="noc__marquee-track">
            {["Orris", "Oud", "Rose de mai", "Ambergris", "Vetiver", "Tonka", "Frankincense", "Iris pallida",
              "Orris", "Oud", "Rose de mai", "Ambergris", "Vetiver", "Tonka", "Frankincense", "Iris pallida"].map((x, i) => (
              <span key={i}>{x} ·</span>
            ))}
          </div>
        </div>

        {/* CRAFT / BENTO */}
        <section className="noc__section" id="craft" aria-labelledby="craft-h">
          <div className="noc__inner">
            <div className="noc__head noc__inview">
              <span className="noc__eyebrow">The craft</span>
              <h2 className="noc__h2" id="craft-h">Patience, pressed into <em>glass.</em></h2>
              <p>We are a maison of subtraction — fewer ingredients, longer rests, smaller editions. What remains is a scent with nothing to prove.</p>
            </div>
            <div className="noc__bento">
              {craft.map((s) => (
                <article key={s.t} className={`noc__card noc__inview ${s.cls}`}>
                  <span className="noc__card-icon" aria-hidden="true">{s.icon}</span>
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.b}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="noc__section" aria-label="By the numbers">
          <div className="noc__inner">
            <div className="noc__stats noc__inview">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="noc__stat-num"><em>{s.num}</em>{s.suffix}</div>
                  <p className="noc__stat-label">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PROCESS */}
        <section className="noc__section" id="process" aria-labelledby="process-h">
          <div className="noc__inner">
            <div className="noc__head noc__inview">
              <span className="noc__eyebrow">Process</span>
              <h2 className="noc__h2" id="process-h">From a brief to a <em>bottle.</em></h2>
            </div>
            <div className="noc__steps">
              {steps.map((s) => (
                <div key={s.t} className="noc__step noc__inview">
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="noc__section" id="story" aria-label="Testimonial">
          <div className="noc__inner noc__quote noc__inview">
            <blockquote>
              &ldquo;It does not enter a room. It waits to be <em>found</em> — and then you cannot forget it.&rdquo;
            </blockquote>
            <cite>— Élise Marchand, Editor-at-large · The Quiet Hours</cite>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="noc__section" id="contact">
          <div className="noc__inner">
            <div className="noc__cta noc__inview">
              <span className="noc__eyebrow" style={{ justifyContent: "center" }}>By appointment</span>
              <h2>Be the first to know each edition.</h2>
              <p>The catalogue is sent quietly, ahead of every release. Tell us where to find you.</p>
              <a className="noc__btn" href="mailto:atelier@maison-noctuelle.com">Request the catalogue <Arrow /></a>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="noc__footer">
          <div className="noc__inner">
            <div className="noc__footer-grid">
              <div>
                <div className="noc__brand"><span className="noc__brand-mark" aria-hidden="true">N</span>Maison <em>Noctuelle</em></div>
                <p style={{ color: "var(--text-dim)", marginBlockStart: "1.1rem", maxInlineSize: "32ch" }}>
                  Nocturnal perfume, composed in small numbered editions. Built on the Cartwright engine.
                </p>
              </div>
              <div>
                <h4>The maison</h4>
                <ul>
                  <li><a href="#craft">The craft</a></li>
                  <li><a href="#process">Process</a></li>
                  <li><a href="#story">Atelier</a></li>
                </ul>
              </div>
              <div>
                <h4>Editions</h4>
                <ul>
                  <li><a href="#craft">Current release</a></li>
                  <li><a href="#craft">The archive</a></li>
                  <li><a href="#contact">Refills</a></li>
                </ul>
              </div>
              <div>
                <h4>Enquire</h4>
                <ul>
                  <li><a href="mailto:atelier@maison-noctuelle.com">atelier@maison-noctuelle.com</a></li>
                  <li><a href="#top">maison-noctuelle.com</a></li>
                </ul>
              </div>
            </div>
            <div className="noc__footer-bottom">
              <span>© 2026 Maison Noctuelle</span>
              <span>Composed by hand · <em>not a template</em></span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
