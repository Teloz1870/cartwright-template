/**
 * "Editorial Ink" — a premium, code-built DesignPack homepage (light editorial /
 * magazine aesthetic). Warm paper canvas, deep ink, a single restrained oxblood
 * accent. Characterful serif display (Fraunces) + clean grotesque body (Hanken
 * Grotesk) + mono eyebrow (Space Mono). Generous whitespace, hairline rules,
 * drop-cap lede, large pull-quote, asymmetric columns, mono byline/issue labels.
 *
 * Hand-crafted server component (LCP-friendly) + a LOCKED light theme (no `dark:`
 * variants → no OS dark-mode leak). CSS-only motion (load reveals + scroll-driven
 * as progressive enhancement). No 3D. Selectable like any design via
 * /admin/designs (slug "editorial-ink") → flows through the template pipeline.
 *
 * Copy is English-first (Cartwright customers are primarily English).
 */
import type { DesignHomepageProps } from "../types";
import { Fraunces, Hanken_Grotesk, Space_Mono } from "next/font/google";
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

const features = [
  {
    no: "01",
    t: "Words that earn the page",
    b: "Long-form essays, brand manifestos, and considered reporting — copy crafted to be read, not skimmed. Every line has a reason to exist.",
  },
  {
    no: "02",
    t: "Typography as identity",
    b: "A serif with character set against a quiet grotesque. Hierarchy, rhythm, and rules that feel printed rather than templated.",
  },
  {
    no: "03",
    t: "Built to be cited",
    b: "Structured, fast, and discoverable — by readers, by search, and by the new generation of AI that quotes its sources.",
  },
];

const stats = [
  { label: "Founded", value: "MMXIX", em: false },
  { label: "Essays published", value: "240", em: true },
  { label: "Avg. read time", value: "7m", em: false },
  { label: "Print + digital", value: "100%", em: true },
];

export default function EditorialInkHomepage(_props: DesignHomepageProps) {
  return (
    <div
      className={`edi ${display.variable} ${body.variable} ${mono.variable}`}
      style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "auto" }}
    >
      <div className="edi__wrap">
        {/* NAV */}
        <nav className="edi__nav" aria-label="Primary">
          <div className="edi__inner edi__navbar">
            <a className="edi__brand" href="#top">
              The&nbsp;<em>Marginalia</em>
              <span className="edi__brand-issue">Issue 14</span>
            </a>
            <div className="edi__navlinks">
              <a href="#features">Sections</a>
              <a href="#dispatch">Dispatch</a>
              <a href="#voices">Voices</a>
              <a href="#subscribe">Subscribe</a>
            </div>
            <a className="edi__btn" href="#subscribe">
              Subscribe <Arrow />
            </a>
          </div>
        </nav>

        {/* HERO */}
        <header className="edi__hero" id="top">
          <div className="edi__inner">
            <div className="edi__masthead">
              <span>The Marginalia · A Quarterly</span>
              <span>Essays · Reporting · Ideas</span>
              <span>Spring 2026</span>
            </div>
            <div className="edi__hero-grid">
              <div>
                <span className="edi__eyebrow edi__reveal" data-d="1">The cover essay</span>
                <h1 className="edi__h1 edi__reveal" data-d="2">
                  In praise of the<br />
                  <em>slow</em> sentence.
                </h1>
                <div className="edi__cta-row edi__reveal" data-d="4">
                  <a className="edi__btn" href="#dispatch">Read this issue <Arrow /></a>
                  <a className="edi__btn edi__btn--ghost" href="#subscribe">Get the newsletter</a>
                </div>
              </div>
              <aside className="edi__hero-aside edi__reveal" data-d="3">
                <p className="edi__lede">
                  Between the headline and the footnote lives the real work — the
                  margin where ideas are tested, argued, and made to mean
                  something. We publish for readers who still believe a paragraph
                  can change a mind.
                </p>
              </aside>
            </div>

            <div className="edi__byline edi__reveal" data-d="5">
              <div>
                <div className="edi__num"><span>4×</span></div>
                <small>Issues a year</small>
              </div>
              <div>
                <div className="edi__num"><span>0</span></div>
                <small>Ads on the page</small>
              </div>
              <div>
                <div className="edi__num">By <span>writers</span></div>
                <small>Not algorithms</small>
              </div>
            </div>
          </div>
        </header>

        {/* MARQUEE / STANDFIRST */}
        <div className="edi__marquee" aria-hidden="true">
          <div className="edi__marquee-track">
            {["Reporting", "Long reads", "The interview", "Field notes", "Criticism", "Letters", "The archive", "Marginalia",
              "Reporting", "Long reads", "The interview", "Field notes", "Criticism", "Letters", "The archive", "Marginalia"].map((x, i) => (
              <span key={i}>{x}</span>
            ))}
          </div>
        </div>

        {/* FEATURES / COLUMNS */}
        <section className="edi__section" id="features" aria-labelledby="features-h">
          <div className="edi__inner">
            <div className="edi__head edi__inview">
              <span className="edi__eyebrow">What we make</span>
              <h2 className="edi__h2" id="features-h">A publication, not a <em>feed</em>.</h2>
              <p>
                Three principles hold every issue together. They are old-fashioned
                on purpose — and, we&rsquo;d argue, overdue for a return.
              </p>
            </div>
            <div className="edi__columns edi__columns--feature">
              {features.map((f) => (
                <article key={f.no} className="edi__col edi__inview">
                  <span className="edi__col-no">{f.no}</span>
                  <h3>{f.t}</h3>
                  <p>{f.b}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* STATS LEDGER */}
        <section className="edi__section" id="dispatch" aria-labelledby="dispatch-h">
          <div className="edi__inner">
            <div className="edi__head edi__inview">
              <span className="edi__eyebrow">By the numbers</span>
              <h2 className="edi__h2" id="dispatch-h">A small masthead, a long memory.</h2>
            </div>
            <div className="edi__ledger edi__inview">
              {stats.map((s) => (
                <div key={s.label} className="edi__ledger-cell">
                  <h4>{s.label}</h4>
                  <div className="edi__stat">{s.em ? <em>{s.value}</em> : s.value}</div>
                  <p>
                    {s.label === "Founded" && "Independent and reader-funded from the first issue."}
                    {s.label === "Essays published" && "Each one edited, fact-checked, and built to last."}
                    {s.label === "Avg. read time" && "Long enough to say something worth keeping."}
                    {s.label === "Print + digital" && "Set for the page first, then for the screen."}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PULL-QUOTE / VOICES */}
        <section className="edi__section" id="voices" aria-label="Testimonial">
          <div className="edi__inner edi__quote edi__inview">
            <blockquote>
              A magazine you actually finish reading — and then go back to
              <strong> underline.</strong>
            </blockquote>
            <cite>— Eleanor Vance, contributing editor · The Atlantic Quarterly</cite>
          </div>
        </section>

        {/* SUBSCRIBE / CTA */}
        <section className="edi__section" id="subscribe">
          <div className="edi__inner">
            <div className="edi__cta edi__inview">
              <span className="edi__eyebrow" style={{ justifyContent: "center" }}>Join the readership</span>
              <h2>Subscribe, and never miss a <em>margin</em>.</h2>
              <p>
                Four issues a year, posted to your door and your inbox. No
                paywalls, no tracking, no noise — just the writing.
              </p>
              <a className="edi__btn" href="mailto:hello@marginalia.press">Start a subscription <Arrow /></a>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="edi__footer">
          <div className="edi__inner">
            <div className="edi__footer-grid">
              <div>
                <div className="edi__brand">The&nbsp;<em>Marginalia</em></div>
                <p className="edi__footer-blurb">
                  An independent quarterly of essays, reporting, and ideas.
                  Reader-funded. Set in ink, built for the long read.
                </p>
              </div>
              <div>
                <h4>The magazine</h4>
                <ul>
                  <li><a href="#features">Sections</a></li>
                  <li><a href="#dispatch">This issue</a></li>
                  <li><a href="#voices">The archive</a></li>
                </ul>
              </div>
              <div>
                <h4>Masthead</h4>
                <ul>
                  <li><a href="#top">Editors</a></li>
                  <li><a href="#features">Contributors</a></li>
                  <li><a href="#subscribe">Pitch us</a></li>
                </ul>
              </div>
              <div>
                <h4>Contact</h4>
                <ul>
                  <li><a href="mailto:hello@marginalia.press">hello@marginalia.press</a></li>
                  <li><a href="#top">marginalia.press</a></li>
                </ul>
              </div>
            </div>
            <div className="edi__footer-bottom">
              <span>© 2026 The Marginalia Press</span>
              <span>Set in ink · not a template</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
