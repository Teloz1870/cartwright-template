import { createElement, type ReactNode } from "react";

export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string };

/** Parser en ren-tekst body til strukturerede blokke: blanke linjer adskiller
 *  blokke, og linjer der starter med "## " bliver underoverskrifter. */
export function renderContentBlocks(body: string): ContentBlock[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block): ContentBlock => {
      if (block.startsWith("## ")) {
        return {
          type: "heading",
          text: block.slice(3).trim(),
        };
      }
      return {
        type: "paragraph",
        text: block,
      };
    });
}

/**
 * Renderer inline markdown-bold (**text**) som <strong>-tags.
 * Bruges på paragrafer fra renderContentBlocks() der har inline-betoning.
 *
 * Sikkerhed: vi splitter på regex og wrap kun matches i <strong> — ingen
 * dangerouslySetInnerHTML, så XSS-safe selv med user-input.
 *
 * Bruger React.createElement frem for JSX så denne lib-fil kan forblive .ts
 * (lib/ er server-only utilities, ingen JSX-konvention).
 */
export function renderInlineMarkdown(text: string): ReactNode[] {
  // Split på **bold** med capture-group så delimiters bevares i array
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return createElement("strong", { key: idx }, part.slice(2, -2));
    }
    return part;
  });
}
