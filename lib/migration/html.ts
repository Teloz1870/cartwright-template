/**
 * MIGD-4a — what the page checks read from one HTML document, old or new.
 * Pure and regex-based on purpose: a parity check compares a handful of fields
 * on up to 20,000 pages, and a DOM (jsdom) per page is neither needed nor
 * cheap. It reads, never renders: no script runs, nothing is fetched.
 *
 * Text is compared through `norm` (entities decoded, whitespace collapsed,
 * NFKC, lower case), so a page that only re-encodes "–" as `&#8211;` or
 * re-wraps a heading is the same page. Counts are taken inside the first
 * `<main>` (else `<body>`), so the new design's header and footer do not move them —
 * after React's streamed Suspense content is put back where it renders (`inlineStreamed`).
 */

export type PageExtract = {
  /** The document's first `<title>` outside any inline `<svg>` (a streamed one sits in the body). */
  title: string;
  description: string | null;
  /** Absolute, resolved against the page URL. */
  canonical: string | null;
  /** A `noindex`/`none` directive in a robots or googlebot meta tag, or in the X-Robots-Tag header. */
  noindex: boolean;
  ogImage: string | null;
  h1: string;
  /** The first `sku` in the page's JSON-LD, JSON-decoded. */
  sku: string | null;
  counts: { paragraphs: number; tables: number; links: number; images: number };
};

/**
 * HTML 4.01's 252 named entities, plus HTML5's upper-case AMP/LT/GT/QUOT/COPY/REG
 * — every name PHP's htmlentities() (so WordPress and WooCommerce) emits. Latin-1
 * by position from U+00A0; the rest as name:hex. A name outside the set stays
 * as written on both sides, so it still compares equal to itself.
 */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot " +
  "cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml " +
  "Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig " +
  "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute " +
  "ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
const OTHER =
  "quot:22 amp:26 lt:3c gt:3e apos:27 QUOT:22 AMP:26 LT:3c GT:3e COPY:a9 REG:ae OElig:152 oelig:153 Scaron:160 scaron:161 Yuml:178 " +
  "circ:2c6 tilde:2dc ensp:2002 emsp:2003 thinsp:2009 zwnj:200c zwj:200d lrm:200e rlm:200f ndash:2013 mdash:2014 lsquo:2018 " +
  "rsquo:2019 sbquo:201a ldquo:201c rdquo:201d bdquo:201e dagger:2020 Dagger:2021 permil:2030 lsaquo:2039 rsaquo:203a euro:20ac " +
  "fnof:192 Alpha:391 Beta:392 Gamma:393 Delta:394 Epsilon:395 Zeta:396 Eta:397 Theta:398 Iota:399 Kappa:39a Lambda:39b Mu:39c " +
  "Nu:39d Xi:39e Omicron:39f Pi:3a0 Rho:3a1 Sigma:3a3 Tau:3a4 Upsilon:3a5 Phi:3a6 Chi:3a7 Psi:3a8 Omega:3a9 alpha:3b1 beta:3b2 " +
  "gamma:3b3 delta:3b4 epsilon:3b5 zeta:3b6 eta:3b7 theta:3b8 iota:3b9 kappa:3ba lambda:3bb mu:3bc nu:3bd xi:3be omicron:3bf " +
  "pi:3c0 rho:3c1 sigmaf:3c2 sigma:3c3 tau:3c4 upsilon:3c5 phi:3c6 chi:3c7 psi:3c8 omega:3c9 thetasym:3d1 upsih:3d2 piv:3d6 " +
  "bull:2022 hellip:2026 prime:2032 Prime:2033 oline:203e frasl:2044 weierp:2118 image:2111 real:211c trade:2122 alefsym:2135 " +
  "larr:2190 uarr:2191 rarr:2192 darr:2193 harr:2194 crarr:21b5 lArr:21d0 uArr:21d1 rArr:21d2 dArr:21d3 hArr:21d4 forall:2200 " +
  "part:2202 exist:2203 empty:2205 nabla:2207 isin:2208 notin:2209 ni:220b prod:220f sum:2211 minus:2212 lowast:2217 radic:221a " +
  "prop:221d infin:221e ang:2220 and:2227 or:2228 cap:2229 cup:222a int:222b there4:2234 sim:223c cong:2245 asymp:2248 ne:2260 " +
  "equiv:2261 le:2264 ge:2265 sub:2282 sup:2283 nsub:2284 sube:2286 supe:2287 oplus:2295 otimes:2297 perp:22a5 sdot:22c5 " +
  "lceil:2308 rceil:2309 lfloor:230a rfloor:230b lang:27e8 rang:27e9 loz:25ca spades:2660 clubs:2663 hearts:2665 diams:2666";

let named: Map<string, string> | null = null;
function namedEntities(): Map<string, string> {
  if (named) return named;
  const map = new Map(LATIN1.split(" ").map((n, i) => [n, String.fromCodePoint(0xa0 + i)] as const));
  for (const pair of OTHER.split(" ")) {
    const [n, hex] = pair.split(":");
    map.set(n, String.fromCodePoint(parseInt(hex, 16)));
  }
  return (named = map);
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, e: string) => {
    if (e[0] !== "#") return namedEntities().get(e) ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** The rest of a tag after its name: a quoted value may hold ">" (`content="over > 500 kr."`). */
const ATTRS = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
/** Where a tag name ends — never at a hyphen, so `<table-wrapper>` is not a `<table>`. */
const END = String.raw`(?=[\s/>])`;
const startTag = (name: string) => new RegExp(`<${name}${END}${ATTRS}>`, "gi");
const element = (name: string, flags = "i") => new RegExp(`<${name}${END}${ATTRS}>([\\s\\S]*?)<\\/${name}\\s*>`, flags);
const ANY_TAG = new RegExp(`<\\/?([a-z][a-z0-9-]*)${ATTRS}>`, "gi");
/** Phrasing elements: their tags sit inside a word (`H<sub>2</sub>O` reads "H2O"); any other tag breaks it. */
const INLINE = new Set("a abbr b bdi bdo cite code data dfn em font i img kbd mark q s samp small span strong sub sup time tt u var wbr del ins".split(" "));
const SVG = new RegExp(`<svg${END}[\\s\\S]*?<\\/svg\\s*>`, "gi");

/** Tag-free, decoded, collapsed text. */
export const textOf = (html: string) =>
  decodeEntities(html.replace(ANY_TAG, (_tag, name: string) => (INLINE.has(name.toLowerCase()) ? "" : " "))).replace(/\s+/g, " ").trim();
/** The comparison form of a text. */
export const norm = (s: string | null | undefined) => (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
/**
 * Comments and raw-text elements, whichever opens first: a commented-out
 * `<script>` is a comment, a "<!--" inside a script string is script.
 */
const NOT_CONTENT = new RegExp(String.raw`<!--[\s\S]*?(?:-->|$)|<(script|style|noscript|template)${END}(${ATTRS})>([\s\S]*?)<\/\1\s*>`, "gi");

/** The `</div>` closing the `<div` at `from`, past nested ones: [its start, its end]. */
function closeDiv(html: string, from: number): [number, number] | null {
  const tags = new RegExp(`<(\\/?)div${END}${ATTRS}>`, "gi");
  tags.lastIndex = from;
  let depth = 0;
  for (let t; (t = tags.exec(html)); ) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return [t.index, tags.lastIndex];
  }
  return null;
}

/** Where a Suspense fallback ends: at its own `<!--/$-->`, past any nested boundary's markers. */
function fallbackEnd(html: string, from: number): number {
  const marks = /<!--(\/?)[$&][?!~]?-->/g;
  marks.lastIndex = from;
  let depth = 0;
  for (let m; (m = marks.exec(html)); ) {
    if (!m[1]) depth++;
    else if (depth-- === 0) return m.index;
  }
  return -1;
}

/**
 * React streams a Suspense boundary that resolves after the shell (Next.js
 * product and category pages, a streamed `generateMetadata`) as a hidden
 * `<div hidden id="S:n">` near `</body>`, then `$RC("B:m","S:n")` swaps it in
 * for the boundary's fallback (`$RS("S:n","P:m")` for a placeholder). Make the
 * swaps here, in order, so the content sits where a browser shows it — inside
 * `<main>`, not after it. A swap it cannot place leaves the page as sent.
 */
export function inlineStreamed(html: string): string {
  let doc = html;
  for (const [, kind, a, b] of html.matchAll(/\$R([CRS])\("([^"]+)","([^"]+)"/g)) {
    const [segmentId, targetId] = kind === "S" ? [a, b] : [b, a];
    const open = `<div hidden id="${segmentId}">`;
    const start = doc.indexOf(open);
    const close = start < 0 ? null : closeDiv(doc, start);
    if (!close) continue;
    const cut = doc.slice(0, start) + doc.slice(close[1]);
    const marker = `<template id="${targetId}"></template>`;
    const at = cut.indexOf(marker);
    const end = at < 0 ? -1 : kind === "S" ? at + marker.length : fallbackEnd(cut, at + marker.length);
    if (end >= 0) doc = cut.slice(0, at) + doc.slice(start + open.length, close[0]) + cut.slice(end);
  }
  return doc;
}

/** A tag's attributes, names lower-cased, values decoded. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] ??= decodeEntities(m[3] ?? m[4] ?? m[5] ?? "").trim();
  }
  return out;
}

const first = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;
const absolute = (raw: string | null | undefined, base: string) => (raw && URL.canParse(raw, base) ? new URL(raw, base).href : null);
/** A JSON string literal's body, decoded as JSON ("HF-Ø" is "HF-Ø"); a broken one keeps its characters. */
const jsonString = (raw: string): string => {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\(.)/g, "$1");
  }
};

/**
 * A robots value says noindex: a `noindex` or `none` directive, alone or for a
 * user agent (`googlebot: noindex`) — never the `none` of `max-image-preview:none`.
 */
export function robotsNoindex(value: string): boolean {
  return value.split(",").some((part) => {
    const directive = part.trim().toLowerCase().replace(/^(?!max-|unavailable_after)[a-z0-9_-]+\s*:\s*/, "");
    return directive === "noindex" || directive === "none";
  });
}

export function extractPage(html: string, opts: { url: string; xRobotsTag?: string | null }): PageExtract {
  const jsonLd: string[] = [];
  // Script, style, noscript and template bodies are not content, and may hold "<h1>" in a string.
  const doc = inlineStreamed(html).replace(NOT_CONTENT, (_whole, tag?: string, tagAttrs?: string, body?: string) => {
    if (tag?.toLowerCase() === "script" && (attrs(tagAttrs ?? "").type ?? "").split(";")[0].trim().toLowerCase() === "application/ld+json") {
      jsonLd.push(body ?? "");
    }
    return " ";
  });
  const skuMatch = jsonLd.join("\n").match(/"sku"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|(-?\d+(?:\.\d+)?))/);

  const metas = [...doc.matchAll(startTag("meta"))].map((m) => attrs(m[0]));
  const meta = (key: "name" | "property", value: string) => metas.find((a) => a[key]?.toLowerCase() === value)?.content ?? null;
  const links = [...doc.matchAll(startTag("link"))].map((m) => attrs(m[0]));
  const canonical = links.find((a) => (a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"))?.href;
  const robots = metas.filter((a) => ["robots", "googlebot"].includes(a.name?.toLowerCase() ?? "")).map((a) => a.content ?? "");

  const main = first(doc, element("main")) ?? first(doc, new RegExp(`<body${END}${ATTRS}>([\\s\\S]*?)(?:<\\/body\\s*>|$)`, "i")) ?? doc;
  // The first <title> outside an inline <svg>: Next.js streams a late one into the body, not the head.
  const titleRaw = first(doc.replace(SVG, " "), element("title"));
  const h1Raw = first(doc, element("h1"));
  return {
    title: titleRaw ? textOf(titleRaw) : "",
    description: meta("name", "description"),
    canonical: absolute(canonical, opts.url),
    noindex: [...robots, opts.xRobotsTag ?? ""].some(robotsNoindex),
    ogImage: absolute(meta("property", "og:image") ?? meta("name", "og:image"), opts.url),
    h1: h1Raw ? textOf(h1Raw) : "",
    sku: skuMatch ? (skuMatch[1] !== undefined ? jsonString(skuMatch[1]) : skuMatch[2]) : null,
    counts: {
      paragraphs: [...main.matchAll(element("p", "gi"))].filter((m) => textOf(m[1]) !== "").length,
      tables: (main.match(startTag("table")) ?? []).length,
      links: [...main.matchAll(startTag("a"))].filter((m) => attrs(m[0]).href).length,
      images: (main.match(startTag("img")) ?? []).length,
    },
  };
}

/**
 * What a page looks like at a glance: its title and h1. Equal fingerprints =
 * the same template saying the same thing. Never null: a 404 page with neither
 * is still a readable 404 page (`"|"`), and a page that also has neither matches it.
 */
export const fingerprint = (p: Pick<PageExtract, "title" | "h1">) => `${norm(p.title)}|${norm(p.h1)}`;
