import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * Phase 10 Slice 7a — moderation-oversigt.
 *
 * Default-view: pending reviews først (det er det admin skal handle på),
 * tabs over til approved/rejected/spam-historik.
 */

const PAGE_SIZE = 50;

type SearchParams = { status?: string };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status = ["approved", "rejected", "spam"].includes(params.status ?? "")
    ? params.status!
    : "pending";

  const [reviews, counts] = await Promise.all([
    prisma.productReview.findMany({
      where: { status },
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.productReview.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all]),
  ) as Record<string, number>;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-black text-sol-ink">Anmeldelser</h1>
        <p className="mt-1 text-sm font-semibold text-sol-muted">
          Modererer kunde-reviews før de bliver synlige på PDP. Approved tæller
          i AggregateRating JSON-LD når der er mindst 3 godkendte pr. produkt.
        </p>
      </div>

      <section className="flex flex-wrap gap-2 text-xs">
        <Tab href="/admin/anmeldelser" active={status === "pending"}>
          Venter ({byStatus.pending ?? 0})
        </Tab>
        <Tab href="/admin/anmeldelser?status=approved" active={status === "approved"}>
          Godkendte ({byStatus.approved ?? 0})
        </Tab>
        <Tab href="/admin/anmeldelser?status=rejected" active={status === "rejected"}>
          Afviste ({byStatus.rejected ?? 0})
        </Tab>
        <Tab href="/admin/anmeldelser?status=spam" active={status === "spam"}>
          Spam ({byStatus.spam ?? 0})
        </Tab>
      </section>

      {reviews.length === 0 ? (
        <section className="sol-card-elevated px-5 py-8 text-sm font-semibold text-sol-muted">
          Ingen reviews i &quot;{status}&quot;.
          {status === "pending" && (
            <span className="block mt-2 text-xs">
              Kunder kan skrive reviews via /konto/ordrer/[id]/anmeld (logged-in)
              eller via token-link i post-purchase email (cron sender efter 7
              dage).
            </span>
          )}
        </section>
      ) : (
        <section className="sol-card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Produkt</th>
                  <th className="px-5 py-3 font-black">Stjerner</th>
                  <th className="px-5 py-3 font-black">Forfatter</th>
                  <th className="px-5 py-3 font-black">Uddrag</th>
                  <th className="px-5 py-3 font-black">Dato</th>
                  <th className="px-5 py-3 text-right font-black">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-black text-sol-ink">
                      <Link
                        href={`/admin/produkter/${r.product.id}`}
                        className="hover:text-sol-accent"
                      >
                        {r.product.name}
                      </Link>
                      {r.orderId && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-900">
                          VERIFIED
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {renderStars(r.rating)}
                    </td>
                    <td className="px-5 py-3 text-sol-muted">
                      <div>{r.authorName}</div>
                      <div className="text-[10px]">{r.authorEmail}</div>
                    </td>
                    <td className="px-5 py-3 text-sol-muted">
                      {r.title && <div className="font-black">{r.title}</div>}
                      <div className="line-clamp-2">{r.body}</div>
                    </td>
                    <td className="px-5 py-3 text-xs text-sol-muted">
                      {r.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/anmeldelser/${r.id}`}
                        className="rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
                      >
                        Modérer
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function renderStars(rating: number): string {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function Tab({
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
