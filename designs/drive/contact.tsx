/**
 * Drive — bespoke "contact" page body (a silent-luxury showroom enquiry panel).
 * Renders the BODY only; the DriveShell + chrome (./chrome.tsx) provide the
 * `.drv` theme, fonts, nav and footer site-wide. Wired via DesignPack.pages
 * (designs/drive/index.ts) → app/[locale]/contact/page.tsx renders this in place
 * of the default contact body when drive is active. Same full-bleed CSS scenery
 * vocabulary as the homepage — one studio panel + a channels grid.
 */
import { brand } from "@/brand.config";
import type { DesignPageProps } from "../types";
import "./drv.css";

export default function DriveContact(_props: DesignPageProps) {
  const email = brand.contact?.email || brand.emails?.support || "concierge@voltera.example";
  const phone = brand.contact?.phone || "Book a callback";
  const hours = brand.contact?.hours || "Showroom · daily";

  const channels = [
    { k: "Concierge", v: email, hint: "A human reply, every time.", href: `mailto:${email}` },
    { k: "Demo drive", v: "Reserve a slot", hint: "30 minutes, no pressure.", href: `mailto:${email}?subject=Demo%20drive` },
    { k: "Showroom", v: phone, hint: hours, href: "#showroom" },
    { k: "Energy", v: "Design your roof", hint: "Solar + storage, one system.", href: "#energy" },
  ];

  return (
    <>
      {/* HERO — a single studio panel in the Drive vocabulary */}
      <section className="drv__panel drv__panel--studio drv__panel--dark" id="top" aria-labelledby="contact-h">
        <div className="drv__backdrop" aria-hidden="true">
          <div className="drv__studio-floor" />
          <div className="drv__spot" />
          <div className="drv__car drv__car--studio" />
          <div className="drv__sensor-arc" />
          <div className="drv__vignette" />
        </div>

        <div className="drv__copy">
          <span className="drv__eyebrow">Get in touch</span>
          <h1 className="drv__title" id="contact-h">Let&rsquo;s talk drive.</h1>
          <p className="drv__sub">
            Reserve a demo drive, design your energy roof, or ask us anything. Every message reaches a
            real person on the floor.
          </p>
        </div>

        <div className="drv__actions">
          <div className="drv__cta-row">
            <a className="drv__cta drv__cta--solid" href={`mailto:${email}`}>Email Concierge</a>
            <a className="drv__cta drv__cta--ghost" href="#channels">All Channels</a>
          </div>
          <p className="drv__footnote">Typical reply within one business day</p>
        </div>
      </section>

      {/* CHANNELS — a quiet, light "get in touch" grid */}
      <section className="drv__contact" id="channels" aria-labelledby="channels-h">
        <div className="drv__contact-inner">
          <header className="drv__contact-head">
            <span className="drv__eyebrow">Channels</span>
            <h2 className="drv__contact-h" id="channels-h">Four ways to reach us.</h2>
          </header>
          <div className="drv__channels">
            {channels.map((c) => (
              <a key={c.k} className="drv__channel" href={c.href}>
                <span className="drv__channel-k">{c.k}</span>
                <span className="drv__channel-v">{c.v}</span>
                <span className="drv__channel-hint">{c.hint}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
