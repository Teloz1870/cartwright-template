import { describe, expect, it } from "vitest";

import {
  extractHtmlFromCode,
  extractHtmlFromV0Files,
} from "@/lib/v0/transform/extract";
import { sanitizeVibeHtml } from "@/lib/v0/transform/sanitize";

/**
 * v0 code→data transform. v0 emits React/TSX; Cartwright persists HTML as data
 * (vibeHtml). These tests pin the lossy-but-deterministic extraction + the
 * XSS-strip security boundary. Pure functions — no mocks.
 */

describe("extractHtmlFromCode", () => {
  it("strips imports, directives and the component wrapper, keeping the JSX", () => {
    const code = `"use client";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="bg-[#0A0A0A] py-20">
      <h1 className="text-white">Velkommen</h1>
    </section>
  );
}`;
    const html = extractHtmlFromCode(code);
    expect(html).not.toMatch(/import /);
    expect(html).not.toMatch(/use client/);
    expect(html).not.toMatch(/export default/);
    expect(html).toContain("<section");
    expect(html).toContain("Velkommen");
  });

  it("converts className→class and htmlFor→for", () => {
    const html = extractHtmlFromCode(
      `<label className="x" htmlFor="email">Email</label>`,
    );
    expect(html).toContain('class="x"');
    expect(html).toContain('for="email"');
    expect(html).not.toContain("className");
    expect(html).not.toContain("htmlFor");
  });

  it("removes JSX comments", () => {
    const html = extractHtmlFromCode(
      `<div>{/* TODO drop this */}<p>keep</p></div>`,
    );
    expect(html).not.toContain("TODO");
    expect(html).toContain("keep");
  });
});

describe("extractHtmlFromV0Files", () => {
  it("picks the JSX component file over config/style files", () => {
    const html = extractHtmlFromV0Files([
      { name: "tailwind.config.ts", content: "export default { theme: {} }" },
      { name: "components.json", content: '{"style":"new-york"}' },
      {
        name: "app/page.tsx",
        content: `export default function Page() {
  return (<main className="p-4"><h2 className="t">Hej</h2></main>);
}`,
      },
    ]);
    expect(html).toContain("<main");
    expect(html).toContain("Hej");
    expect(html).toContain('class="p-4"');
    expect(html).not.toMatch(/new-york|theme:/);
  });

  it("returns empty string for no usable files", () => {
    expect(extractHtmlFromV0Files([])).toBe("");
    expect(
      extractHtmlFromV0Files([
        { name: "package.json", content: '{"name":"x"}' },
      ]),
    ).toBe("");
  });
});

describe("sanitizeVibeHtml", () => {
  it("removes <script> blocks", () => {
    const out = sanitizeVibeHtml(
      `<div>ok</div><script>alert(document.cookie)</script>`,
    );
    expect(out).toContain("<div>ok</div>");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert(");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeVibeHtml(
      `<button onClick="steal()" class="b">x</button>`,
    );
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain('class="b"');
    expect(out).toContain(">x</button>");
  });

  it("neutralizes javascript: URLs", () => {
    const out = sanitizeVibeHtml(`<a href="javascript:evil()">link</a>`);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain("link");
  });

  it("removes iframe/object/embed", () => {
    const out = sanitizeVibeHtml(
      `<p>a</p><iframe src="//x"></iframe><object data="y"></object><embed src="z">`,
    );
    expect(out).toContain("<p>a</p>");
    expect(out.toLowerCase()).not.toMatch(/<iframe|<object|<embed/);
  });

  it("keeps benign Tailwind markup untouched", () => {
    const input = `<section class="bg-[#0A0A0A] py-20"><h1 class="text-white">Hi</h1></section>`;
    expect(sanitizeVibeHtml(input)).toBe(input);
  });
});
