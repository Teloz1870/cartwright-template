import { notFound } from "next/navigation";
import Link from "next/link";

import { getBrand } from "@/lib/brand";
import { listPublishedPosts } from "@/lib/blog";
import { pageOg } from "@/lib/og";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await getBrand();
  const description = `Artikler og nyheder fra ${brand.storeName}.`;
  return {
    title: `Blog · ${brand.storeName}`,
    description,
    ...pageOg(`Blog · ${brand.storeName}`, description),
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

export default async function BlogIndexPage() {
  const brand = await getBrand();
  if (!brand.features.blog) notFound();

  const posts = await listPublishedPosts();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10">
        <h1 className="text-4xl font-black text-sol-ink">Blog</h1>
        <p className="mt-2 text-sol-muted">Artikler og nyheder fra {brand.storeName}.</p>
      </header>

      {posts.length === 0 ? (
        <p className="text-sol-muted">Ingen indlæg endnu.</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border-2 border-sol-ink/10 bg-white transition hover:border-sol-accent/40"
            >
              {post.coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="aspect-[16/9] w-full object-cover"
                />
              )}
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-sol-accent/10 px-2 py-0.5 text-[11px] font-bold text-sol-accent"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="text-xl font-black text-sol-ink group-hover:text-sol-accent">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="mt-2 line-clamp-3 text-sm text-sol-ink/80">{post.excerpt}</p>
                )}
                <p className="mt-auto pt-4 text-xs text-sol-muted">
                  {[post.author, formatDate(post.publishedAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
