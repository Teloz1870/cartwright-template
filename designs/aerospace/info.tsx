/**
 * Aerospace — generic CMS / info page template (FAQ, about, policies, legal).
 * Renders the markdown blocks in the mission-control prose style, BODY-ONLY (the
 * Shell + chrome provide the `.aero` theme, fonts, nav and footer). Wired via
 * DesignPack.pages.info → app/[locale]/info/[slug]/page.tsx renders this for the
 * markdown-content path when aerospace is active.
 */
import type { DesignInfoProps } from "../types";
import "./aero.css";

export default function AerospaceInfo({ title, blocks }: DesignInfoProps) {
  return (
    <article className="aero__doc">
      <header className="aero__doc-head">
        <div className="aero__inner">
          <span className="aero__chip aero__chip--ghost">DOCUMENT · ON FILE</span>
          <h1 className="aero__h1 aero__doc-title">{title}</h1>
        </div>
      </header>
      <div className="aero__section aero__doc-body">
        <div className="aero__inner aero__prose">
          {blocks.map((b, i) => {
            if (b.type === "heading") return <h2 key={i} className="aero__h2 aero__prose-h">{b.text}</h2>;
            if (b.type === "quote")
              return (
                <blockquote key={i} className="aero__prose-quote">
                  {b.text}
                </blockquote>
              );
            return (
              <p key={i} className="aero__prose-p">
                {b.text}
              </p>
            );
          })}
        </div>
      </div>
    </article>
  );
}
