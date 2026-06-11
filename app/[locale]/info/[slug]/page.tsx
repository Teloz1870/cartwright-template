import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { renderContentBlocks, type ContentBlock } from "@/lib/content";
import { resolvePageLayout } from "@/lib/builder/page-layout";
import { buildPageSectionsJsonLd } from "@/lib/builder/section-jsonld";
import { PageSections } from "@/components/builder/PageSections";
import JsonLd from "@/components/JsonLd";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import { pageOg, toAbsoluteUrl } from "@/lib/og";
import AnimatedPageContent from "./AnimatedPageContent";
import { getDefaultLegalContent } from "@/lib/legal/default-content";
import { getActiveDesign } from "@/lib/theme";

type Props = { params: Promise<{ slug: string; locale: string }> };

/**
 * The default-legal content keeps a heading and its first body line in one block
 * (single newline, no blank line), so renderContentBlocks returns a heading whose
 * text includes body. Split those for design `info` templates so a heading isn't
 * rendered as a giant (uppercase, in some designs) block of prose. The default
 * AnimatedPageContent keeps its existing behaviour (unchanged).
 */
function splitHeadingBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const b of blocks) {
    if (b.type === "heading" && b.text.includes("\n")) {
      const nl = b.text.indexOf("\n");
      out.push({ type: "heading", text: b.text.slice(0, nl).trim() });
      const rest = b.text.slice(nl + 1).trim();
      if (rest) out.push({ type: "paragraph", text: rest });
    } else {
      out.push(b);
    }
  }
  return out;
}

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) {
    const fallback = getDefaultLegalContent(slug, locale);
    if (fallback) return { title: fallback.title, ...pageOg(fallback.title, "") };
    return { title: "Side ikke fundet" };
  }

  // metaTitle (per-locale via translations) wins; else the localized title.
  const pageTitle = page.metaTitle || (await getDynamicTranslation(page, "title", page.title));
  const description = page.metaDescription || "";

  return {
    title: pageTitle,
    description: description || undefined,
    // Prefer the page's hero photo for the share card; else a generated card.
    ...pageOg(pageTitle, description, page.heroImage ? toAbsoluteUrl(page.heroImage) : undefined),
  };
}

export default async function InfoPage({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  // Design-owned info-page template (DesignPack.pages.info) — wraps the markdown
  // content in the design's prose, inside its Shell + chrome. Unset → the default
  // AnimatedPageContent (byte-identical). Only the markdown paths use it; builder
  // layoutJson + vibeHtml pages keep their own rendering.
  const InfoTemplate = (await getActiveDesign().catch(() => null))?.pages?.info;

  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) {
    // Default legal-indhold (privacy/terms/cookies) så footer-links ikke 404'er
    // på en frisk shop. En CMS-Page med samme slug overskriver dette.
    const fallback = getDefaultLegalContent(slug, locale);
    if (fallback) {
      const blocks = renderContentBlocks(fallback.body);
      if (InfoTemplate) return <InfoTemplate locale={locale} title={fallback.title} blocks={splitHeadingBlocks(blocks)} />;
      return (
        <AnimatedPageContent
          page={{ title: fallback.title, heroImage: null }}
          blocks={blocks}
          editEnabled={false}
          slug={slug}
        />
      );
    }
    notFound();
  }

  // Locale-aware via brand.config locales (falls back to base text).
  const pageTitle = await getDynamicTranslation(page, "title", page.title);
  const pageBody = await getDynamicTranslation(page, "body", page.body);
  const activeVibeHtml = await getDynamicTranslation(page, "vibeHtml", page.vibeHtml ?? "");

  // Visual Builder takes PRECEDENCE: if the flag is on AND the page has a valid
  // published section-tree, render it — so a freshly published layout always wins
  // over a stale vibeHtml blob left from before the builder existed. Falls
  // through to vibeHtml/body when flag-off OR layoutJson is null/empty/invalid
  // (canary-safe — no canary has layoutJson).
  if (brand.features.visualBuilderEnabled && page.layoutJson) {
    const sections = resolvePageLayout(page.layoutJson);
    if (sections.length > 0) {
      // Emit Schema.org JSON-LD derived from the section data (FAQPage, HowTo,
      // Review, ImageGallery, ItemList) so AI search engines can cite this
      // builder-built page. Server-rendered; canary-safe (only fires when a page
      // has layoutJson — no canary does).
      const sectionLd = buildPageSectionsJsonLd(sections, {
        baseUrl: brand.url,
        orgName: brand.storeName,
      });
      return (
        <>
          {sectionLd.length > 0 ? <JsonLd data={sectionLd} /> : null}
          <PageSections sections={sections} />
        </>
      );
    }
  }

  // Legacy vibe-coded HTML layout — fallback AFTER the Visual Builder so a stale
  // vibeHtml can't shadow a freshly published section-tree.
  if (activeVibeHtml) {
    let normalizedHtml = activeVibeHtml.replace(/className=/g, "class=");
    normalizedHtml = normalizedHtml.replace(/htmlFor=/g, "for=");
    return (
      <div
        className="bg-[#0A0A0A] text-white min-h-screen"
        dangerouslySetInnerHTML={{ __html: normalizedHtml }}
      />
    );
  }

  const blocks = renderContentBlocks(pageBody);
  const editEnabled = await isAnnotateEditEnabled();

  // Design-owned info template wins (renders the prose in the design's style).
  if (InfoTemplate) return <InfoTemplate locale={locale} title={pageTitle} blocks={splitHeadingBlocks(blocks)} />;

  // We pass the data to the client component to handle Framer Motion animations
  return (
    <AnimatedPageContent
      page={{ title: pageTitle, heroImage: page.heroImage }}
      blocks={blocks}
      editEnabled={editEnabled}
      slug={slug}
    />
  );
}
