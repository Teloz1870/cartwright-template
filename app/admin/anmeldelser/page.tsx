import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminBadge,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Anmeldelser"
        subtitle="Modererer kunde-reviews før de bliver synlige på PDP. Approved tæller i AggregateRating JSON-LD når der er mindst 3 godkendte pr. produkt."
      />

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
        <AdminCard>
          <p className="text-sm text-sol-muted">
            Ingen reviews i &quot;{status}&quot;.
            {status === "pending" && (
              <span className="block mt-2 text-xs">
                Kunder kan skrive reviews via /konto/ordrer/[id]/anmeld (logged-in)
                eller via token-link i post-purchase email (cron sender efter 7
                dage).
              </span>
            )}
          </p>
        </AdminCard>
      ) : (
        <AdminCard padding="none">
          <AdminTable minWidth="860px">
            <AdminThead>
              <tr>
                <AdminTh>Produkt</AdminTh>
                <AdminTh>Stjerner</AdminTh>
                <AdminTh>Forfatter</AdminTh>
                <AdminTh>Uddrag</AdminTh>
                <AdminTh>Dato</AdminTh>
                <AdminTh align="right">Handling</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {reviews.map((r) => (
                <AdminTr key={r.id}>
                  <AdminTd className="font-black">
                    <Link
                      href={`/admin/produkter/${r.product.id}`}
                      className="hover:text-sol-accent"
                    >
                      {r.product.name}
                    </Link>
                    {r.orderId && (
                      <AdminBadge tone="success" className="ml-2">
                        VERIFIED
                      </AdminBadge>
                    )}
                  </AdminTd>
                  <AdminTd className="font-mono text-xs">
                    {renderStars(r.rating)}
                  </AdminTd>
                  <AdminTd className="text-sol-muted">
                    <div>{r.authorName}</div>
                    <div className="text-[10px]">{r.authorEmail}</div>
                  </AdminTd>
                  <AdminTd className="text-sol-muted">
                    {r.title && <div className="font-black">{r.title}</div>}
                    <div className="line-clamp-2">{r.body}</div>
                  </AdminTd>
                  <AdminTd className="text-xs text-sol-muted">
                    {r.createdAt.toISOString().slice(0, 10)}
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminButton
                      href={`/admin/anmeldelser/${r.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      Modérer
                    </AdminButton>
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTbody>
          </AdminTable>
        </AdminCard>
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
