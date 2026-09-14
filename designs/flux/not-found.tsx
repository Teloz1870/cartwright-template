/**
 * Flux — bespoke 404. Body-only (the Shell + chrome provide the `.flux` theme,
 * fonts, nav and footer). A big gradient-clipped headline + one line + two CTAs.
 * Wired via DesignPack.pages.notFound.
 */
import Link from "next/link";
import type { DesignPageProps } from "../types";
import "./flux.css";

const Chevron = () => (
  <span className="flux__chev" aria-hidden="true">
    ›
  </span>
);

export default function FluxNotFound({ locale }: DesignPageProps) {
  const home = `/${locale}`;
  return (
    <header className="flux__hero flux__hero--page" id="top">
      <div className="flux__hero-mesh" aria-hidden="true" />
      <div className="flux__hero-grain" aria-hidden="true" />
      <div
        className="flux__inner"
        style={{ position: "relative", textAlign: "center", paddingBlock: "clamp(2.5rem, 6vw, 5rem) clamp(5rem, 11vw, 9rem)" }}
      >
        <span className="flux__pill flux__reveal" data-d="1">
          <span className="flux__dot" aria-hidden="true" />
          <strong>404</strong>&nbsp;— no route matched
        </span>
        <h1 className="flux__h1 flux__reveal" data-d="2" style={{ marginInline: "auto" }}>
          This endpoint <span className="flux__grad">returned 404.</span>
        </h1>
        <p className="flux__lede flux__reveal" data-d="3" style={{ marginInline: "auto" }}>
          The page you requested isn&rsquo;t on the map. The link may be stale or the resource has moved.
          Let&rsquo;s route you back to something live.
        </p>
        <div className="flux__cta-row flux__reveal" data-d="4" style={{ justifyContent: "center" }}>
          <Link className="flux__btn" href={home}>
            Back to home <Chevron />
          </Link>
          <Link className="flux__btn flux__btn--ghost" href={`${home}/contact`}>
            Contact the team
          </Link>
        </div>
      </div>
    </header>
  );
}
