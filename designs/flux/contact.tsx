/**
 * Flux — bespoke "contact" page body (developer-first SaaS comms).
 * Renders the BODY only; the FluxShell + chrome (./chrome.tsx) provide the
 * `.flux` theme, fonts, nav and footer site-wide. Wired via DesignPack.pages
 * (designs/flux/index.ts) → app/[locale]/contact/page.tsx renders this in place
 * of the default contact body when flux is active.
 */
import { brand } from "@/brand.config";
import type { DesignPageProps } from "../types";
import "./flux.css";

const Chevron = () => (
  <span className="flux__chev" aria-hidden="true">
    ›
  </span>
);

export default function FluxContact(_props: DesignPageProps) {
  const email = brand.contact?.email || brand.emails?.support || "hello@flux.dev";
  const channels = [
    {
      tag: "Sales",
      t: "Talk to sales",
      b: "Walk through pricing, volume discounts, and an integration plan with a human who knows the API.",
      action: "Email sales",
      href: `mailto:${email}`,
    },
    {
      tag: "Support",
      t: "Developer support",
      b: "Stuck on a webhook or an idempotency key? Reach an engineer who has shipped on Flux.",
      action: "Open a ticket",
      href: `mailto:${email}`,
    },
    {
      tag: "Status",
      t: "Platform status",
      b: "99.999% API uptime, with a public status net and signed incident history. Always on the record.",
      action: "All systems go",
      href: "#status",
    },
  ];
  return (
    <>
      {/* HERO — the signature angled gradient band */}
      <header className="flux__hero" id="top">
        <div className="flux__hero-mesh" aria-hidden="true" />
        <div className="flux__hero-grain" aria-hidden="true" />
        <div className="flux__inner" style={{ position: "relative", textAlign: "center", paddingBlock: "clamp(2.5rem, 6vw, 5rem) clamp(5rem, 11vw, 9rem)" }}>
          <span className="flux__pill flux__reveal" data-d="1">
            <span className="flux__dot" aria-hidden="true" />
            <strong>Open channel</strong>&nbsp;— a human replies, not a bot
          </span>
          <h1 className="flux__h1 flux__reveal" data-d="2" style={{ marginInline: "auto" }}>
            Let&rsquo;s move <span className="flux__grad">money together.</span>
          </h1>
          <p className="flux__lede flux__reveal" data-d="3" style={{ marginInline: "auto" }}>
            Whether you&rsquo;re scoping your first integration or scaling to billions in volume, our team
            is ready. Pick a channel below — every message routes to a person on the platform team.
          </p>
          <div className="flux__cta-row flux__reveal" data-d="4" style={{ justifyContent: "center" }}>
            <a className="flux__btn" href={`mailto:${email}`}>
              Email us <Chevron />
            </a>
            <a className="flux__btn flux__btn--ghost" href="#channels">
              See all channels
            </a>
          </div>
        </div>
      </header>

      {/* CHANNELS */}
      <section className="flux__section" id="channels" aria-labelledby="channels-h">
        <div className="flux__inner">
          <div className="flux__head flux__inview">
            <span className="flux__eyebrow">Get in touch</span>
            <h2 className="flux__h2" id="channels-h">
              Pick the channel that fits.
            </h2>
            <p>
              Three ways to reach the team. Use the one that matches where you are — pre-sales, mid-build,
              or live in production.
            </p>
          </div>
          <div className="flux__grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {channels.map((c) => (
              <a key={c.t} className="flux__card flux__inview" href={c.href}>
                <span className="flux__card-tag" style={{ marginBlockStart: 0 }}>{c.tag}</span>
                <div>
                  <h3>{c.t}</h3>
                  <p style={{ marginBlockStart: "0.5rem" }}>{c.b}</p>
                </div>
                <span className="flux__eyebrow" style={{ marginBlockStart: "auto" }}>
                  {c.action} <Chevron />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
