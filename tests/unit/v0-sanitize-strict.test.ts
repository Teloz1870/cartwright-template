import { describe, expect, it } from "vitest";

import { sanitizeUserHtml } from "@/lib/v0/transform/sanitize-strict";

/**
 * Strict, allowlist-based HTML sanitizer (DOMPurify + jsdom) — the INGEST gate
 * for any HTML that reaches `vibeHtml` / dangerouslySetInnerHTML. Unlike the
 * cheap regex `sanitizeVibeHtml` (render-time last-defense), this is the real
 * security boundary: it must hold against attacker-influenceable markup.
 *
 * These tests pin the exact vectors the security review flagged as UNHANDLED by
 * the regex sanitizer: style=/<style>/<svg>/<math>/data: in src+srcset — plus
 * the classic script/iframe/on*=/javascript: vectors and the must-preserve set
 * (class= for Tailwind, safe http(s)/relative href+src).
 */
describe("sanitizeUserHtml — strips dangerous constructs", () => {
  it("returns empty string for empty/falsy input", () => {
    expect(sanitizeUserHtml("")).toBe("");
  });

  it("strips <script> blocks", () => {
    const out = sanitizeUserHtml('<div>ok</div><script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).toMatch(/ok/);
  });

  it("strips inline event handlers (onclick, onerror, onload)", () => {
    const out = sanitizeUserHtml('<img src="https://x.test/a.png" onerror="alert(1)"><button onclick="x()">b</button>');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/alert\(1\)/);
  });

  it("strips javascript: URLs in href", () => {
    const out = sanitizeUserHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("strips the style attribute (CSS injection / clickjacking vector)", () => {
    const out = sanitizeUserHtml('<div style="position:fixed;inset:0;background:url(https://evil.test/x)">x</div>');
    expect(out).not.toMatch(/style=/i);
    expect(out).not.toMatch(/position:fixed/i);
  });

  it("strips <style> blocks (CSS @import / expression vector)", () => {
    const out = sanitizeUserHtml('<style>@import url(https://evil.test/x.css);</style><p>hi</p>');
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toMatch(/@import/i);
    expect(out).toMatch(/hi/);
  });

  it("strips <svg> (mutation-XSS vector)", () => {
    const out = sanitizeUserHtml('<svg><use href="data:image/svg+xml;base64,xxx"/></svg><p>hi</p>');
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toMatch(/<use/i);
    expect(out).toMatch(/hi/);
  });

  it("strips <math> (mutation-XSS vector)", () => {
    const out = sanitizeUserHtml('<math><mtext><script>alert(1)</script></mtext></math><p>hi</p>');
    expect(out).not.toMatch(/<math/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).toMatch(/hi/);
  });

  it("strips data: URIs in img src", () => {
    const out = sanitizeUserHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">');
    expect(out).not.toMatch(/data:/i);
  });

  it("strips data: URIs hidden in srcset", () => {
    const out = sanitizeUserHtml('<img srcset="data:text/html;base64,PHNjcmlwdD4= 1x" src="https://x.test/a.png">');
    expect(out).not.toMatch(/data:/i);
  });

  it("strips <iframe>, <object> and <embed>", () => {
    const out = sanitizeUserHtml('<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><p>hi</p>');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
    expect(out).toMatch(/hi/);
  });
});

describe("sanitizeUserHtml — preserves the safe Tailwind markup set", () => {
  it("keeps class= attributes (Tailwind must survive)", () => {
    const out = sanitizeUserHtml('<section class="px-6 py-16 text-center"><h2 class="text-2xl font-semibold">Title</h2></section>');
    expect(out).toMatch(/class="px-6 py-16 text-center"/);
    expect(out).toMatch(/class="text-2xl font-semibold"/);
    expect(out).toMatch(/Title/);
  });

  it("keeps safe http(s) src on img", () => {
    const out = sanitizeUserHtml('<img src="https://images.test/hero.jpg" alt="Hero">');
    expect(out).toMatch(/src="https:\/\/images\.test\/hero\.jpg"/);
    expect(out).toMatch(/alt="Hero"/);
  });

  it("keeps relative href on links", () => {
    const out = sanitizeUserHtml('<a href="/kontakt" class="btn">Kontakt</a>');
    expect(out).toMatch(/href="\/kontakt"/);
    expect(out).toMatch(/Kontakt/);
  });

  it("keeps common structural + text tags intact", () => {
    const html = '<section><div><h1>H</h1><p>para</p><ul><li>one</li></ul></div></section>';
    const out = sanitizeUserHtml(html);
    expect(out).toMatch(/<section/);
    expect(out).toMatch(/<h1/);
    expect(out).toMatch(/<p/);
    expect(out).toMatch(/<li/);
    expect(out).toMatch(/one/);
  });
});
