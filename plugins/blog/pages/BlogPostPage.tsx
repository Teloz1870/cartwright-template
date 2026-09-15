import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { getBrand } from "@/lib/brand";
import { getPublishedPost } from "@/plugins/blog/lib/blog";
import BlogContent from "@/plugins/blog/components/BlogContent";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import { buildLocalizedPageMetadata } from "@/lib/localized-page-metadata";
import { toAbsoluteUrl } from "@/lib/og";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";

type Props = { params: Promise<{ slug: string; locale: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);
  const [post, resolvedBrand] = await Promise.all([
    getPublishedPost(slug, locale),
    getBrand(),
  ]);
  if (!post) return { title: locale === "da" ? "Indlæg ikke fundet" : "Post not found" };
  const title = post.metaTitle || post.title;
  const description =
    post.metaDescription || post.excerpt || resolvedBrand.metadata.description;
  const metadata = buildLocalizedPageMetadata({
    locale,
    pathTemplate: `/{locale}/blog/${encodeURIComponent(slug)}`,
    baseUrl: resolvedBrand.url,
    siteName: resolvedBrand.storeName,
    title,
    description,
    imageUrl: post.coverImage,
  });
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, type: "article" },
  };
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("da-DK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  const mergedBrand = await getBrand();
  if (!mergedBrand.features.blog) notFound();

  const post = await getPublishedPost(slug, locale);
  if (!post) notFound();

  const baseUrl = mergedBrand.url.replace(/\/+$/, "");
  const localeHome = `${baseUrl}/${locale}`;
  const blogUrl = `${localeHome}/blog`;
  const url = `${blogUrl}/${encodeURIComponent(post.slug)}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription || post.excerpt || undefined,
    image: post.coverImage
      ? toAbsoluteUrl(post.coverImage, baseUrl)
      : undefined,
    datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
    author: post.author ? { "@type": "Person", name: post.author } : { "@type": "Organization", name: mergedBrand.storeName },
    publisher: { "@type": "Organization", name: mergedBrand.storeName, url: baseUrl },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: post.tags.length ? post.tags.join(", ") : undefined,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: locale === "da" ? "Forside" : "Home", item: localeHome },
      { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  // vibeHtml override (samme som Page) — AI-genereret rich layout.
  if (post.vibeHtml) {
    const normalized = post.vibeHtml.replace(/className=/g, "class=").replace(/htmlFor=/g, "for=");
    return (
      <>
        <JsonLd data={[jsonLd, breadcrumb]} />
        <div className="min-h-screen" dangerouslySetInnerHTML={{ __html: normalized }} />
      </>
    );
  }

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {mergedBrand.features.breadcrumbs ? (
          <Breadcrumbs
            items={[
              // Mirrors this page's BreadcrumbList JSON-LD exactly.
              { label: homeBreadcrumbLabel(locale), href: `/${locale}` },
              { label: "Blog", href: `/${locale}/blog` },
              { label: post.title },
            ]}
          />
        ) : (
          <Link href={`/${locale}/blog`} className="text-sm font-bold text-sol-accent hover:underline">
            ← Blog
          </Link>
        )}
        <article className="mt-4">
          <header>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-sol-accent/10 px-2 py-0.5 text-[11px] font-bold text-sol-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="text-4xl font-black leading-tight text-sol-ink">{post.title}</h1>
            <p className="mt-3 text-sm text-sol-muted">
              {[post.author, formatDate(post.publishedAt)].filter(Boolean).join(" · ")}
            </p>
            {post.coverImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.coverImage}
                alt={post.title}
                className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover"
              />
            )}
          </header>
          <div className="mt-8">
            <BlogContent body={post.body} />
          </div>
        </article>
      </main>
    </>
  );
}
