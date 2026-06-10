/**
 * "Engineered" — a premium, code-built DesignPack homepage (dark-luxe agency).
 * Hand-crafted components + a LOCKED dark theme (no `dark:` variants → no OS
 * dark-mode leak), a real three.js GLSL hero, CSS-only motion (scroll-driven as
 * progressive enhancement). Server-rendered for LCP. Selectable like any design
 * via /admin/designs (slug "engineered") → flows through the template pipeline.
 *
 * Copy is English-first (Cartwright customers are primarily English).
 */
import type { DesignHomepageProps } from "../types";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import HeroCanvas from "./HeroCanvas";
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

const services = [
  { icon: "◇", t: "AI-first commerce", b: "Stores built agent-ready from the first commit — ACP & A2A built in, not bolted on.", cls: "studio__card--feature", feature: true },
  { icon: "⚡", t: "Lightning-fast engineering", b: "Edge rendering and an INP-optimized checkout. Speed measured in conversion.", cls: "studio__card--mid" },
  { icon: "✦", t: "Design that sells", b: "Custom, on-brand — no templates.", cls: "studio__card--mid" },
  { icon: "⊹", t: "SEO & GEO", b: "Structured data, llms.txt and citable sections — visible to both Google and AI.", cls: "studio__card--narrow" },
  { icon: "◈", t: "Agentic commerce", b: "Signed agent cards, negotiation and escrow — ready for the agentic web.", cls: "studio__card--narrow" },
  { icon: "↻", t: "Run & grow", b: "Measurement, experiments and continuous optimization after launch.", cls: "studio__card--narrow" },
];

const steps = [
  { t: "Map", b: "We understand your business, your customers and your goals — before a single line of code." },
  { t: "Build", b: "An on-brand store on the Cartwright engine. Governed, fast, and yours from day one." },
  { t: "Scale", b: "AI-driven growth, measurement and continuous optimization that keeps pace with your business." },
];

export default function EngineeredHomepage(_props: DesignHomepageProps) {
  return (
    <div
      className={`studio ${display.variable} ${body.variable} ${mono.variable}`}
      style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "auto" }}
    >
      <div className="studio__wrap">
        {/* NAV */}
        <nav className="studio__nav" aria-label="Primary">
          <div className="studio__inner studio__navbar">
            <a className="studio__brand" href="#top">
              <span className="studio__brand-mark" aria-hidden="true">T</span>
              Teloz
            </a>
            <div className="studio__navlinks">
              <a href="#services">Services</a>
              <a href="#process">Process</a>
              <a href="#work">Work</a>
              <a href="#contact">Contact</a>
            </div>
            <a className="studio__btn" href="#contact">
              Book a call <Arrow />
            </a>
          </div>
        </nav>

        {/* HERO */}
        <header className="studio__hero" id="top">
          <div className="studio__aurora" aria-hidden="true" />
          <HeroCanvas />
          <div className="studio__inner studio__hero-grid">
            <div>
              <span className="studio__eyebrow studio__reveal" data-d="1">AI · Commerce · Engineering</span>
              <h1 className="studio__h1 studio__reveal" data-d="2">
                We build commerce<br />that <em>thinks.</em>
              </h1>
              <p className="studio__lede studio__reveal" data-d="3">
                Teloz is the agency that fuses lightning-fast engineering with
                AI-driven growth. From idea to a live, agent-ready store — in
                days, not months.
              </p>
              <div className="studio__cta-row studio__reveal" data-d="4">
                <a className="studio__btn" href="#contact">Start a project <Arrow /></a>
                <a className="studio__btn studio__btn--ghost" href="#work">See our work</a>
              </div>
              <div className="studio__hero-meta studio__reveal" data-d="5">
                <div><div className="studio__num"><span>48</span>h</div><small>Idea → live</small></div>
                <div><div className="studio__num"><span>3×</span></div><small>Conversion</small></div>
                <div><div className="studio__num"><span>100%</span></div><small>Agent-ready</small></div>
              </div>
            </div>
          </div>
        </header>

        {/* MARQUEE */}
        <div className="studio__marquee" aria-hidden="true">
          <div className="studio__marquee-track">
            {["Next.js 16", "React 19", "Cartwright Engine", "Stripe", "Edge Runtime", "Agentic Commerce Protocol", "View Transitions", "AI-First",
              "Next.js 16", "React 19", "Cartwright Engine", "Stripe", "Edge Runtime", "Agentic Commerce Protocol", "View Transitions", "AI-First"].map((x, i) => (
              <span key={i}>{x} ✦</span>
            ))}
          </div>
        </div>

        {/* SERVICES / BENTO */}
        <section className="studio__section" id="services" aria-labelledby="services-h">
          <div className="studio__inner">
            <div className="studio__head studio__inview">
              <span className="studio__eyebrow">Services</span>
              <h2 className="studio__h2" id="services-h">The whole engine — in one agency.</h2>
              <p>We don&rsquo;t just build stores. We build commerce systems that are fast, on-brand, and ready for the agentic web.</p>
            </div>
            <div className="studio__bento">
              {services.map((s) => (
                <article key={s.t} className={`studio__card studio__inview ${s.cls}`}>
                  <span className="studio__card-icon" aria-hidden="true">{s.icon}</span>
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.b}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* PROCESS */}
        <section className="studio__section" id="process" aria-labelledby="process-h">
          <div className="studio__inner">
            <div className="studio__head studio__inview">
              <span className="studio__eyebrow">Process</span>
              <h2 className="studio__h2" id="process-h">Three steps. No surprises.</h2>
            </div>
            <div className="studio__steps">
              {steps.map((s) => (
                <div key={s.t} className="studio__step studio__inview">
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="studio__section" id="work" aria-label="Testimonial">
          <div className="studio__inner studio__quote studio__inview">
            <blockquote>
              &ldquo;Teloz took us from idea to an <em>agent-ready</em> store in under a week — and it sells.&rdquo;
            </blockquote>
            <cite>— Sofie Lind, founder · Nordlys Studio</cite>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="studio__section" id="contact">
          <div className="studio__inner">
            <div className="studio__cta studio__inview">
              <span className="studio__eyebrow" style={{ justifyContent: "center" }}>Ready when you are</span>
              <h2>Let&rsquo;s build something that sells.</h2>
              <p>Tell us about your project — we&rsquo;ll reply within one business day.</p>
              <a className="studio__btn" href="mailto:hej@teloz.net">Email us <Arrow /></a>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="studio__footer">
          <div className="studio__inner">
            <div className="studio__footer-grid">
              <div>
                <div className="studio__brand"><span className="studio__brand-mark" aria-hidden="true">T</span>Teloz</div>
                <p style={{ color: "var(--text-dim)", marginBlockStart: "1rem", maxInlineSize: "30ch" }}>
                  AI &amp; Modern Commerce Agency. Built on the Cartwright engine.
                </p>
              </div>
              <div>
                <h4>Services</h4>
                <ul>
                  <li><a href="#services">AI-first commerce</a></li>
                  <li><a href="#services">Agentic commerce</a></li>
                  <li><a href="#services">SEO &amp; GEO</a></li>
                </ul>
              </div>
              <div>
                <h4>Agency</h4>
                <ul>
                  <li><a href="#process">Process</a></li>
                  <li><a href="#work">Work</a></li>
                  <li><a href="#contact">Contact</a></li>
                </ul>
              </div>
              <div>
                <h4>Contact</h4>
                <ul>
                  <li><a href="mailto:hej@teloz.net">hej@teloz.net</a></li>
                  <li><a href="#top">teloz.net</a></li>
                </ul>
              </div>
            </div>
            <div className="studio__footer-bottom">
              <span>© 2026 Teloz ApS</span>
              <span>Engineered · not a template</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
