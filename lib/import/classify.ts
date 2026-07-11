import type { ArchivePage } from "@/lib/import/archive";

/**
 * Site-import — Fase 1.1 · pure page classifier.
 *
 * Heuristic, deterministic, NO LLM, NO I/O — turns a scraped page into a coarse
 * `PageKind` so the import planner can show "here's what we'd create" before
 * anything is written. Imperfect by design (it's a *preview* the owner reviews +
 * corrects). Multi-language signals (da/en/de — the verticals Cartwright sees).
 *
 * Matching is by whole URL PATH SEGMENT (anchored), NOT bare substring, so a
 * product whose name merely contains a keyword (cookie-cutter, privacy-screen,
 * contact-grill) is not mis-bucketed as legal/contact. Price detection is
 * case-sensitive on word-currencies so "© 2024 KR Studio" is not a false price.
 */

export type PageKind = "home" | "product" | "service" | "blog" | "legal" | "contact" | "page";

// Whole-segment matchers (anchored ^…$), tested against each path segment + slug.
const LEGAL_SEG =
  /^(?:privacy(?:-policy)?|cookies?(?:-policy)?|cookiepolitik|terms(?:-of-service|-and-conditions)?|gdpr|disclaimer|datenschutz(?:erklaerung)?|impressum|widerruf(?:sbelehrung)?|agb|persondata(?:politik)?|handelsbetingelser|privatliv(?:spolitik)?|vilk(?:aa|å)r)$/;
const CONTACT_SEG =
  /^(?:contact|kontakt|reach-?us|find-?us|fachh(?:ae|ä)ndler|h(?:ae|ä)ndler|dealers?|forhandler[e]?|standorte|locations?)$/;
const SERVICE_SEG = /^(?:services?|ydelser?|leistungen?|solutions?|l(?:oe|ø)sninger?)$/;
const BLOG_SEG = /^(?:blog|news|nyhed(?:er)?|aktuelt|artikel|artikler|posts?|journal|magazine|insights?)$/;

// A dated CMS path (/2025/06/…) — a WEAK blog signal (loses to a price/product).
const DATE_PATH_RE = /\/(?:19|20)\d{2}\/\d{1,2}(?:\/|$)/;
// Price in copy — case-SENSITIVE on word-currencies (so "2024 KR Studio" is not
// a price); supports symbols (€£$), 3-letter codes, and Danish "10,- kr".
const PRICE_RE =
  /[€£$]\s?\d|\d[\d.,]*\s?[€£$]|\d[\d.,]*\s*,?-?\s*kr\b|\d[\d.,]*\s*(?:DKK|EUR|USD|GBP|dkk|eur|usd|gbp)\b/;
// A product-ish route (no price needed when combined with a gallery).
const PRODUCT_ROUTE = /(?:^|\/)(?:products?|produkt(?:er)?|shop|store|webshop|item)(?:\/|$)/i;

function pathSegments(page: ArchivePage): string[] {
  const segs: string[] = [];
  try {
    for (const s of new URL(page.url).pathname.toLowerCase().split("/")) {
      if (s) segs.push(s);
    }
  } catch {
    /* unparseable URL — fall back to the slug only */
  }
  segs.push(page.slug.toLowerCase());
  return segs;
}

const anySeg = (segs: string[], re: RegExp): boolean => segs.some((s) => re.test(s));

export function classifyPage(page: ArchivePage): PageKind {
  if (page.slug.toLowerCase() === "index") return "home";

  const segs = pathSegments(page);

  // Precise nav/content kinds first (whole-segment → product names that merely
  // contain a keyword are not stolen).
  if (anySeg(segs, LEGAL_SEG)) return "legal";
  if (anySeg(segs, CONTACT_SEG)) return "contact";
  if (anySeg(segs, SERVICE_SEG)) return "service";
  if (anySeg(segs, BLOG_SEG)) return "blog";

  // Strong product signals: a price in the copy, OR spec PDFs + an image gallery
  // (B2B/manufacturer, no listed price), OR a product route + at least one image.
  const hasPrice = PRICE_RE.test(page.markdown);
  const hasSpecDocs = page.media.documents.length > 0;
  const hasGallery = page.media.images.length >= 3;
  const onProductRoute = PRODUCT_ROUTE.test(page.url);
  if (hasPrice || (hasSpecDocs && hasGallery) || (onProductRoute && page.media.images.length >= 1)) {
    return "product";
  }

  // A dated path with no product signal → a blog post.
  if (DATE_PATH_RE.test(page.url)) return "blog";

  return "page";
}

export const PAGE_KINDS: readonly PageKind[] = [
  "home",
  "product",
  "service",
  "blog",
  "legal",
  "contact",
  "page",
];
