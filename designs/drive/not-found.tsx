/**
 * Drive — bespoke 404. A full-viewport studio panel in the Drive vocabulary:
 * a dark stage with a car silhouette + sensor sweep, a centered top headline,
 * and two bottom-anchored pill CTAs. BODY-ONLY (the DriveShell + chrome provide
 * the `.drv` theme, fonts, nav and footer). Wired via DesignPack.pages.notFound.
 */
import Link from "next/link";
import type { DesignPageProps } from "../types";
import "./drv.css";

export default function DriveNotFound({ locale }: DesignPageProps) {
  const home = `/${locale}`;
  return (
    <section className="drv__panel drv__panel--studio drv__panel--dark" id="top">
      <div className="drv__backdrop" aria-hidden="true">
        <div className="drv__studio-floor" />
        <div className="drv__spot" />
        <div className="drv__car drv__car--studio" />
        <div className="drv__sensor-arc" />
        <div className="drv__vignette" />
      </div>

      <div className="drv__copy">
        <span className="drv__eyebrow">Error · 404</span>
        <h1 className="drv__title">Off the map.</h1>
        <p className="drv__sub">
          This route doesn&rsquo;t lead anywhere. Let&rsquo;s steer you back to the road.
        </p>
      </div>

      <div className="drv__actions">
        <div className="drv__cta-row">
          <Link className="drv__cta drv__cta--solid" href={home}>
            Back home
          </Link>
          <Link className="drv__cta drv__cta--ghost" href={`${home}/contact`}>
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}
