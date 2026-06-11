import "server-only";

import { authorizedGoogleFetch } from "@/lib/google/client";

const GOOGLE_DOCS_API = "https://docs.googleapis.com/v1/documents";

type GoogleTextStyle = {
  bold?: boolean;
  italic?: boolean;
  link?: { url?: string };
};

type GoogleTextRun = {
  content?: string;
  textStyle?: GoogleTextStyle;
};

type GoogleParagraphElement = {
  textRun?: GoogleTextRun;
};

type GoogleParagraph = {
  elements?: GoogleParagraphElement[];
  paragraphStyle?: { namedStyleType?: string };
  bullet?: { listId?: string; nestingLevel?: number };
};

type GoogleStructuralElement = {
  paragraph?: GoogleParagraph;
};

export type GoogleDocsDocument = {
  title?: string;
  body?: {
    content?: GoogleStructuralElement[];
  };
};

export type FetchGoogleDocResult =
  | { ok: true; document: GoogleDocsDocument; title: string; markdown: string }
  | {
      ok: false;
      error: {
        code:
          | "not_connected"
          | "missing_access_token"
          | "refresh_failed"
          | "db_error"
          | "google_error"
          | "invalid_document";
        message: string;
        status?: number;
      };
    };

function stripTrailingNewlines(value: string): string {
  return value.replace(/\r/g, "").replace(/\n+$/g, "");
}

/**
 * Render a Google text run as Cartwright engine markdown — PLAIN TEXT only,
 * never HTML. Bold maps to `**...**` (the only inline marker lib/content.ts
 * renders). Italic and links are flattened to their visible text: the engine's
 * safe renderer (renderContentBlocks/renderInlineMarkdown) emits React text
 * nodes, so any `<`, `>`, `javascript:` etc. in the source is shown literally,
 * never executed. That is what makes imported Docs XSS-safe by construction.
 */
function runToMarkdown(run: GoogleTextRun): string {
  const content = stripTrailingNewlines(run.content ?? "");
  if (!content) return "";
  if (run.textStyle?.bold) {
    const lead = content.match(/^\s*/)?.[0] ?? "";
    const trail = content.match(/\s*$/)?.[0] ?? "";
    const core = content.trim();
    if (core) return `${lead}**${core}**${trail}`;
  }
  return content;
}

function paragraphToMarkdown(paragraph: GoogleParagraph): string {
  return (paragraph.elements ?? [])
    .map((element) => (element.textRun ? runToMarkdown(element.textRun) : ""))
    .join("")
    .trim();
}

function isHeadingStyle(namedStyleType: string | undefined): boolean {
  return (
    namedStyleType === "TITLE" ||
    namedStyleType === "HEADING_1" ||
    namedStyleType === "HEADING_2" ||
    namedStyleType === "HEADING_3" ||
    namedStyleType === "HEADING_4"
  );
}

/**
 * Convert a Google Doc into Cartwright's safe engine markdown — the same dialect
 * lib/content.ts renders: blank line between blocks, `## ` headings, `> ` quotes,
 * `- ` bullets, `**bold**`. We emit TEXT, never HTML, so the imported body flows
 * through the existing safe renderer (no dangerouslySetInnerHTML) and cannot
 * carry stored XSS.
 */
export function googleDocToMarkdown(document: GoogleDocsDocument): string {
  const blocks: string[] = [];
  for (const element of document.body?.content ?? []) {
    const paragraph = element.paragraph;
    if (!paragraph) continue;

    const text = paragraphToMarkdown(paragraph);
    if (!text) continue;

    if (isHeadingStyle(paragraph.paragraphStyle?.namedStyleType)) {
      blocks.push(`## ${text}`);
    } else if (paragraph.bullet) {
      blocks.push(`- ${text}`);
    } else {
      blocks.push(text);
    }
  }
  return blocks.join("\n\n");
}

export function extractGoogleDocId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];

  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get("id");
    if (id) return id;
  } catch {
    // Plain document IDs are handled below.
  }

  return trimmed;
}

function isLikelyGoogleDoc(value: unknown): value is GoogleDocsDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as GoogleDocsDocument;
  return typeof doc.title === "string" && !!doc.body;
}

export async function fetchGoogleDoc(
  documentIdOrUrl: string,
): Promise<FetchGoogleDocResult> {
  const documentId = extractGoogleDocId(documentIdOrUrl);
  if (!documentId) {
    return {
      ok: false,
      error: {
        code: "invalid_document",
        message: "Google Doc id is required.",
      },
    };
  }

  const url = new URL(`${GOOGLE_DOCS_API}/${encodeURIComponent(documentId)}`);
  url.searchParams.set(
    "fields",
    "title,body(content(paragraph(bullet,elements(textRun(content,textStyle(bold,italic,link))),paragraphStyle(namedStyleType))))",
  );

  const fetched = await authorizedGoogleFetch(url);
  if (!fetched.ok) return fetched;

  if (!fetched.response.ok) {
    return {
      ok: false,
      error: {
        code: "google_error",
        message: `Google Docs API returned ${fetched.response.status}.`,
        status: fetched.response.status,
      },
    };
  }

  const payload = (await fetched.response.json().catch(() => null)) as unknown;
  if (!isLikelyGoogleDoc(payload)) {
    return {
      ok: false,
      error: {
        code: "invalid_document",
        message: "Google Docs API response did not include a valid document.",
      },
    };
  }

  return {
    ok: true,
    document: payload,
    title: payload.title?.trim() || "Untitled Google Doc",
    markdown: googleDocToMarkdown(payload),
  };
}
