import type { MigrationFetcher } from "./fetch";

/**
 * MIGD — read a source site's sitemap into the URL list the freeze snapshots:
 * index → child sitemaps → `<url>` entries with their `image:loc`s. Pure over an
 * injected fetcher. Child sitemaps and every redirect are followed on the ROOT'S
 * ORIGIN only (scheme + host + port; the one exception is an http root upgrading
 * to https on the same host and default port) — a third host is reported
 * `foreign-host`, the same host on another port or scheme `foreign-origin`, and
 * neither is requested (a sitemap is attacker-influenced input). A third-host
 * `<url>` is reported, not frozen. URLs are kept exactly as listed (deduplicated
 * by the whole string), so a variation URL `?attribute_pa_*` is its own entry.
 * Stops at `SITEMAP_URL_CAP`. A document whose root or any `<url>`/`<sitemap>`
 * entry is not closed, or an entry without a `<loc>`, is `invalid` — a cut-off
 * sitemap is an error, never a shorter list. The markup is read in one linear
 * pass (a 10 MB hostile body cannot block the event loop). Parses what WordPress
 * core, Yoast and WooCommerce emit (unprefixed sitemap namespace, `image:`,
 * CDATA, entities); gzipped `.xml.gz` sitemaps are not read.
 */

export const SITEMAP_URL_CAP = 20_000;

type Loc = { loc: string; lastmod?: string };
export type ParsedSitemap =
  | { kind: "index"; sitemaps: Loc[] }
  | { kind: "urlset"; urls: (Loc & { images: string[] })[] }
  /** It opens as a sitemap but is cut off or malformed — never read as a shorter list. */
  | { kind: "invalid"; reason: string }
  | { kind: "unknown" };
export type SitemapUrl = Loc & { images: string[]; sitemap: string };
export type SitemapReport = { url: string; status: "ok" | "refused" | "error" | "inconclusive"; kind?: "index" | "urlset"; count?: number; detail?: string };
export type SitemapCrawl = {
  urls: SitemapUrl[];
  sitemaps: SitemapReport[];
  /** Third-host `<url><loc>`s: counted, first 20 kept. */
  foreign: { count: number; first: { loc: string; sitemap: string }[] };
  /** A limit stopped the crawl: the URL cap, or the sitemap-file cap. */
  capped: false | "urls" | "sitemaps";
  /** Every sitemap was read and no cap was hit — the only state a freeze may snapshot. */
  complete: boolean;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  if (cdata) return cdata[1].trim();
  return raw
    .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()];
      const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    })
    .trim();
}

type Tag = { kind: "open" | "close" | "self"; name: string; start: number; end: number; bad: boolean };

/** Constructs skipped whole (order matters: `<!--` and `<![CDATA[` before `<!`). */
const SKIPPED: readonly (readonly [open: string, close: string])[] = [
  ["<!--", "-->"],
  ["<![CDATA[", "]]>"],
  ["<?", "?>"],
  ["<!", ">"],
];

const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";

/**
 * ONE left-to-right pass over the markup. Every step jumps past a delimiter found
 * with `indexOf` from the current position, so the walk is linear in the document
 * (no regex rescans the tail once per unmatched tag). Comments, CDATA, processing
 * instructions and declarations are skipped as units. A tag is `bad` when it has
 * no name, holds a `<`, or is an end tag with anything but whitespace after its
 * name — XML's end tag is `'</' Name S? '>'`, so `</url >` is a valid close, for
 * pairing and counting alike. The walk stops when `visit` returns false, or at a
 * construct that is never terminated (the body ends inside it).
 */
function walkTags(doc: string, visit: (tag: Tag) => boolean): void {
  for (let i = doc.indexOf("<"); i >= 0; i = doc.indexOf("<", i)) {
    const next = doc[i + 1];
    const skipped = next === "!" || next === "?" ? SKIPPED.find(([open]) => doc.startsWith(open, i)) : undefined;
    if (skipped) {
      const end = doc.indexOf(skipped[1], i + skipped[0].length);
      if (end < 0) return;
      i = end + skipped[1].length;
      continue;
    }
    const gt = doc.indexOf(">", i + 1);
    if (gt < 0) return;
    const close = next === "/";
    const self = !close && doc[gt - 1] === "/";
    const from = i + (close ? 2 : 1);
    const stop = self ? gt - 1 : gt;
    let to = from;
    while (to < stop && !isSpace(doc[to]) && doc[to] !== "/") to++;
    // A `<` before this tag's `>` means the tag holds one; scanning to the next `<`
    // only reads text the outer loop reads anyway, so the walk stays linear.
    const lt = doc.indexOf("<", i + 1);
    let bad = to === from || (lt >= 0 && lt < gt);
    for (let k = to; close && !bad && k < gt; k++) bad = !isSpace(doc[k]);
    if (!visit({ kind: close ? "close" : self ? "self" : "open", name: doc.slice(from, to), start: i, end: gt, bad })) return;
    i = gt + 1;
  }
}

/** The entry element each root holds, and the text fields read inside an entry. */
const ENTRY = { sitemapindex: "sitemap", urlset: "url" } as const;
const FIELDS: Record<(typeof ENTRY)[Root], readonly string[]> = { sitemap: ["loc", "lastmod"], url: ["loc", "lastmod", "image:loc"] };
type Root = keyof typeof ENTRY;
const isRoot = (name: string): name is Root => Object.hasOwn(ENTRY, name);
type Entry = { loc?: string; lastmod?: string; images: string[] };

/**
 * A sitemap index or urlset, read in one pass. The root must be closed (or
 * self-closing), every `<url>`/`<sitemap>` entry opened must be closed before the
 * next one opens, and each must carry a non-empty `<loc>` — the first broken
 * entry rejects the document on the spot. A body cut between two entries still
 * ends cleanly, so anything short of that would read as a shorter list.
 */
export function parseSitemapXml(xml: string): ParsedSitemap {
  // State lives in one object: TypeScript does not see assignments made inside the callback.
  const st: { root: Root | null; closed: boolean; reason: string | null; entry: Entry | null; field: { name: string; from: number } | null } =
    { root: null, closed: false, reason: null, entry: null, field: null };
  const entries: Entry[] = [];
  const reject = (why: string) => {
    st.reason = why;
    return false;
  };

  walkTags(xml, (tag) => {
    if (!st.root) {
      // Anything before the root (an HTML soft 404, a stylesheet PI) is not ours to judge.
      if (tag.bad || tag.kind === "close" || !isRoot(tag.name)) return true;
      st.root = tag.name;
      st.closed = tag.kind === "self";
      return !st.closed;
    }
    const { root, entry, field } = st;
    const item = ENTRY[root];
    if (tag.bad) return reject(`a malformed tag inside <${root}>`);
    if (entry && field) {
      if (tag.kind !== "close" || tag.name !== field.name) return reject(`<${field.name}> holds markup`);
      const text = decodeXmlText(xml.slice(field.from, tag.start));
      if (field.name === "loc") entry.loc ??= text;
      else if (field.name === "lastmod") entry.lastmod ??= text || undefined;
      else if (text) entry.images.push(text);
      st.field = null;
      return true;
    }
    if (tag.name === item) {
      if (tag.kind === "close") {
        if (!entry) return reject(`a </${item}> closes no entry`);
        if (!entry.loc) return reject(`a <${item}> entry has no <loc>`);
        entries.push(entry);
        st.entry = null;
        return true;
      }
      if (entry) return reject(`a <${item}> entry is not closed`);
      if (tag.kind === "self") return reject(`a <${item}> entry has no <loc>`);
      st.entry = { images: [] };
      return true;
    }
    if (tag.kind === "close" && tag.name === root) {
      if (entry) return reject(`a <${item}> entry is not closed`);
      st.closed = true;
      return false;
    }
    if (entry && tag.kind === "open" && FIELDS[item].includes(tag.name)) st.field = { name: tag.name, from: tag.end + 1 };
    return true;
  });

  if (!st.root) return { kind: "unknown" };
  if (st.reason) return { kind: "invalid", reason: st.reason };
  if (!st.closed) return { kind: "invalid", reason: `<${st.root}> is not closed` };
  const locs = entries.map(({ loc = "", lastmod }) => (lastmod ? { loc, lastmod } : { loc }));
  if (st.root === "sitemapindex") return { kind: "index", sitemaps: locs };
  return { kind: "urlset", urls: locs.map((l, n) => ({ ...l, images: entries[n].images })) };
}

const resolveUrl = (u: string, base?: string) => (URL.canParse(u, base) ? new URL(u, base) : null);
const sameHost = (u: string, host: string) => resolveUrl(u)?.hostname.toLowerCase() === host;

/**
 * The record type a WordPress sitemap file lists, read from its name — the `kind`
 * a freeze stores per URL: Yoast `product-sitemap2.xml` → `product`, core
 * `wp-sitemap-posts-page-1.xml` → `page`, `wp-sitemap-taxonomies-product_cat-1.xml`
 * → `product_cat`. Any other name is `url`.
 */
export function sitemapKind(sitemapUrl: string): string {
  const file = resolveUrl(sitemapUrl)?.pathname.split("/").pop() ?? "";
  const m = /^wp-sitemap-(?:posts|taxonomies)-([\w-]+?)-\d+\.xml$/i.exec(file) ?? /^([\w-]+?)-sitemap\d*\.xml$/i.exec(file);
  return m ? m[1].toLowerCase() : "url";
}

/**
 * Why a sitemap file (a child or a redirect hop) may not be requested, or null
 * when it may: it must be on the root's origin. The single exception is an http
 * root upgrading to https on the same host, both on the default port.
 */
function leavesOrigin(u: string, root: URL): "foreign-host" | "foreign-origin" | null {
  const next = resolveUrl(u);
  if (!next || next.hostname !== root.hostname) return "foreign-host";
  if (next.origin === root.origin) return null;
  const upgrade = root.protocol === "http:" && next.protocol === "https:" && root.port === "" && next.port === "";
  return upgrade ? null : "foreign-origin";
}

export async function crawlSitemap(
  rootUrl: string,
  opts: { fetch: MigrationFetcher; maxUrls?: number; maxSitemaps?: number; maxBytes?: number },
): Promise<SitemapCrawl> {
  const maxUrls = opts.maxUrls ?? SITEMAP_URL_CAP;
  const maxSitemaps = opts.maxSitemaps ?? 200;
  const out: SitemapCrawl = { urls: [], sitemaps: [], foreign: { count: 0, first: [] }, capped: false, complete: false };
  const root = resolveUrl(rootUrl);
  const host = root?.hostname.toLowerCase();
  if (!root || !host) return { ...out, sitemaps: [{ url: rootUrl, status: "error", detail: "invalid sitemap URL" }] };
  const queue = [rootUrl];
  const seenSitemaps = new Set(queue);
  const seenUrls = new Set<string>();
  let fetched = 0;

  crawl: while (queue.length > 0) {
    if (fetched++ >= maxSitemaps) {
      out.capped = "sitemaps";
      break;
    }
    const sitemap = queue.shift()!;
    const read = await readSitemap(sitemap, root, opts);
    if ("report" in read) {
      out.sitemaps.push(read.report);
      continue;
    }
    const { parsed } = read;
    if (parsed.kind === "index") {
      out.sitemaps.push({ url: sitemap, status: "ok", kind: "index", count: parsed.sitemaps.length });
      for (const { loc } of parsed.sitemaps) {
        const leaves = leavesOrigin(loc, root);
        if (leaves) out.sitemaps.push({ url: loc, status: "refused", detail: leaves });
        else if (!seenSitemaps.has(loc)) {
          seenSitemaps.add(loc);
          queue.push(loc);
        }
      }
      continue;
    }
    out.sitemaps.push({ url: sitemap, status: "ok", kind: "urlset", count: parsed.urls.length });
    for (const u of parsed.urls) {
      if (!sameHost(u.loc, host)) {
        if (out.foreign.count++ < 20) out.foreign.first.push({ loc: u.loc, sitemap });
        continue;
      }
      if (seenUrls.has(u.loc)) continue;
      if (out.urls.length >= maxUrls) {
        out.capped = "urls";
        break crawl;
      }
      seenUrls.add(u.loc);
      out.urls.push({ ...u, sitemap });
    }
  }
  out.complete = !out.capped && out.sitemaps.every((s) => s.status === "ok");
  return out;
}

/** One sitemap file, following at most 3 redirects on the root's own origin. */
async function readSitemap(
  url: string,
  root: URL,
  opts: { fetch: MigrationFetcher; maxBytes?: number },
): Promise<{ parsed: Extract<ParsedSitemap, { kind: "index" | "urlset" }> } | { report: SitemapReport }> {
  const fail = (status: SitemapReport["status"], detail: string) => ({ report: { url, status, detail } });
  let current = url;
  for (let hop = 0; ; hop++) {
    const accept = "application/xml,text/xml;q=0.9,*/*;q=0.5";
    const res = await opts.fetch(current, { accept, maxBytes: opts.maxBytes ?? 10_000_000 });
    if (res.outcome !== "answer") return fail(res.outcome, res.reason);
    if (res.status >= 300 && res.status < 400) {
      const next = res.location ? resolveUrl(res.location, current)?.href : undefined;
      if (!next) return fail("error", `HTTP ${res.status} without Location`);
      const leaves = leavesOrigin(next, root);
      if (leaves) return fail("refused", leaves);
      if (hop >= 3) return fail("error", "more than 3 redirects");
      current = next;
      continue;
    }
    if (res.status < 200 || res.status >= 300) return fail("error", `HTTP ${res.status}`);
    if (res.truncated) return fail("error", "sitemap larger than the read limit");
    const parsed = parseSitemapXml(res.body);
    if (parsed.kind === "unknown") return fail("error", "not a sitemap (no <urlset> or <sitemapindex>)");
    if (parsed.kind === "invalid") return fail("error", `cut off or malformed: ${parsed.reason}`);
    return { parsed };
  }
}
