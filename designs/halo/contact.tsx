/**
 * Halo — bespoke "contact" page BODY (ultra-minimal product luxury).
 * Renders the BODY only; the HaloShell + chrome (./chrome.tsx) provide the
 * `.halo` theme, fonts, nav and footer site-wide. Wired via DesignPack.pages
 * (designs/halo/index.ts) → app/[locale]/contact/page.tsx renders this in place
 * of the default contact body when halo is active.
 *
 * A quiet hero + a small "get in touch" channels grid, reusing the design's own
 * `.halo__*` classes (the spec grid + eyebrow + pill button) so the page reads
 * as one product family with the homepage.
 */
import { brand } from "@/brand.config";
import type { DesignPageProps } from "../types";
import "./halo.css";

const Chevron = () => (
  <svg className="halo__chev" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function HaloContact(_props: DesignPageProps) {
  const email = brand.contact?.email || brand.emails?.support || "hello@halo.example";
  const channels = [
    { label: "Talk to us", value: email },
    { label: "Visit", value: "Halo Flagship · One Halo Way" },
    { label: "Hours", value: "Mon–Sat · 10–19" },
    { label: "Support", value: "Same-day specialist reply" },
  ];
  return (
    <>
      {/* HERO */}
      <header className="halo__hero" id="top">
        <div className="halo__inner halo__hero-inner">
          <span className="halo__eyebrow halo__reveal" data-d="1">Get in touch</span>
          <h1 className="halo__h1 halo__reveal" data-d="2">
            We&apos;re here.
            <br />
            Whenever.
          </h1>
          <p className="halo__subhead halo__reveal" data-d="3">
            Questions about Halo Pro, financing, or a trade-in? A specialist is one message away.
          </p>
          <div className="halo__hero-cta halo__reveal" data-d="5">
            <a className="halo__pill-btn halo__pill-btn--solid" href={`mailto:${email}`}>
              Message us
            </a>
            <a className="halo__text-link" href="#channels">
              See all ways to reach us <Chevron />
            </a>
          </div>
        </div>
      </header>

      {/* CHANNELS */}
      <section className="halo__section" id="channels" aria-labelledby="channels-h">
        <div className="halo__inner">
          <div className="halo__head halo__inview">
            <span className="halo__eyebrow halo__eyebrow--accent">Get in touch</span>
            <h2 className="halo__h2" id="channels-h">Four ways to reach us.</h2>
          </div>
          <dl className="halo__specs halo__inview">
            {channels.map((c) => (
              <div key={c.label} className="halo__spec">
                <dt>{c.label}</dt>
                <dd>{c.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
