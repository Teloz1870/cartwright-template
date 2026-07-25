import { notFound } from "next/navigation";
import { renderContentBlocks, renderInlineMarkdown, type ContentBlock } from "@/lib/content";
import { getDefaultLegalContent } from "@/lib/legal/default-content";
import { getActiveDesign } from "@/lib/theme";
import { pageOg } from "@/lib/og";

type Props = { params: Promise<{ slug: string; locale: string }> };

/**
 * B3 static seam variant — info pages WITHOUT a database (site-profile
 * program, `internal-docs/site-profile-ultraplan.md` §5). The materializer
 * copies this file over `app/[locale]/info/[slug]/page.tsx` when the
 * pages-db module is not in the profile; NOTHING imports it in the shipped
 * engine (byte-identical until then).
 *
 * A site profile has no CMS pages — but the legal surfaces every footer
 * links to (privacy/terms/cookies) must never 404, so this variant serves
 * exactly the db variant's legal-fallback path: getDefaultLegalContent →
 * renderContentBlocks → the design's `pages.info` template when the active
 * DesignPack ships one, else a plain server-rendered prose body (no
 * framer-motion — the animated default belongs to the pages-db module).
 */

/** Same heading/body split as the db variant applies before design templates. */
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
  const fallback = getDefaultLegalContent(slug, locale);
  if (!fallback) return { title: "Side ikke fundet" };
  return { title: fallback.title, ...pageOg(fallback.title, "") };
}

export default async function InfoPage({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  const fallback = getDefaultLegalContent(slug, locale);
  if (!fallback) notFound();

  const blocks = splitHeadingBlocks(renderContentBlocks(fallback.body));

  const InfoTemplate = (await getActiveDesign().catch(() => null))?.pages?.info;
  if (InfoTemplate) {
    return <InfoTemplate locale={locale} title={fallback.title} blocks={blocks} />;
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black tracking-tight text-sol-ink sm:text-4xl">
        {fallback.title}
      </h1>
      <div className="mt-8 space-y-5 text-base leading-7 text-sol-ink/80">
        {blocks.map((block, i) => {
          if (block.type === "heading") {
            return (
              <h2 key={i} className="mt-10 text-xl font-bold tracking-tight text-sol-ink">
                {block.text}
              </h2>
            );
          }
          if (block.type === "quote") {
            return (
              <blockquote key={i} className="border-l-4 border-sol-accent pl-4 italic">
                {renderInlineMarkdown(block.text)}
              </blockquote>
            );
          }
          return <p key={i}>{renderInlineMarkdown(block.text)}</p>;
        })}
      </div>
    </article>
  );
}
