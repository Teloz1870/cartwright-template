import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import EditMediaForm from "./EditMediaForm";

/**
 * Phase 10 Slice 3 — detail-side for én MediaAsset.
 *
 * Viser preview + metadata + editable form + usage-liste. Server-side data,
 * client-side form (server-actions fra /admin/media/actions.ts).
 */
export default async function MediaAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    include: {
      productMedia: {
        include: { product: { select: { id: true, name: true, slug: true } } },
      },
      categoryHero: { select: { id: true, name: true, slug: true } },
      categoryVideo: { select: { id: true, name: true, slug: true } },
      pageHero: { select: { id: true, title: true, slug: true } },
      serviceHero: { select: { id: true, title: true, slug: true } },
      brandingHero: { select: { id: true, storeName: true } },
    },
  });

  if (!asset) notFound();

  const isVideo = asset.durationSec != null;
  const usageItems: Array<{ label: string; href: string }> = [
    ...asset.productMedia.map((pm) => ({
      label: `Produkt: ${pm.product.name}`,
      href: `/admin/produkter/${pm.product.id}`,
    })),
    ...asset.categoryHero.map((c) => ({
      label: `Kategori-hero: ${c.name}`,
      href: `/admin/kategorier/${c.id}`,
    })),
    ...asset.categoryVideo.map((c) => ({
      label: `Kategori-video: ${c.name}`,
      href: `/admin/kategorier/${c.id}`,
    })),
    ...asset.pageHero.map((p) => ({
      label: `Side-hero: ${p.title}`,
      href: `/admin/sider/${p.id}`,
    })),
    ...asset.serviceHero.map((s) => ({
      label: `Service-hero: ${s.title}`,
      href: `/admin/services/${s.id}`,
    })),
    ...asset.brandingHero.map((b) => ({
      label: `Branding-hero: ${b.storeName}`,
      href: `/admin/indstillinger`,
    })),
  ];

  const dominantColors = parseDominantColors(asset.dominantColors);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/media"
          className="text-sm font-black text-sol-muted hover:text-sol-accent"
        >
          ← Media-bibliotek
        </Link>
        <span className="rounded-full bg-sol-cream px-2 py-0.5 text-[10px] font-black uppercase">
          {asset.aiStatus}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
        <section className="sol-card-elevated overflow-hidden">
          <div className="relative aspect-square bg-sol-cream">
            {isVideo ? (
              <video
                src={asset.url}
                controls
                className="h-full w-full object-contain"
              />
            ) : (
              <Image
                src={asset.url}
                alt={asset.altDa ?? ""}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-xs text-sol-muted">
            <Meta k="MIME" v={asset.mime} />
            <Meta k="Størrelse" v={`${(asset.sizeBytes / 1024).toFixed(0)} KB`} />
            <Meta k="Dimensioner" v={dimensions(asset.width, asset.height, asset.durationSec)} />
            <Meta k="Uploaded" v={asset.createdAt.toISOString().slice(0, 10)} />
            <Meta k="SHA-256" v={asset.sha256 ? asset.sha256.slice(0, 12) + "…" : "—"} />
            <Meta k="AI-model" v={asset.aiModel ?? "—"} />
            <Meta k="AI-forsøg" v={String(asset.aiAttempts)} />
            <Meta k="Uploaded af" v={asset.uploadedBy ?? "—"} />
          </div>
          {asset.aiLastError && (
            <div className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-xs text-rose-900">
              <span className="font-black">Sidste fejl:</span> {asset.aiLastError}
            </div>
          )}
          {dominantColors.length > 0 && (
            <div className="border-t border-sol-ink/10 px-5 py-3">
              <div className="mb-2 text-[10px] font-black uppercase text-sol-muted">
                Dominerende farver
              </div>
              <div className="flex gap-2">
                {dominantColors.map((hex) => (
                  <div key={hex} className="flex items-center gap-1.5">
                    <span
                      className="h-5 w-5 rounded border border-sol-ink/10"
                      style={{ backgroundColor: hex }}
                    />
                    <code className="font-mono text-[10px] text-sol-muted">{hex}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="sol-card-elevated px-6 py-6">
          <EditMediaForm
            assetId={asset.id}
            initialValues={{
              altDa: asset.altDa ?? "",
              altEn: asset.altEn ?? "",
              title: asset.title ?? "",
              caption: asset.caption ?? "",
              geoSnippet: asset.geoSnippet ?? "",
              suggestedSlug: asset.suggestedSlug ?? "",
            }}
            canDelete={usageItems.length === 0}
          />
        </section>
      </div>

      <section className="sol-card-elevated px-6 py-5">
        <h2 className="mb-3 text-sm font-black uppercase text-sol-muted">
          Brugt {usageItems.length} steder
        </h2>
        {usageItems.length === 0 ? (
          <p className="text-sm text-sol-muted">
            Ikke attached til noget endnu. Du kan slette assetet uden at bryde noget.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {usageItems.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  className="block rounded px-2 py-1 text-sm text-sol-ink hover:bg-sol-cream"
                >
                  → {item.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="font-black uppercase text-[10px]">{k}</span>
      <span className="truncate font-mono text-[11px]">{v}</span>
    </div>
  );
}

function dimensions(w: number | null, h: number | null, dur: number | null): string {
  if (dur != null) return `${dur}s video`;
  if (w && h) return `${w}×${h}`;
  return "—";
}

function parseDominantColors(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}
