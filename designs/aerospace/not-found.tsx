/**
 * Aerospace — bespoke 404. Body-only (the Shell + chrome provide the `.aero`
 * theme, fonts, nav and footer). Wired via DesignPack.pages.notFound.
 */
import Link from "next/link";
import type { DesignPageProps } from "../types";
import "./aero.css";

const Arrow = () => (
  <svg className="aero__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function AerospaceNotFound({ locale }: DesignPageProps) {
  const home = `/${locale}`;
  return (
    <header className="aero__hero aero__hero--page" id="top">
      <div className="aero__stars" aria-hidden="true" />
      <div className="aero__horizon" aria-hidden="true" />
      <div className="aero__scan" aria-hidden="true" />
      <div className="aero__inner aero__hero-grid">
        <div className="aero__telemetry">
          <span className="aero__chip">
            <span className="aero__status-dot" aria-hidden="true" />
            SIGNAL LOST · 404
          </span>
        </div>
        <h1 className="aero__h1">
          Off the flight path.
          <span className="aero__h1-sub">This trajectory does not resolve to a known page.</span>
        </h1>
        <p className="aero__lede">
          The coordinates you entered aren&apos;t on the manifest. Reacquire telemetry and head back to
          mission control.
        </p>
        <div className="aero__cta-row">
          <Link className="aero__btn aero__btn--lg" href={home}>
            Return to base <Arrow />
          </Link>
          <Link className="aero__btn aero__btn--ghost aero__btn--lg" href={`${home}/contact`}>
            Contact flight ops
          </Link>
        </div>
      </div>
    </header>
  );
}
