/**
 * "Drive" — homepage BODY (full-bleed automotive / silent-luxury showcase). The
 * nav, footer, `.drv` root + fonts now live in the site-wide Shell + chrome
 * (./chrome.tsx), so the look reaches every page — this file is just the
 * homepage's vertical stack of full-viewport panels, rendered inside `<main>`
 * within the DriveShell. Each panel is a CSS-only atmospheric backdrop (dusk /
 * open-road / studio / solar) with a centered top headline and two
 * bottom-anchored pill CTAs. No real photos, no 3D / no three.js — pure CSS
 * gradients, vignettes, a faint horizon, a CSS car silhouette. Per-panel text
 * colour controlled explicitly (light or dark) so nothing relies on OS scheme.
 * Server-rendered for LCP. LOCKED light theme.
 *
 * Copy is English-first and ORIGINAL — evokes the silent-luxury EV aesthetic
 * without naming any real brand, model, or slogan.
 */
import type { DesignHomepageProps } from "../types";
import "./drv.css";

type Panel = {
  id: string;
  tone: "light" | "dark";
  variant: string;
  eyebrow: string;
  title: string;
  sub: string;
  primary: string;
  secondary: string;
  footnote: string;
  /** which CSS scenery to render behind the copy */
  scenery: "horizon" | "road" | "studio" | "solar";
};

const panels: Panel[] = [
  {
    id: "model-one",
    tone: "light",
    variant: "drv__panel--dusk",
    eyebrow: "Introducing",
    title: "Model One",
    sub: "The quiet revolution. Now in production.",
    primary: "Order Now",
    secondary: "Demo Drive",
    footnote: "From $0 down · Delivery in your region",
    scenery: "horizon",
  },
  {
    id: "range",
    tone: "light",
    variant: "drv__panel--road",
    eyebrow: "Range",
    title: "Range Without Limits",
    sub: "612 km on a single charge. Keep going.",
    primary: "Order Now",
    secondary: "See Range Map",
    footnote: "Rated 612 km · 18-minute fast charge",
    scenery: "road",
  },
  {
    id: "autonomy",
    tone: "dark",
    variant: "drv__panel--studio",
    eyebrow: "Autopilot",
    title: "Autonomy, Standard",
    sub: "Eight cameras. One calm, confident drive.",
    primary: "Order Now",
    secondary: "Watch It Drive",
    footnote: "Hardware included on every build",
    scenery: "studio",
  },
  {
    id: "energy",
    tone: "light",
    variant: "drv__panel--solar",
    eyebrow: "Energy",
    title: "Energy for Everything",
    sub: "Charge the car. Power the home. Off the sun.",
    primary: "Order Now",
    secondary: "Design Your Roof",
    footnote: "Solar + storage · One connected system",
    scenery: "solar",
  },
];

export default function DriveHomepage(_props: DesignHomepageProps) {
  return (
    <>
      <main className="drv__stack">
        {panels.map((p) => (
          <section
            key={p.id}
            id={p.id}
            className={`drv__panel ${p.variant} drv__panel--${p.tone}`}
            aria-labelledby={`${p.id}-h`}
          >
            {/* full-bleed CSS scenery (no photos) */}
            <div className="drv__backdrop" aria-hidden="true">
              {p.scenery === "horizon" && (
                <>
                  <div className="drv__sky" />
                  <div className="drv__ground" />
                  <div className="drv__car" />
                </>
              )}
              {p.scenery === "road" && (
                <>
                  <div className="drv__sky" />
                  <div className="drv__roadway" />
                  <div className="drv__road-lines" />
                </>
              )}
              {p.scenery === "studio" && (
                <>
                  <div className="drv__studio-floor" />
                  <div className="drv__spot" />
                  <div className="drv__car drv__car--studio" />
                  <div className="drv__sensor-arc" />
                </>
              )}
              {p.scenery === "solar" && (
                <>
                  <div className="drv__sun" />
                  <div className="drv__rooftop" />
                </>
              )}
              <div className="drv__vignette" />
            </div>

            {/* centered top copy */}
            <div className="drv__copy">
              <span className="drv__eyebrow">{p.eyebrow}</span>
              <h1 className="drv__title" id={`${p.id}-h`}>{p.title}</h1>
              <p className="drv__sub">{p.sub}</p>
            </div>

            {/* bottom-anchored CTAs */}
            <div className="drv__actions">
              <div className="drv__cta-row">
                <a className="drv__cta drv__cta--solid" href="#order">{p.primary}</a>
                <a className="drv__cta drv__cta--ghost" href="#demo">{p.secondary}</a>
              </div>
              <p className="drv__footnote">{p.footnote}</p>
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
