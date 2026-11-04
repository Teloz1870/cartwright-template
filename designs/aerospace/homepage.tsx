/**
 * "Aerospace" — homepage BODY (cinematic deep-tech). The nav, footer, `.aero`
 * root + fonts now live in the site-wide Shell + chrome (./chrome.tsx), so the
 * look reaches every page — this file is just the homepage's sections, rendered
 * inside `<main>` within the AeroShell. Server-rendered, CSS-only, locked dark
 * theme. Copy EVOKES a mission-control aesthetic with no real brand/trademark.
 */
import type { DesignHomepageProps } from "../types";
import "./aero.css";

const Arrow = () => (
  <svg className="aero__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const vehicles = [
  {
    code: "VH-01",
    name: "Vector",
    mission: "Rapid small-payload lift to low orbit. Recovered, refurbished, reflown.",
    specs: [
      ["Thrust", "1.04 MN"],
      ["Payload (LEO)", "1,200 kg"],
      ["Reuse", "12 flights"],
    ],
  },
  {
    code: "VH-02",
    name: "Meridian Heavy",
    mission: "Heavy-class workhorse for constellations, depots, and cargo runs.",
    specs: [
      ["Thrust", "9.6 MN"],
      ["Payload (LEO)", "28,000 kg"],
      ["Reuse", "20 flights"],
    ],
  },
  {
    code: "VH-03",
    name: "Halo",
    mission: "Crew-rated transfer stage. Autonomous docking, full-envelope abort.",
    specs: [
      ["Seats", "6 crew"],
      ["Range", "Cislunar"],
      ["Reuse", "Rated 10"],
    ],
  },
];

const stats = [
  { num: "180+", label: "Flights to orbit", glow: true },
  { num: "99.2%", label: "Booster reuse", glow: false },
  { num: "0", label: "Compromises on margin", glow: true },
  { num: "8 min", label: "Pad to MECO", glow: false },
];

const sequence = [
  { t: "T‑00:03:00", k: "STARTUP", b: "Propellant load complete. Flight computers armed. Range green." },
  { t: "T‑00:00:10", k: "IGNITION", b: "Engine chill done. Sequence go. Vehicle on internal power." },
  { t: "T‑00:00:00", k: "LIFTOFF", b: "Hold-down release. Full thrust. Tower cleared, pitch over begins." },
  { t: "T+00:02:34", k: "MECO", b: "Main engine cutoff. Stage separation nominal. Boostback burn primed." },
];

export default function AerospaceHomepage(_props: DesignHomepageProps) {
  return (
    <>
      {/* HERO */}
      <header className="aero__hero" id="top">
        <div className="aero__stars" aria-hidden="true" />
        <div className="aero__horizon" aria-hidden="true" />
        <div className="aero__hero-grid-fx" aria-hidden="true" />
        <div className="aero__scan" aria-hidden="true" />
        <div className="aero__inner aero__hero-grid">
          <div className="aero__telemetry aero__reveal" data-d="1">
            <span className="aero__chip">
              <span className="aero__status-dot" aria-hidden="true" />
              T‑00:09:58 · ALL SYSTEMS NOMINAL
            </span>
            <span className="aero__chip aero__chip--ghost">PAYLOAD · READY</span>
            <span className="aero__chip aero__chip--ghost">28.5246° N · 80.6080° W</span>
          </div>
          <h1 className="aero__h1 aero__reveal" data-d="2">
            Build for orbit.
            <span className="aero__h1-sub">A launch system for everything you ship.</span>
          </h1>
          <p className="aero__lede aero__reveal" data-d="3">
            Fully reusable vehicles, one mission stack, and a flight-proven cadence. From first
            integration to recovery on the pad — engineered so the hard part is the only part you
            think about.
          </p>
          <div className="aero__cta-row aero__reveal" data-d="4">
            <a className="aero__btn aero__btn--lg" href="#launch">
              Watch the launch <Arrow />
            </a>
            <a className="aero__btn aero__btn--ghost aero__btn--lg" href="#manifest">
              Read the manifest
            </a>
          </div>

          {/* telemetry readout strip */}
          <div className="aero__readout aero__reveal" data-d="5" aria-hidden="true">
            <div className="aero__readout-row">
              <span className="aero__readout-key">VEL</span>
              <span className="aero__readout-val">7.84 km/s</span>
              <span className="aero__readout-bar"><i style={{ inlineSize: "82%" }} /></span>
            </div>
            <div className="aero__readout-row">
              <span className="aero__readout-key">ALT</span>
              <span className="aero__readout-val">214.6 km</span>
              <span className="aero__readout-bar"><i style={{ inlineSize: "64%" }} /></span>
            </div>
            <div className="aero__readout-row">
              <span className="aero__readout-key">Q</span>
              <span className="aero__readout-val">MAX‑Q PASSED</span>
              <span className="aero__readout-bar"><i style={{ inlineSize: "100%" }} /></span>
            </div>
          </div>
        </div>
      </header>

      {/* MARQUEE / PARTNERS */}
      <section className="aero__strip" aria-label="Flown for">
        <div className="aero__inner">
          <p>Flight manifest · payloads delivered for</p>
          <div className="aero__strip-row">
            {["ORBSAT", "HELION", "NOVA RELAY", "AETHER GRID", "POLARIS-9", "DEEP FIELD"].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
        </div>
      </section>

      {/* VEHICLES / SYSTEMS */}
      <section className="aero__section" id="vehicles" aria-labelledby="vehicles-h">
        <div className="aero__inner">
          <div className="aero__head aero__inview">
            <span className="aero__eyebrow">Vehicles / systems</span>
            <h2 className="aero__h2" id="vehicles-h">One fleet. Every orbit.</h2>
            <p>
              Three vehicles, a shared avionics core, and a single recovery pipeline. Built to fly
              again within the week — because the cheapest stage is the one you already own.
            </p>
          </div>
          <div className="aero__fleet">
            {vehicles.map((v) => (
              <article key={v.code} className="aero__vehicle aero__inview">
                <div className="aero__vehicle-top">
                  <span className="aero__vehicle-code">{v.code}</span>
                  <span className="aero__status-dot aero__status-dot--sm" aria-hidden="true" />
                </div>
                <h3 className="aero__vehicle-name">{v.name}</h3>
                <p className="aero__vehicle-mission">{v.mission}</p>
                <dl className="aero__specs">
                  {v.specs.map(([k, val]) => (
                    <div key={k} className="aero__spec-row">
                      <dt>{k}</dt>
                      <dd>{val}</dd>
                    </div>
                  ))}
                </dl>
                <a className="aero__vehicle-link" href="#manifest">
                  Spec sheet <Arrow />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* STAT BAND */}
      <section className="aero__band" id="metrics" aria-labelledby="metrics-h">
        <div className="aero__horizon aero__horizon--band" aria-hidden="true" />
        <div className="aero__inner">
          <span className="aero__eyebrow aero__eyebrow--center aero__inview">Flight record</span>
          <h2 className="aero__h2 aero__band-h aero__inview" id="metrics-h">
            The numbers hold under load.
          </h2>
          <div className="aero__stats">
            {stats.map((s) => (
              <div key={s.label} className="aero__stat aero__inview">
                <div className="aero__stat-num">{s.glow ? <span>{s.num}</span> : s.num}</div>
                <small>{s.label}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MISSION SEQUENCE */}
      <section className="aero__section" id="sequence" aria-labelledby="sequence-h">
        <div className="aero__inner">
          <div className="aero__head aero__inview">
            <span className="aero__eyebrow">Mission sequence</span>
            <h2 className="aero__h2" id="sequence-h">Countdown to cutoff.</h2>
            <p>Every flight runs the same disciplined timeline. Nominal is not luck — it is rehearsal.</p>
          </div>
          <ol className="aero__seq">
            {sequence.map((s, i) => (
              <li key={s.k} className="aero__seq-item aero__inview">
                <span className="aero__seq-rail" aria-hidden="true" />
                <span className="aero__seq-node" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="aero__seq-body">
                  <span className="aero__seq-t">{s.t}</span>
                  <h3 className="aero__seq-k">{s.k}</h3>
                  <p>{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* MANIFEST CALLOUT */}
      <section className="aero__section" id="manifest" aria-label="Manifest">
        <div className="aero__inner">
          <div className="aero__manifest aero__inview">
            <span className="aero__eyebrow">Engineering note</span>
            <blockquote>
              We do not optimise for the demo. We optimise for the two-hundredth flight — the one
              where nothing is new, nothing is heroic, and the vehicle simply comes home.
            </blockquote>
            <cite>— Flight Director, Pad 39 · log entry 0214</cite>
          </div>
        </div>
      </section>

      {/* FINAL CTA — horizon glow */}
      <section className="aero__section aero__cta-section" id="launch">
        <div className="aero__inner">
          <div className="aero__cta aero__inview">
            <div className="aero__horizon aero__horizon--cta" aria-hidden="true" />
            <div className="aero__cta-content">
              <span className="aero__chip">
                <span className="aero__status-dot" aria-hidden="true" />
                GO FOR LAUNCH
              </span>
              <h2>Put your payload on the manifest.</h2>
              <p>Integration windows are open for the next launch campaign. Bring the mission — we bring orbit.</p>
              <div className="aero__cta-row aero__cta-row--center">
                <a className="aero__btn aero__btn--lg" href="#manifest">
                  Reserve a slot <Arrow />
                </a>
                <a className="aero__btn aero__btn--ghost aero__btn--lg" href="#metrics">
                  See the flight record
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
