/**
 * Drive — generic CMS / info page template (FAQ, about, policies, legal).
 * Renders the parsed content blocks as a calm, full-width document over the
 * Drive silver-mist backdrop, BODY-ONLY (the DriveShell + chrome provide the
 * `.drv` theme, fonts, nav and footer). Wired via DesignPack.pages.info →
 * app/[locale]/info/[slug]/page.tsx renders this for the markdown-content path
 * when drive is active. Reuses the homepage display voice (eyebrow + title) and
 * the light surface vocabulary; the prose lives in a readable max-width column.
 */
import type { DesignInfoProps } from "../types";
import "./drv.css";

export default function DriveInfo({ title, blocks }: DesignInfoProps) {
  return (
    <article className="drv__doc">
      <header className="drv__doc-head">
        <div className="drv__doc-inner">
          <span className="drv__eyebrow">Document · On file</span>
          <h1 className="drv__title drv__doc-title">{title}</h1>
        </div>
      </header>

      <div className="drv__doc-body">
        <div className="drv__prose">
          {blocks.map((b, i) => {
            if (b.type === "heading")
              return (
                <h2 key={i} className="drv__prose-h">
                  {b.text}
                </h2>
              );
            if (b.type === "quote")
              return (
                <blockquote key={i} className="drv__prose-quote">
                  {b.text}
                </blockquote>
              );
            return (
              <p key={i} className="drv__prose-p">
                {b.text}
              </p>
            );
          })}
        </div>
      </div>
    </article>
  );
}
