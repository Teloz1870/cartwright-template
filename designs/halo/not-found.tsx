/**
 * Halo — bespoke 404. Body-only (the HaloShell + chrome provide the `.halo`
 * theme, fonts, nav and footer). A quiet, oversized "Page not found" in the
 * ultra-minimal Halo voice: a tight-tracked headline, one calm line, and two
 * CTAs (primary back home, secondary to contact). Wired via
 * DesignPack.pages.notFound.
 */
import Link from "next/link";
import type { DesignPageProps } from "../types";
import "./halo.css";

const Chevron = () => (
  <svg className="halo__chev" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function HaloNotFound({ locale }: DesignPageProps) {
  const home = `/${locale}`;
  return (
    <header className="halo__hero halo__hero--page" id="top">
      <div className="halo__inner halo__hero-inner">
        <span className="halo__eyebrow halo__reveal" data-d="1">
          Error 404
        </span>
        <h1 className="halo__h1 halo__reveal" data-d="2">
          Page not found.
        </h1>
        <p className="halo__subhead halo__reveal" data-d="3">
          The page you were looking for has moved, or never existed. Let&apos;s get you back to
          something beautiful.
        </p>
        <div className="halo__hero-cta halo__reveal" data-d="5">
          <Link className="halo__pill-btn halo__pill-btn--solid" href={home}>
            Back to home
          </Link>
          <Link className="halo__text-link" href={`${home}/contact`}>
            Contact us <Chevron />
          </Link>
        </div>
      </div>
    </header>
  );
}
