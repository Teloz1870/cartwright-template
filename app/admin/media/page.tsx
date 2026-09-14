import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";

/**
 * Phase 10 Slice 3 — central media-bibliotek.
 *
 * Grid view of all MediaAsset rows with filters on aiStatus + type. Per asset
 * the admin can see a thumbnail, alt-text snippet, AI status and how many places
 * billedet er attached (Product/Category/Page/Service/Branding).
 *
 * Filter via query-params:
 *   ?status=pending|ok|skipped       (aiStatus)
 *   ?type=image|video                (durationSec null/not-null)
 *   ?attached=yes|no                 (has relations to Product/etc or not)
 */

const PAGE_SIZE = 60;

type SearchParams = {
  status?: string;
  type?: string;
  attached?: string;
};

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const where: Record<string, unknown> = {};
  if (params.status && ["pending", "ok", "skipped"].includes(params.status)) {
    where.aiStatus = params.status;
  }
  if (params.type === "image") {
    where.durationSec = null;
  } else if (params.type === "video") {
    where.durationSec = { not: null };
  }

  const [assets, totals] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            productMedia: true,
            categoryHero: true,
            categoryVideo: true,
            pageHero: true,
            serviceHero: true,
            brandingHero: true,
          },
        },
      },
    }),
    prisma.mediaAsset.groupBy({
      by: ["aiStatus"],
      _count: { _all: true },
    }),
  ]);

  // The attached filter is post-query (Prisma cannot aggregate-filter cross-relation)
  const filtered = params.attached === "yes"
    ? assets.filter((a) => totalUsage(a._count) > 0)
    : params.attached === "no"
      ? assets.filter((a) => totalUsage(a._count) === 0)
      : assets;

  const countByStatus = Object.fromEntries(
    totals.map((t) => [t.aiStatus, t._count._all]),
  ) as Record<string, number>;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Media library"
        subtitle="A central overview of every uploaded image + video. Alt text and SEO/GEO metadata are generated automatically by Gemini."
      />

      <section className="flex flex-wrap gap-2 text-xs">
        <FilterPill href="/admin/media" active={!params.status && !params.type && !params.attached}>
          Alle ({Object.values(countByStatus).reduce((a, b) => a + b, 0)})
        </FilterPill>
        <FilterPill href="/admin/media?status=pending" active={params.status === "pending"}>
          Venter ({countByStatus.pending ?? 0})
        </FilterPill>
        <FilterPill href="/admin/media?status=ok" active={params.status === "ok"}>
          Ready ({countByStatus.ok ?? 0})
        </FilterPill>
        <FilterPill href="/admin/media?status=skipped" active={params.status === "skipped"}>
          Skipped ({countByStatus.skipped ?? 0})
        </FilterPill>
        <FilterPill href="/admin/media?type=image" active={params.type === "image"}>
          Billeder
        </FilterPill>
        <FilterPill href="/admin/media?type=video" active={params.type === "video"}>
          Videoer
        </FilterPill>
        <FilterPill href="/admin/media?attached=no" active={params.attached === "no"}>
          Orphaned
        </FilterPill>
      </section>

      {filtered.length === 0 ? (
        <AdminCard>
          <p className="text-sm font-semibold text-sol-muted">
            No media rows match the filter. Upload via /admin/produkter or a
            similar UI to see rows here — or run the backfill script:
            <code className="ml-2 rounded bg-sol-cream px-2 py-0.5 font-mono text-xs">
              tsx scripts/backfill-media-assets.ts
            </code>
          </p>
        </AdminCard>
      ) : (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((asset) => {
            const isVideo = asset.durationSec != null;
            const usage = totalUsage(asset._count);
            return (
              <Link
                key={asset.id}
                href={`/admin/media/${asset.id}`}
                className="sol-card-elevated group flex flex-col overflow-hidden transition hover:scale-[1.01]"
              >
                <div className="relative aspect-square bg-sol-cream">
                  {isVideo ? (
                    <div className="flex h-full items-center justify-center text-xs font-black text-sol-muted">
                      ▶ VIDEO
                    </div>
                  ) : (
                    <Image
                      src={asset.url}
                      alt={asset.altDa ?? ""}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                    />
                  )}
                  <span
                    className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusColor(asset.aiStatus)}`}
                  >
                    {asset.aiStatus}
                  </span>
                </div>
                <div className="flex flex-col gap-1 px-3 py-3 text-xs">
                  <div className="line-clamp-2 font-semibold text-sol-ink">
                    {asset.altDa ?? <span className="italic text-sol-muted">— missing alt text —</span>}
                  </div>
                  <div className="text-sol-muted">
                    {usage > 0 ? `${usage} steder` : "Ikke brugt endnu"}
                    {" · "}
                    {(asset.sizeBytes / 1024).toFixed(0)} KB
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {assets.length === PAGE_SIZE && (
        <p className="text-center text-xs text-sol-muted">
          Viser de seneste {PAGE_SIZE}. Paginering kommer i Phase 10.1.
        </p>
      )}
    </div>
  );
}

function totalUsage(
  c: {
    productMedia: number;
    categoryHero: number;
    categoryVideo: number;
    pageHero: number;
    serviceHero: number;
    brandingHero: number;
  },
): number {
  return (
    c.productMedia +
    c.categoryHero +
    c.categoryVideo +
    c.pageHero +
    c.serviceHero +
    c.brandingHero
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "ok":
      return "bg-emerald-100 text-emerald-900";
    case "pending":
      return "bg-amber-100 text-amber-900";
    case "skipped":
      return "bg-rose-100 text-rose-900";
    default:
      return "bg-sol-cream text-sol-ink";
  }
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 font-black transition ${
        active
          ? "border-sol-accent bg-sol-accent text-white"
          : "border-sol-ink/15 text-sol-ink hover:border-sol-accent hover:text-sol-accent"
      }`}
    >
      {children}
    </Link>
  );
}
