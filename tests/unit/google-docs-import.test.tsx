import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock ONLY the OAuth fetch layer so we can exercise the real converter +
// fail-soft path without a Google connection.
vi.mock("@/lib/google/client", () => ({
  authorizedGoogleFetch: vi.fn(),
}));

import { authorizedGoogleFetch } from "@/lib/google/client";
import {
  googleDocToMarkdown,
  fetchGoogleDoc,
  type GoogleDocsDocument,
} from "@/lib/google/docs";
import BlogContent from "@/components/BlogContent";
import type { Mock } from "vitest";

const authedFetchMock = authorizedGoogleFetch as unknown as Mock;

const xssDoc: GoogleDocsDocument = {
  title: "Launch Plan",
  body: {
    content: [
      {
        paragraph: {
          paragraphStyle: { namedStyleType: "HEADING_1" },
          elements: [{ textRun: { content: "Intro\n", textStyle: {} } }],
        },
      },
      {
        paragraph: {
          elements: [
            { textRun: { content: "Read ", textStyle: {} } },
            {
              textRun: {
                content: "the brief",
                textStyle: { bold: true, link: { url: "javascript:alert(1)" } },
              },
            },
            // A run whose literal text is an HTML payload.
            {
              textRun: {
                content: " <script>alert(1)</script><img src=x onerror=alert(1)>",
                textStyle: {},
              },
            },
          ],
        },
      },
    ],
  },
};

describe("googleDocToMarkdown — converts to safe engine markdown, never HTML", () => {
  it("emits markdown (## / **bold**) and no HTML tags or javascript: links", () => {
    const md = googleDocToMarkdown(xssDoc);
    expect(md).toContain("## Intro");
    expect(md).toContain("**the brief**");
    // The converter NEVER adds HTML styling tags (bold/heading/link become
    // markdown). Note: literal `<script>`/`<img>` from the doc's TEXT survive as
    // plain text on purpose — they are escaped at render (see render tests).
    expect(md).not.toMatch(/<\/?(strong|em|h1|h2|h3|p|ul|li)\b/i);
    expect(md).not.toMatch(/<a\s|<a>/i);
    // The malicious link URL is dropped (only visible text survives).
    expect(md).not.toContain("javascript:");
  });

  it("is deterministic (same doc → same output)", () => {
    expect(googleDocToMarkdown(xssDoc)).toBe(googleDocToMarkdown(xssDoc));
  });

  it("fetchGoogleDoc is fail-soft when not connected", async () => {
    authedFetchMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "not_connected", message: "Google is not connected." },
    });
    const result = await fetchGoogleDoc("some-doc-id");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_connected");
  });
});

describe("BlogContent render — body is text, never executable HTML (stored-XSS guard)", () => {
  it("escapes HTML in the body instead of executing it", () => {
    const markup = renderToStaticMarkup(
      <BlogContent body={"<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>"} />,
    );
    expect(markup).not.toContain("<script>alert(1)");
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;script&gt;");
  });

  it("regression: existing plain markdown renders unchanged (heading/paragraph/bold)", () => {
    const markup = renderToStaticMarkup(
      <BlogContent body={"## Overskrift\n\nHej **verden**"} />,
    );
    expect(markup).toContain("<h2");
    expect(markup).toContain("Overskrift");
    expect(markup).toContain("<strong>verden</strong>");
    expect(markup).toContain("<p");
  });
});

describe("docs.import tool registration", () => {
  // The full tool-registry is a large module graph; a cold dynamic import under
  // concurrent test load can exceed vitest's 5s default. Give it headroom so
  // this assertion isn't flaky in CI.
  it("is registered with pages:write scope", async () => {
    const { getTool } = await import("@/lib/tools/registry");
    const tool = getTool("docs.import");
    expect(tool).toBeDefined();
    expect(tool?.scope).toBe("pages:write");
  }, 20000);
});
