/**
 * Aerospace — bespoke "contact" page template (a mission-control comms console).
 * Renders the BODY only; the AeroShell + chrome (./chrome.tsx) provide the
 * `.aero` theme, fonts, nav and footer site-wide. Wired via DesignPack.pages
 * (designs/aerospace/index.ts) → app/[locale]/contact/page.tsx renders this in
 * place of the default contact body when aerospace is active.
 */
import { brand } from "@/brand.config";
import type { DesignPageProps } from "../types";
import "./aero.css";

const Arrow = () => (
  <svg className="aero__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function AerospaceContact(_props: DesignPageProps) {
  const email = brand.contact?.email || brand.emails?.support || "ops@astradyne.example";
  const channels = [
    { code: "CH-01", k: "Flight ops", v: email, href: `mailto:${email}` },
    { code: "CH-02", k: "Integration window", v: "Booking for next campaign", href: "#book" },
    { code: "CH-03", k: "Range", v: "28.5246° N · 80.6080° W · PAD 39", href: "#" },
    { code: "CH-04", k: "Status net", v: "RANGE GREEN · NOMINAL", href: "#" },
  ];
  return (
    <>
      {/* HERO */}
      <header className="aero__hero aero__hero--page" id="top">
        <div className="aero__stars" aria-hidden="true" />
        <div className="aero__horizon" aria-hidden="true" />
        <div className="aero__scan" aria-hidden="true" />
        <div className="aero__inner aero__hero-grid">
          <div className="aero__telemetry aero__reveal" data-d="1">
            <span className="aero__chip">
              <span className="aero__status-dot" aria-hidden="true" />
              COMMS · OPEN CHANNEL
            </span>
            <span className="aero__chip aero__chip--ghost">RESPONSE · &lt; 1 ORBIT</span>
          </div>
          <h1 className="aero__h1 aero__reveal" data-d="2">
            Talk to flight ops.
            <span className="aero__h1-sub">Bring the mission — we bring orbit.</span>
          </h1>
          <p className="aero__lede aero__reveal" data-d="3">
            Reserve an integration window, request a spec sheet, or open a line to the range. Every
            message routes to a human on the ops floor.
          </p>
          <div className="aero__cta-row aero__reveal" data-d="4">
            <a className="aero__btn aero__btn--lg" href={`mailto:${email}`}>
              Open a channel <Arrow />
            </a>
            <a className="aero__btn aero__btn--ghost aero__btn--lg" href="#channels">
              See all comms
            </a>
          </div>
        </div>
      </header>

      {/* CHANNELS */}
      <section className="aero__section" id="channels" aria-labelledby="channels-h">
        <div className="aero__inner">
          <div className="aero__head aero__inview">
            <span className="aero__eyebrow">Comms directory</span>
            <h2 className="aero__h2" id="channels-h">Pick a channel.</h2>
            <p>Four ways to reach the program. Use the one that matches your mission phase.</p>
          </div>
          <div className="aero__fleet">
            {channels.map((c) => (
              <a key={c.code} className="aero__vehicle aero__inview" href={c.href}>
                <div className="aero__vehicle-top">
                  <span className="aero__vehicle-code">{c.code}</span>
                  <span className="aero__status-dot aero__status-dot--sm" aria-hidden="true" />
                </div>
                <h3 className="aero__vehicle-name">{c.k}</h3>
                <p className="aero__vehicle-mission">{c.v}</p>
                <span className="aero__vehicle-link">
                  Open <Arrow />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
