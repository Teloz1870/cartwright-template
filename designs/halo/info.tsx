/**
 * Halo — generic CMS / info page template (FAQ, about, policies, legal).
 * Renders the parsed markdown blocks as a clean, generous typographic document
 * in the ultra-minimal Halo style, BODY-ONLY (the HaloShell + chrome provide the
 * `.halo` theme, fonts, nav and footer). Wired via DesignPack.pages.info →
 * app/[locale]/info/[slug]/page.tsx renders this for the markdown-content path
 * when halo is active.
 *
 * A quiet centered page header (eyebrow + oversized tight-tracked title) over a
 * readable single-column document, reusing the design's own `.halo__*` classes so
 * the page reads as one product family with the homepage.
 */
import type { DesignInfoProps } from "../types";
import "./halo.css";

export default function HaloInfo({ title, blocks }: DesignInfoProps) {
  return (
    <article className="halo__doc">
      <header className="halo__doc-head">
        <div className="halo__inner halo__doc-head-inner">
          <span className="halo__eyebrow halo__eyebrow--accent halo__reveal" data-d="1">
            Information
          </span>
          <h1 className="halo__h1 halo__doc-title halo__reveal" data-d="2">
            {title}
          </h1>
        </div>
      </header>
      <div className="halo__section halo__doc-body">
        <div className="halo__inner halo__prose">
          {blocks.map((b, i) => {
            if (b.type === "heading")
              return (
                <h2 key={i} className="halo__h2 halo__prose-h">
                  {b.text}
                </h2>
              );
            if (b.type === "quote")
              return (
                <blockquote key={i} className="halo__prose-quote">
                  {b.text}
                </blockquote>
              );
            return (
              <p key={i} className="halo__prose-p">
                {b.text}
              </p>
            );
          })}
        </div>
      </div>
    </article>
  );
}
