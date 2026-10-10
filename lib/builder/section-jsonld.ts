/**
 * Section → Schema.org JSON-LD.
 *
 * Makes Magic Builder / Aurora pages (rendered from Page.layoutJson) citable by
 * AI search engines + Google rich results: each whitelisted section maps to the
 * appropriate Schema.org type. Pure + deterministic — the <JsonLd> component
 * (components/JsonLd.tsx) does the injection-safe escaping at render.
 *
 * HONESTY RULES (don't emit misleading structured data):
 *  - testimonials carry no rating → emit `Review` WITHOUT `reviewRating`
 *    (never an AggregateRating with an invented score).
 *  - pricingTable `price` is a free display string ("199 kr", "$29/mo") with no
 *    reliable currency → emit an `ItemList` of plan names, NO Offer price.
 *  - presentational sections (hero, valueProps, …) emit nothing.
 *
 * Mirrors the existing FAQPage pattern in app/[locale]/category/[slug]/page.tsx.
 */

type SectionLike = { key: string; props?: Record<string, unknown> };
type JsonLdObject = Record<string, unknown>;
type BuildOpts = { baseUrl: string; orgName: string };

/** Resolve a possibly-relative asset URL to absolute (Schema.org prefers absolute). */
function absUrl(baseUrl: string, src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${src.startsWith("/") ? "" : "/"}${src}`;
}

function asObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

const SCHEMA = "https://schema.org";

/**
 * Build the JSON-LD for one resolved section. Returns a single object, an array
 * of objects (testimonials → many Reviews), or null for sections that carry no
 * citable structured data.
 */
export function buildSectionJsonLd(
  section: SectionLike,
  opts: BuildOpts,
): JsonLdObject | JsonLdObject[] | null {
  const p = section.props ?? {};

  switch (section.key) {
    case "faq": {
      const items = asObjects(p.items);
      if (!items.length) return null;
      return {
        "@context": SCHEMA,
        "@type": "FAQPage",
        mainEntity: items.map((it) => ({
          "@type": "Question",
          name: String(it.question ?? ""),
          acceptedAnswer: { "@type": "Answer", text: String(it.answer ?? "") },
        })),
      };
    }

    case "howItWorks": {
      const steps = asObjects(p.steps);
      if (!steps.length) return null;
      return {
        "@context": SCHEMA,
        "@type": "HowTo",
        ...(p.title ? { name: String(p.title) } : {}),
        ...(p.description ? { description: String(p.description) } : {}),
        step: steps.map((s, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: String(s.title ?? ""),
          text: String(s.body ?? ""),
        })),
      };
    }

    case "galleryGrid": {
      const items = asObjects(p.items);
      if (!items.length) return null;
      return {
        "@context": SCHEMA,
        "@type": "ImageGallery",
        ...(p.title ? { name: String(p.title) } : {}),
        associatedMedia: items.map((it) => ({
          "@type": "ImageObject",
          contentUrl: absUrl(opts.baseUrl, String(it.src ?? "")),
          ...(it.alt ? { caption: String(it.alt) } : {}),
        })),
      };
    }

    case "testimonials": {
      const items = asObjects(p.items);
      if (!items.length) return null;
      // Review[] — itemReviewed = the brand Organization. No reviewRating (no data).
      return items.map((it) => ({
        "@context": SCHEMA,
        "@type": "Review",
        reviewBody: String(it.quote ?? ""),
        author: { "@type": "Person", name: String(it.author ?? "") },
        itemReviewed: { "@type": "Organization", name: opts.orgName },
      }));
    }

    case "pricingTable": {
      const plans = asObjects(p.plans);
      if (!plans.length) return null;
      return {
        "@context": SCHEMA,
        "@type": "ItemList",
        ...(p.title ? { name: String(p.title) } : {}),
        itemListElement: plans.map((pl, i) => {
          const features = pl.features;
          return {
            "@type": "ListItem",
            position: i + 1,
            name: String(pl.name ?? ""),
            ...(Array.isArray(features) && features.length
              ? { description: (features as unknown[]).map(String).join("; ") }
              : {}),
          };
        }),
      };
    }

    default:
      // Presentational sections (hero/valueProps/featureGrid/logoCloud/statBand/
      // quote/ctaFooter/richText/vibe/stackGrid/bannerCta/newsletterBlock/
      // splitHero/mediaHero/featureSplit) carry no citable structured data.
      return null;
  }
}

/**
 * Flatten the JSON-LD for a whole page's sections into a single array, ready for
 * `<JsonLd data={...} />`. Returns [] when nothing is citable.
 */
export function buildPageSectionsJsonLd(
  sections: SectionLike[],
  opts: BuildOpts,
): JsonLdObject[] {
  return sections.flatMap((s) => {
    const ld = buildSectionJsonLd(s, opts);
    if (ld == null) return [];
    return Array.isArray(ld) ? ld : [ld];
  });
}
