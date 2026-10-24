/**
 * The migration check catalogue — every check a move from WordPress/WooCommerce
 * to Cartwright has to pass, as pure data (no I/O). `/admin/migration` renders
 * it, the runner (a later slice) executes it, and `readyForDns` in ./ready.ts
 * counts the `required` rows. hegnsfabrikken.dk is reference no. 1, but nothing
 * here is specific to it.
 *
 * `compares.a` is what is measured on the old site (or frozen from it), `b`
 * what it is held against. `verify: "attest"` is a row the owner signs off with
 * a note; "machine+attest" needs both. `input: "owner"` needs something only
 * the owner can supply (DKIM selectors, golden cases, a test order).
 */

export type CheckGroup =
  | "url" | "media" | "seo" | "data" | "redirect" | "calculator"
  | "payment" | "dns" | "performance" | "adapter" | "automation" | "cutover";

/** A run's verdict. `skip` and `inconclusive` are never a pass. */
export type CheckStatus = "pass" | "warn" | "fail" | "skip" | "inconclusive";

export type CatalogRow = {
  id: string;
  group: CheckGroup;
  label: string;
  compares: { a: string; b: string };
  verify: "machine" | "attest" | "machine+attest";
  phase: "before" | "after" | "both";
  input: "generic" | "owner";
  /** Counts toward "Ready for DNS switch". */
  required: boolean;
  oftenForgotten?: true;
  dependsOn?: string[];
};

export const CHECK_GROUPS: readonly { id: CheckGroup; label: string }[] = [
  { id: "url", label: "URLs" },
  { id: "media", label: "Media" },
  { id: "seo", label: "SEO & Google" },
  { id: "data", label: "Data parity" },
  { id: "redirect", label: "Redirects" },
  { id: "calculator", label: "Calculator" },
  { id: "payment", label: "Payment" },
  { id: "dns", label: "Mail & DNS" },
  { id: "performance", label: "Performance (not a switch requirement)" },
  { id: "adapter", label: "Adapters" },
  { id: "automation", label: "Automation parity" },
  { id: "cutover", label: "Cutover & after" },
];

export const CHECK_CATALOG: readonly CatalogRow[] = [
  { id: "url.frozen", group: "url", label: "URL snapshot is fresh", compares: { a: "frozen sitemap snapshot", b: "younger than 7 days" }, verify: "machine", phase: "before", input: "generic", required: false },
  { id: "url.parity", group: "url", label: "Every old URL answers on the new site", compares: { a: "every frozen path, incl. variant (?attribute_pa_*) and /page/N/ URLs", b: "the new host, manual redirects, at most 3 hops" }, verify: "machine", phase: "both", input: "generic", required: true, dependsOn: ["url.frozen"] },
  { id: "url.content", group: "url", label: "Pages carry the same content", compares: { a: "frozen h1, SKU, paragraphs, tables, links, image count", b: "the new page; a soft 404 is likeness to a known 404" }, verify: "machine", phase: "both", input: "generic", required: true, dependsOn: ["url.frozen"] },
  { id: "url.new-sitemap", group: "url", label: "The new sitemap lists the pages", compares: { a: "frozen URLs", b: "the new sitemap.xml" }, verify: "machine", phase: "both", input: "generic", required: false },

  { id: "media.map", group: "media", label: "Every old image has an alias", compares: { a: "image manifest: Store API images, HTML srcset/data-src/url(), sitemap", b: "media aliases, per exact variant" }, verify: "machine", phase: "before", input: "generic", required: true },
  { id: "media.serves", group: "media", label: "Aliased images are served", compares: { a: "media aliases", b: "200 + image/* + matching magic bytes" }, verify: "machine", phase: "before", input: "generic", required: false, dependsOn: ["media.map"] },
  { id: "media.old-urls", group: "media", label: "Old image URLs redirect", compares: { a: "old /wp-content/uploads URL", b: "301 → 200" }, verify: "machine", phase: "after", input: "generic", required: false, oftenForgotten: true, dependsOn: ["media.map"] },

  { id: "seo.head", group: "seo", label: "Head tags match", compares: { a: "frozen title, canonical, robots, og tags + X-Robots-Tag", b: "the new page's head; canonical on the expected host" }, verify: "machine", phase: "both", input: "generic", required: false, dependsOn: ["url.frozen"] },
  { id: "seo.product-jsonld", group: "seo", label: "Product structured data matches", compares: { a: "frozen Product/Offer sku, price, availability, image", b: "the new product page's JSON-LD" }, verify: "machine", phase: "both", input: "generic", required: true },
  { id: "seo.robots", group: "seo", label: "robots.txt allows the same", compares: { a: "old robots.txt", b: "new robots.txt" }, verify: "machine", phase: "both", input: "generic", required: false },
  { id: "seo.feeds", group: "seo", label: "Product feeds hold the same items", compares: { a: "feed items by the feed's own export rules", b: "the new feed; sample URLs answer 200" }, verify: "machine", phase: "both", input: "generic", required: false },
  { id: "seo.gsc-sitemap", group: "seo", label: "Sitemap submitted in Search Console", compares: { a: "the new sitemap", b: "Google Search Console" }, verify: "attest", phase: "after", input: "owner", required: false },

  { id: "data.counts", group: "data", label: "Record counts match", compares: { a: "Store API X-WP-Total per type + wp/v2", b: "database counts, with an explained skip list" }, verify: "machine", phase: "before", input: "generic", required: true },
  { id: "data.ids", group: "data", label: "Record ids match", compares: { a: "source ids", b: "imported ids" }, verify: "machine", phase: "before", input: "generic", required: false },
  { id: "data.prices", group: "data", label: "Prices match", compares: { a: "source prices incl. compare-at", b: "imported prices; every difference above 0 øre" }, verify: "machine", phase: "before", input: "generic", required: false },
  { id: "data.stock", group: "data", label: "Every product has exact stock", compares: { a: "source stock", b: "imported stock; no product without an exact figure" }, verify: "machine", phase: "before", input: "generic", required: true },
  { id: "data.freshness", group: "data", label: "Imported data is fresh", compares: { a: "last import", b: "now" }, verify: "machine", phase: "before", input: "generic", required: false },

  { id: "redirect.imported", group: "redirect", label: "Imported redirects land", compares: { a: "each imported source path", b: "its status once, then 200" }, verify: "machine", phase: "both", input: "generic", required: true },
  { id: "redirect.active", group: "redirect", label: "Redirects are active, not only saved", compares: { a: "saved redirects", b: "redirects the site actually serves" }, verify: "machine", phase: "before", input: "generic", required: false, oftenForgotten: true },
  { id: "redirect.legacy-shadow", group: "redirect", label: "No frozen path is shadowed by legacy slugs", compares: { a: "frozen paths", b: "the engine's legacy slug prefixes" }, verify: "machine", phase: "before", input: "generic", required: false },

  { id: "eq.calculator", group: "calculator", label: "The calculator gives the same answers", compares: { a: "golden cases + fuzz set from the old calculator", b: "the configured calculator tool, to the øre" }, verify: "machine", phase: "before", input: "owner", required: true },
  { id: "eq.cart", group: "calculator", label: "A calculation survives add-to-cart", compares: { a: "calculator result", b: "the cart line" }, verify: "machine", phase: "before", input: "generic", required: false, dependsOn: ["eq.calculator"] },

  { id: "pay.webhook", group: "payment", label: "Payment webhooks are idempotent", compares: { a: "signed, repeated and late events", b: "exactly one order and one stock change" }, verify: "machine", phase: "before", input: "generic", required: false },
  { id: "pay.test-order", group: "payment", label: "A test order went through", compares: { a: "a test order (number, refunded)", b: "the owner's sign-off" }, verify: "attest", phase: "before", input: "owner", required: true },
  { id: "pay.methods", group: "payment", label: "Payment methods match", compares: { a: "old checkout's methods", b: "new checkout's methods" }, verify: "machine", phase: "before", input: "generic", required: false },
  { id: "cart.matrix", group: "payment", label: "Cart totals hold across VAT, shipping class and options", compares: { a: "VAT × shipping class × options", b: "the owner's sign-off" }, verify: "attest", phase: "before", input: "owner", required: true },

  { id: "dns.mail", group: "dns", label: "The new sender authenticates", compares: { a: "frozen SPF/DKIM/DMARC", b: "the new sender's records, a test delivery and its spam score" }, verify: "machine", phase: "before", input: "owner", required: true },
  { id: "dns.web", group: "dns", label: "Web DNS points at the new site", compares: { a: "apex and www records", b: "the expected target" }, verify: "machine", phase: "both", input: "generic", required: false },
  { id: "dns.ttl", group: "dns", label: "TTL is low before the switch", compares: { a: "current TTL", b: "at most 300 s" }, verify: "machine", phase: "before", input: "generic", required: false, oftenForgotten: true },
  { id: "mail.transactional", group: "dns", label: "Transactional mail arrives", compares: { a: "order and account mail", b: "the owner's sign-off" }, verify: "attest", phase: "before", input: "owner", required: false },

  { id: "perf.cwv", group: "performance", label: "Core Web Vitals (sample of 20)", compares: { a: "old LCP/CLS", b: "new LCP/CLS" }, verify: "machine", phase: "both", input: "generic", required: false },
  { id: "perf.images", group: "performance", label: "No /wp-content/ left in product pages", compares: { a: "product page HTML", b: "no /wp-content/ references" }, verify: "machine", phase: "both", input: "generic", required: false },

  { id: "adapter.operator", group: "adapter", label: "The owner's own workflows still work", compares: { a: "each operator flow: quote, custom-line order, invoice reference, drawing attachment, product lookup, stock", b: "the same flow replayed against Cartwright's tools, then signed off" }, verify: "machine+attest", phase: "before", input: "owner", required: true },
  { id: "adapter.matrix", group: "adapter", label: "Every active plugin has an adapter", compares: { a: "Site Health plugin list", b: "the adapter matrix" }, verify: "machine", phase: "after", input: "owner", required: false },
  { id: "adapter.flags", group: "adapter", label: "Adapter flags are on", compares: { a: "the adapter matrix", b: "the site's feature flags" }, verify: "machine", phase: "both", input: "generic", required: false },

  { id: "automation.parity", group: "automation", label: "Every WordPress automation has a replacement", compares: { a: "automations that live in WordPress (stock sync, shipping labels, accounting, feeds, mail triggers)", b: "a named replacement, or an accepted manual stand-in with owner and date" }, verify: "attest", phase: "before", input: "owner", required: true, oftenForgotten: true },

  { id: "cutover.reconciled", group: "cutover", label: "Cutover reconciled", compares: { a: "checkout paused, picking frozen, last delta, payments in flight", b: "the owner's sign-off" }, verify: "attest", phase: "before", input: "owner", required: true },
  { id: "cutover.switched", group: "cutover", label: "DNS switched", compares: { a: "the switch", b: "the owner's sign-off (sets the switch time)" }, verify: "attest", phase: "after", input: "owner", required: false, dependsOn: ["cutover.reconciled"] },
  { id: "watch.404", group: "cutover", label: "Watch 404s", compares: { a: "404 hits on the new site", b: "frozen paths + extra entries" }, verify: "machine", phase: "after", input: "generic", required: false, dependsOn: ["cutover.switched"] },
  { id: "watch.redirect-hits", group: "cutover", label: "Watch redirect hits", compares: { a: "redirect hits", b: "imported redirects" }, verify: "machine", phase: "after", input: "generic", required: false, dependsOn: ["cutover.switched"] },
  { id: "watch.old-host", group: "cutover", label: "The old host is retired", compares: { a: "/wp-admin and checkout on the old host", b: "no answer, then the owner's sign-off" }, verify: "machine+attest", phase: "after", input: "owner", required: false, dependsOn: ["cutover.switched"] },
  { id: "watch.reindex", group: "cutover", label: "Google re-indexes the new URLs", compares: { a: "indexed old URLs", b: "indexed new URLs" }, verify: "machine", phase: "after", input: "generic", required: false, dependsOn: ["cutover.switched"] },
];
