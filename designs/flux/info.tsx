/**
 * Flux — generic CMS / info page template (FAQ, about, policies, legal).
 * Renders the markdown blocks as crisp developer-doc prose, BODY-ONLY (the Shell
 * + chrome provide the `.flux` theme, fonts, nav and footer). Wired via
 * DesignPack.pages.info → app/[locale]/info/[slug]/page.tsx renders this for the
 * markdown-content path when flux is active.
 */
import type { DesignInfoProps } from "../types";
import "./flux.css";

export default function FluxInfo({ title, blocks }: DesignInfoProps) {
  return (
    <article className="flux__doc">
      <header className="flux__doc-head">
        <div className="flux__inner">
          <span className="flux__pill flux__reveal" data-d="1">
            <span className="flux__dot" aria-hidden="true" />
            <strong>Documentation</strong>&nbsp;— on the record
          </span>
          <h1 className="flux__h1 flux__doc-title flux__reveal" data-d="2">
            {title}
          </h1>
        </div>
      </header>
      <div className="flux__section flux__doc-body">
        <div className="flux__inner flux__prose">
          {blocks.map((b, i) => {
            if (b.type === "heading")
              return (
                <h2 key={i} className="flux__h2 flux__prose-h">
                  {b.text}
                </h2>
              );
            if (b.type === "quote")
              return (
                <blockquote key={i} className="flux__prose-quote">
                  {b.text}
                </blockquote>
              );
            return (
              <p key={i} className="flux__prose-p">
                {b.text}
              </p>
            );
          })}
        </div>
      </div>
    </article>
  );
}
