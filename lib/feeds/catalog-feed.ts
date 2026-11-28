import "server-only";

import { prisma } from "@/lib/db";
import { LIVE_PRODUCT_WHERE } from "@/lib/product-visibility";
import { getBrand } from "@/lib/brand";
import { routing } from "@/i18n/routing";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { flattenPrimitiveAttributes } from "@/lib/product-attributes";
import { productHref } from "@/lib/urls";

/**
 * Neutralt produkt-feed-item — én record pr. købbar enhed (produkt, eller
 * variant hvis produktet har varianter). Serializers bygger oven på dette:
 * ACP-feedet (JSONL) i dag — et Google Merchant-feed (XML) kan genbruge det.
 */
export type CatalogFeedItem = {
  /**
   * Id — variant-sku hvis produktet har varianter, ellers produktets egen sku
   * (`Product.sku`) når den kan være et id (se `idSku`) OG er ledig (se
   * `skuIdsTaken`), ellers slug. Stabilt så længe kataloget står stille: et
   * sku-id er ikke reserveret (se `skuIdsTaken`). Kun en vare uden varianter
   * er garanteret et id ACP sender tilbage til netop den, og kun når ACP's
   * trim lader id'et uændret: en slug med mellemrum om sig (kun en
   * SitePack-gendannelse skriver en, se ved `id` nedenfor) gør det ikke, og en
   * variant-sku er kun unik inden for sin vare (se varianternes gren nedenfor).
   */
  id: string;
  title: string;
  description: string;
  /** Pris i mindste valuta-enhed (øre/cents). */
  priceMinor: number;
  /** ISO-4217 currency code. */
  currency: string;
  availability: "in_stock" | "out_of_stock";
  /** Absolut produkt-URL. */
  url: string;
  /** Absolut billed-URL, eller null hvis produktet ingen billeder har. */
  imageUrl: string | null;
  brand: string | null;
  category: string;
  /**
   * Flade produkt-specifikationer (attribut-navn → værdi) fra Product.attributes
   * (+ variant-attributes for variant-items). Serialiseres som Google
   * `g:product_detail` (conversational attributes til AI Mode / Gemini shopping).
   * Undefined når produktet ingen primitive attributter har.
   */
  attributes?: Record<string, string>;
};

/**
 * Feedets attribut-fladning bor nu i lib/product-attributes.ts, så WebMCP's
 * PDP-deskriptor KAN komme til at bruge præcis samme regel. På denne branch er
 * dette feed stadig den eneste kaldere: deskriptor-halvdelen ligger i
 * PDP-render-sporet. Flytningen er forberedelse, ikke en opnået paritet.
 * Reglen er uændret: kun primitive værdier, nested objekter/arrays springes
 * over (tests/unit/catalog-feed-builder.test.ts holder den).
 */
const flatStringAttrs = flattenPrimitiveAttributes;

/**
 * Googles grænse for et `id` i Merchant Center: 1–50 tegn (product data
 * specification, "ID [id]"). En længere sku er intet id; varen listes under
 * sin slug. Talt i UTF-16-enheder (`length`), som aldrig tæller færre end
 * tegnene: en sku med tegn uden for BMP (emoji) kan falde til slug'en lidt
 * før 50 tegn, men et id over 50 tegn slipper aldrig igennem.
 */
const GOOGLE_ID_MAX_CHARS = 50;

/**
 * Produktets egen sku, hvis den kan være et feed-id — ellers null. ACP's
 * input-schema (lib/acp/index.ts: lineItemSchema, `z.string().trim().min(1)`)
 * trimmer et item_id, så en sku med mellemrum om sig når opslaget som en anden
 * streng: " CW-MUG-01 " bliver "CW-MUG-01", som intet svarer på — eller en
 * anden vare (" cup " → slug'en "cup"). Merchant Center fjerner også mellemrum
 * om et id. En SitePack-import gemmer en sku som den var. Tom, eller kun
 * mellemrum, er ingen sku; over GOOGLE_ID_MAX_CHARS heller ikke. Store og små
 * bogstaver røres ikke: Google kan læse to id'er der kun adskiller sig på
 * versaler som samme vare, men en sku sænkes ikke — så var den ikke længere
 * den værdi siden og arket kalder varen. Reglen står her og ikke som et import
 * af schemaet: acp-modulet afhænger af feeds, ikke omvendt
 * (scaffold/manifest.json); tests/unit/feed-acp-id-roundtrip.test.ts sender
 * feedets id'er gennem det rigtige schema, så de to ikke glider fra hinanden.
 */
function idSku(sku: string | null): string | null {
  return sku && sku === sku.trim() && sku.length <= GOOGLE_ID_MAX_CHARS ? sku : null;
}

/**
 * Strenge som ACP's opslag af et bart item_id (lib/acp/index.ts:
 * resolveLineItem) rammer FØR det prøver en vares egen sku: en live vares slug
 * og en variant-sku på en live vare. Forespørgslen tager kladder med, skønt ACP
 * ikke bestiller dem (CART-DRAFT-FILTER): udgives en kladde, rammer opslagene
 * dens slug igen, og et sku-id der allerede var holdt fri af den, flytter sig
 * ikke den dag.
 * `Product.sku` og `slug` er hver for sig unikke, men ikke på tværs: vare A med
 * sku "cup" og vare B med slug "cup" ville ellers give to items med id "cup",
 * og ACP (slug først) sende begge til B. En vare hvis sku er taget, listes
 * under sin slug som før. Et sku-id er ikke reserveret: får en anden vare
 * senere den slug, eller en variant den sku, flytter varen tilbage til sin
 * slug — og en agent der stadig har det ældre feeds sku-id, bestiller så den
 * anden vare (linjen svarer med dens slug og navn). Tjekket skelner mellem
 * store og små bogstaver, som databasens unikhed: sku "CUP" ved siden af
 * slug'en "cup" er to id'er her, men kan være én vare for Merchant Center.
 *
 * Kun forespurgt når en vare uden varianter har en sku der kan være et id
 * (idSku). `Product.sku` skrives af Google Sheets-synken (plugins/
 * google-workspace/lib/sheets-sync.ts — hver række kræver en sku, så hver
 * vare den har hentet har én) og af en SitePack-gendannelse; admin skriver kun
 * variant-sku'er, products.*-værktøjerne ingen sku. En butik uden varer med
 * egen sku betaler intet; en Sheets-synket butik betaler ved hver
 * feed-bygning: to ekstra fulde kolonnelæsninger (alle ikke-slettede slugs,
 * kladder med, og alle variant-sku'er), begrænset af katalogets størrelse og
 * uden IN-liste. Feed-ruterne caches 900 s (s-maxage).
 */
async function skuIdsTaken(
  products: Array<{ sku: string | null; variants: unknown[] }>,
): Promise<Set<string>> {
  if (!products.some((p) => p.variants.length === 0 && idSku(p.sku))) return new Set();
  const [slugs, variants] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null }, select: { slug: true } }),
    prisma.productVariant.findMany({
      where: { product: { deletedAt: null } },
      select: { sku: true },
    }),
  ]);
  return new Set([...slugs.map((r) => r.slug), ...variants.map((v) => v.sku)]);
}

/**
 * Henter hele det offentlige katalog som et neutralt feed. Soft-deletede
 * produkter (`deletedAt`) og kladder (`status: "draft"`) udelades — samme
 * public-catalogue-regel som sitemappet; en kladde er ikke en offentlig vare.
 * Udsolgte produkter BLIVER i feedet (availability: out_of_stock). Domæne +
 * valuta kommer fra getBrand(), så feedet følger operatørens runtime-domæne.
 * Bruges af /api/acp/feed og /feed/google.xml.
 */
export async function getCatalogFeed(): Promise<CatalogFeedItem[]> {
  const [merged, products] = await Promise.all([
    getBrand(),
    prisma.product.findMany({
      where: LIVE_PRODUCT_WHERE,
      include: { category: true, variants: { orderBy: { sku: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const taken = await skuIdsTaken(products);
  const base = merged.url.replace(/\/+$/, "");
  const currency = merged.policies.currency;
  const absolute = (img: string | undefined): string | null => {
    if (!img) return null;
    if (img.startsWith("http://") || img.startsWith("https://")) return img;
    return `${base}${img.startsWith("/") ? "" : "/"}${img}`;
  };

  const items: CatalogFeedItem[] = [];
  for (const p of products) {
    const imageUrl = absolute(resolveProductImageUrls(p)[0]);
    // The PDP lives under a locale; a bare `/product/x` costs every feed
    // consumer a 307. The feed's text is the base column, written in the
    // compile-time default locale. (The proxy may redirect `/` elsewhere when
    // an admin override is set; this link still answers 200, it is a locale
    // the shop serves. lib/request-locale.ts says why getBrand()'s value is
    // not trusted for this.)
    const url = `${base}${productHref({ slug: p.slug, permalink: p.permalink }, routing.defaultLocale)}`;
    const productAttrs = flatStringAttrs(p.attributes);
    if (p.variants.length > 0) {
      for (const v of p.variants) {
        // Variant-item: produkt-specs + variantens egne akser (variant vinder).
        // Id'et er variantens sku, som kun er unik inden for sin vare
        // (@@unique([productId, sku])): to varers varianter kan dele én, og en
        // variant-sku kan være en anden vares slug. Så står id'et to gange, og
        // ACP sender begge til én vare. En variant-sku over Googles 50 tegn
        // listes også som den er. Ældre end FEED-SKU; ikke rettet her.
        const combined = { ...(productAttrs ?? {}), ...(flatStringAttrs(v.attributes) ?? {}) };
        items.push({
          id: v.sku,
          title: p.name,
          description: p.description,
          priceMinor: v.priceDkk,
          currency,
          availability: v.stock > 0 ? "in_stock" : "out_of_stock",
          url,
          imageUrl,
          brand: p.brand,
          category: p.category.name,
          attributes: Object.keys(combined).length ? combined : undefined,
        });
      }
    } else {
      const sku = idSku(p.sku);
      items.push({
        // Samme identitet som PDP'ens Product JSON-LD (`product.sku || …`), så
        // Merchant Center / ACP og siden er enige om varen — når sku'en er
        // ledig (skuIdsTaken); ellers slug. Begge veje finder ACP netop denne
        // vare på id'et, når ACP's trim lader det uændret, og et sku-id deler
        // ingen anden vare (en slug kan en variant-sku dele, se ovenfor). En
        // tom sku, en ACP ville trimme, eller en over 50 tegn (idSku), tæller
        // som ingen. Slug for en vare uden sku — dér siger siden
        // database-id'et, som feedet aldrig har brugt. Slug'en listes som den
        // er: admin, products.*-værktøjerne, CSV, Sheets, scrape og hoptify
        // skriver kun [a-z0-9-], men en SitePack-gendannelse beholder en slug
        // som den var, så "cup " når ACP som "cup" — en anden vare, eller
        // ingen (ældre end FEED-SKU; SITEPACK-SLUG-VALIDATE). Slug'en er heller
        // ikke holdt under Googles 50 tegn (også ældre).
        id: sku && !taken.has(sku) ? sku : p.slug,
        title: p.name,
        description: p.description,
        priceMinor: p.priceDkk,
        currency,
        availability: p.stock > 0 ? "in_stock" : "out_of_stock",
        url,
        imageUrl,
        brand: p.brand,
        category: p.category.name,
        attributes: productAttrs,
      });
    }
  }
  return items;
}
