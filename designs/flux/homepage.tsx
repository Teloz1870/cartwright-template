/**
 * "Flux" — homepage BODY (vibrant developer-first payments / infra SaaS). The
 * nav, footer, `.flux` root + fonts now live in the site-wide Shell + chrome
 * (./chrome.tsx), so the look reaches every page — this file is just the
 * homepage's sections, rendered inside `<main>` within the FluxShell.
 * Server-rendered, CSS-only, LOCKED light theme (no `dark:` variants → no OS
 * dark-mode leak). CSS-only visuals: a bold animated multi-hue gradient mesh
 * with a signature angled clip, crisp white hairline cards, and syntax-tinted
 * mono code. No 3D / no three.js. Copy is English-first.
 */
import type { DesignHomepageProps } from "../types";
import "./flux.css";

const Chevron = () => (
  <span className="flux__chev" aria-hidden="true">
    ›
  </span>
);

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M3.5 9.5l3.2 3.2L14.5 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.5" y="4.5" width="15" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    t: "Unified payments API",
    b: "One integration for cards, wallets, and bank debits across 135+ currencies. The same request shape everywhere — no per-method branching.",
    tag: "Payments",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M11 2.5L4 11h5l-1 6.5L16 9h-5l0-6.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
    t: "Built for developers",
    b: "Typed SDKs in every language, idempotent endpoints, and a sandbox that mirrors production byte-for-byte. Ship in an afternoon.",
    tag: "DX",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2.5l6.5 3v4.5c0 4-2.8 6.4-6.5 7.5C6.3 16.4 3.5 14 3.5 10V5.5l6.5-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
    t: "Fraud, handled",
    b: "Adaptive risk scoring trained on a global network blocks bad actors and waves good customers through — tuned automatically.",
    tag: "Trust",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 13l4-5 3.5 3L17 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="3" cy="13" r="1.4" fill="currentColor" />
        <circle cx="17" cy="5" r="1.4" fill="currentColor" />
      </svg>
    ),
    t: "Revenue analytics",
    b: "Live dashboards for authorization rates, churn, and net revenue — with cohort drill-downs your finance team will actually use.",
    tag: "Insight",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    t: "Subscriptions & billing",
    b: "Metered usage, proration, dunning, and tax — all wired in. Model any pricing without rebuilding your billing stack.",
    tag: "Billing",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2.5v15M2.5 10h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    t: "Global payouts",
    b: "Send money to contractors, sellers, and partners in 45 countries from a single balance — with compliance built in.",
    tag: "Connect",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 10l2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    t: "Compliance, certified",
    b: "PCI DSS Level 1, SOC 2 Type II, and SCA out of the box. We carry the audit burden so you don't have to.",
    tag: "Security",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5 7.5L2.5 10 5 12.5M15 7.5L17.5 10 15 12.5M11.5 4.5l-3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    t: "Webhooks & events",
    b: "Signed, retried, and replayable event streams keep your systems in sync — with a CLI to test them locally.",
    tag: "Platform",
  },
];

const stats = [
  { num: "99.999%", label: "API uptime" },
  { num: "47ms", label: "Median latency" },
  { num: "135+", label: "Currencies" },
  { num: "$1.2T", label: "Processed yearly" },
];

const logos = ["Northwind", "Helix", "Lumen", "Cobalt", "Vantage", "Quartz"];

export default function FluxHomepage(_props: DesignHomepageProps) {
  return (
    <>
      {/* HERO */}
        <header className="flux__hero" id="top">
          <div className="flux__hero-mesh" aria-hidden="true" />
          <div className="flux__hero-grain" aria-hidden="true" />
          <div className="flux__inner flux__hero-grid">
            {/* left: copy */}
            <div>
              <span className="flux__pill flux__reveal" data-d="1">
                <span className="flux__dot" aria-hidden="true" />
                <strong>New</strong>&nbsp;— Instant bank payouts now live in 45 countries
              </span>
              <h1 className="flux__h1 flux__reveal" data-d="2">
                Payments infrastructure for{" "}
                <span className="flux__grad">the internet.</span>
              </h1>
              <p className="flux__lede flux__reveal" data-d="3">
                Flux is the unified platform for online payments, billing, and global money movement.
                Millions of businesses — from ambitious startups to public companies — build on one
                developer-first API.
              </p>
              <div className="flux__cta-row flux__reveal" data-d="4">
                <a className="flux__btn" href="#start">
                  Start now <Chevron />
                </a>
                <a className="flux__btn flux__btn--ghost" href="#sales">
                  Contact sales
                </a>
              </div>
            </div>

            {/* right: code card */}
            <div className="flux__code flux__reveal" data-d="5" aria-hidden="true">
              <div className="flux__code-bar">
                <span className="flux__code-tab" data-active="true">
                  charge.js
                </span>
                <span className="flux__code-tab">curl</span>
                <span className="flux__code-tab">python</span>
                <span className="flux__code-dot">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <pre className="flux__code-body">
{`> `}<span className="tk-com">{`// Create a payment in 8 lines`}</span>{`
`}<span className="tk-kw">const</span>{` flux = `}<span className="tk-fn">require</span>{`(`}<span className="tk-str">{`'flux'`}</span>{`)(`}<span className="tk-str">{`'sk_live_…'`}</span>{`);

`}<span className="tk-kw">const</span>{` intent = `}<span className="tk-kw">await</span>{` flux.payments.`}<span className="tk-fn">create</span>{`({
  `}<span className="tk-prop">amount</span>{`: `}<span className="tk-num">4200</span>{`,
  `}<span className="tk-prop">currency</span>{`: `}<span className="tk-str">{`'usd'`}</span>{`,
  `}<span className="tk-prop">methods</span>{`: [`}<span className="tk-str">{`'card'`}</span>{`, `}<span className="tk-str">{`'wallet'`}</span>{`],
  `}<span className="tk-prop">capture</span>{`: `}<span className="tk-kw">true</span>{`,
});

`}<span className="tk-fn">console</span>{`.`}<span className="tk-fn">log</span>{`(intent.`}<span className="tk-prop">status</span>{`); `}<span className="tk-com">{`// → 'succeeded'`}</span></pre>
            </div>
          </div>
        </header>

        {/* LOGOS */}
        <section className="flux__logos" aria-label="Trusted by">
          <div className="flux__inner">
            <p>Trusted by ambitious companies of every size</p>
            <div className="flux__logos-row">
              {logos.map((x) => (
                <span key={x} className="flux__logo">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  {x}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="flux__section" id="features" aria-labelledby="features-h">
          <div className="flux__inner">
            <div className="flux__head flux__inview">
              <span className="flux__eyebrow">A complete platform</span>
              <h2 className="flux__h2" id="features-h">
                One stack for the entire money lifecycle.
              </h2>
              <p>
                Accept payments, run subscriptions, fight fraud, and pay out globally — all from a single
                integration that your engineers will actually enjoy building on.
              </p>
            </div>
            <div className="flux__grid">
              {features.map((f) => (
                <article key={f.t} className="flux__card flux__inview">
                  <span className="flux__card-icon" aria-hidden="true">
                    {f.icon}
                  </span>
                  <div>
                    <h3>{f.t}</h3>
                    <p style={{ marginBlockStart: "0.5rem" }}>{f.b}</p>
                  </div>
                  <span className="flux__card-tag">{f.tag}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* STAT BAND */}
        <section className="flux__section" id="stats">
          <div className="flux__inner">
            <div className="flux__statband flux__inview">
              <div className="flux__statband-head">
                <span className="flux__eyebrow">Built for scale</span>
                <h2>Numbers your finance team can bank on.</h2>
              </div>
              <div className="flux__stats">
                {stats.map((s) => (
                  <div key={s.label} className="flux__stat">
                    <div className="flux__stat-num">{s.num}</div>
                    <small>{s.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* DEVELOPER SPLIT */}
        <section className="flux__section" id="developers" aria-labelledby="dev-h">
          <div className="flux__inner">
            <div className="flux__split">
              <div className="flux__split-copy flux__inview">
                <span className="flux__eyebrow">For developers</span>
                <h2 className="flux__h2" id="dev-h" style={{ marginBlockStart: "0.9rem" }}>
                  An API you can hold in your head.
                </h2>
                <p>
                  Predictable resources, idempotent writes, and exhaustive types. Test against a sandbox that
                  behaves exactly like production, then promote with confidence.
                </p>
                <ul className="flux__checklist">
                  <li>
                    <Check />
                    <span>
                      <strong>Typed SDKs</strong> for Node, Python, Go, Ruby, PHP, and Java.
                    </span>
                  </li>
                  <li>
                    <Check />
                    <span>
                      <strong>Idempotency keys</strong> on every write — safe retries, no double charges.
                    </span>
                  </li>
                  <li>
                    <Check />
                    <span>
                      <strong>A local CLI</strong> that streams events and replays webhooks in real time.
                    </span>
                  </li>
                </ul>
                <div className="flux__cta-row">
                  <a className="flux__btn" href="#docs">
                    Read the docs <Chevron />
                  </a>
                </div>
              </div>

              <div className="flux__code flux__inview" aria-hidden="true">
                <div className="flux__code-bar">
                  <span className="flux__code-tab" data-active="true">
                    subscribe.py
                  </span>
                  <span className="flux__code-tab">node</span>
                  <span className="flux__code-dot">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <pre className="flux__code-body">
{``}<span className="tk-kw">import</span>{` flux

flux.`}<span className="tk-prop">api_key</span>{` = `}<span className="tk-str">{`'sk_live_…'`}</span>{`

`}<span className="tk-com"># A metered subscription, prorated</span>{`
sub = flux.Subscription.`}<span className="tk-fn">create</span>{`(
    `}<span className="tk-prop">customer</span>{`=`}<span className="tk-str">{`'cus_PiXel9'`}</span>{`,
    `}<span className="tk-prop">price</span>{`=`}<span className="tk-str">{`'price_pro_seat'`}</span>{`,
    `}<span className="tk-prop">quantity</span>{`=`}<span className="tk-num">12</span>{`,
    `}<span className="tk-prop">proration</span>{`=`}<span className="tk-kw">True</span>{`,
)

`}<span className="tk-fn">print</span>{`(sub.status)  `}<span className="tk-com"># → active</span></pre>
              </div>
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="flux__section" id="story" aria-label="Testimonial">
          <div className="flux__inner">
            <div className="flux__statband flux__inview" style={{ textAlign: "center" }}>
              <span className="flux__eyebrow">Why teams switch</span>
              <h2
                style={{
                  color: "#fff",
                  fontSize: "clamp(1.5rem, 1.1rem + 2.2vw, 2.6rem)",
                  lineHeight: 1.2,
                  maxInlineSize: "26ch",
                  margin: "1rem auto 0",
                  letterSpacing: "-0.03em",
                }}
              >
                &ldquo;We migrated our entire billing stack to Flux in two weeks and lifted authorization
                rates by 4 points.&rdquo;
              </h2>
              <p
                style={{
                  color: "color-mix(in oklab, #fff 70%, transparent)",
                  fontFamily: "var(--font-flux-mono, monospace)",
                  fontSize: "0.82rem",
                  letterSpacing: "0.06em",
                  marginBlockStart: "1.6rem",
                }}
              >
                — Priya Nair, Head of Payments · Helix Commerce
              </p>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="flux__section" id="start">
          <div className="flux__inner">
            <div className="flux__cta flux__inview">
              <span className="flux__eyebrow">Get started</span>
              <h2 style={{ marginBlockStart: "1rem" }}>Start moving money in minutes.</h2>
              <p>
                Create an account and make your first live charge today — no contracts, no setup fees. Only
                pay when you get paid.
              </p>
              <div className="flux__cta-row" style={{ justifyContent: "center", marginBlockStart: 0 }}>
                <a className="flux__btn" href="#signup">
                  Create account <Chevron />
                </a>
                <a className="flux__btn flux__btn--ghost" href="#sales">
                  Contact sales
                </a>
              </div>
            </div>
          </div>
        </section>
    </>
  );
}
