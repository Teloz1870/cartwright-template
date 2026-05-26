/**
 * Master Plan §4 Phase 9 — Agentic Dashboard (read-only).
 *
 * Surfaces live A2A activity for the human admin: recent agentic JWT
 * verifications (allow/deny audit), the escrow queue grouped by status,
 * and the current legislation policy snapshot.
 *
 * Gated by brand.features.adminAgenticDashboard — when off, the nav link
 * in admin/layout.tsx is hidden and direct navigation 404s. The Teloz
 * deploy keeps the flag off; the agent-marketplace template defaults it on.
 *
 * Read-only in this commit. Admin actions (force-release, force-refund,
 * policy editor) are deferred to a follow-up that goes through
 * operator-supervised review.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function formatAmount(amountMinor: number, currency: string): string {
  const major = (amountMinor / 100).toFixed(2);
  return `${major} ${currency}`;
}

function escrowStatusBadgeColor(status: string): string {
  switch (status) {
    case "pending":
      return "bg-sol-sand text-sol-ink";
    case "funded":
      return "bg-blue-100 text-blue-900";
    case "released":
      return "bg-green-100 text-green-900";
    case "refunded":
      return "bg-amber-100 text-amber-900";
    case "disputed":
      return "bg-red-100 text-red-900";
    default:
      return "bg-gray-100 text-gray-900";
  }
}

function verdictBadgeColor(result: string): string {
  switch (result) {
    case "pass":
      return "bg-green-100 text-green-900";
    case "fail":
      return "bg-red-100 text-red-900";
    case "pending":
      return "bg-amber-100 text-amber-900";
    case "skipped":
      return "bg-gray-100 text-gray-900";
    default:
      return "bg-gray-100 text-gray-900";
  }
}

export default async function AgenticDashboardPage() {
  await requireAdmin();

  // Feature-flag gate. If a fork has the link visible in the nav (their
  // brand.features.adminAgenticDashboard = true) but the page is accessed
  // by a fork that turned it off mid-session, fall through to notFound().
  const brand = await getBrand();
  const enabled = Boolean(
    (brand.features as { adminAgenticDashboard?: boolean }).adminAgenticDashboard,
  );
  if (!enabled) {
    notFound();
  }

  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

  // Read three things in parallel for paint speed.
  const [recentJwts, escrowsByStatus, jwt24hStats, openAgentCard] =
    await Promise.all([
      prisma.agenticJWT.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.escrowTransaction.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { amountMinor: true },
      }),
      prisma.agenticJWT.groupBy({
        by: ["verifyResult"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.agentCard.findFirst({
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  // Active disputed escrows (always show — even if older than 24h).
  const disputedEscrows = await prisma.escrowTransaction.findMany({
    where: { status: "disputed" },
    orderBy: { disputedAt: "desc" },
    take: 25,
  });

  const stats = {
    pass: jwt24hStats.find((s) => s.verifyResult === "pass")?._count._all ?? 0,
    fail: jwt24hStats.find((s) => s.verifyResult === "fail")?._count._all ?? 0,
    pending:
      jwt24hStats.find((s) => s.verifyResult === "pending")?._count._all ?? 0,
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-sol-ink">
          Agentic Dashboard
        </h1>
        <p className="mt-2 text-sm text-sol-muted">
          Live view of A2A (Agent-to-Agent) activity over the past 24 hours.
          Disputed escrows surface regardless of age.
        </p>
      </header>

      {/* ────── 24h stats ────────────────────────────────────────────── */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-sol-glass-border bg-white p-4 shadow-sol-soft">
          <div className="text-xs uppercase tracking-wide text-sol-muted">
            Allowed (24h)
          </div>
          <div className="mt-2 text-3xl font-bold text-green-700">
            {stats.pass}
          </div>
        </div>
        <div className="rounded-lg border border-sol-glass-border bg-white p-4 shadow-sol-soft">
          <div className="text-xs uppercase tracking-wide text-sol-muted">
            Denied (24h)
          </div>
          <div className="mt-2 text-3xl font-bold text-red-700">
            {stats.fail}
          </div>
        </div>
        <div className="rounded-lg border border-sol-glass-border bg-white p-4 shadow-sol-soft">
          <div className="text-xs uppercase tracking-wide text-sol-muted">
            Pending (24h)
          </div>
          <div className="mt-2 text-3xl font-bold text-amber-700">
            {stats.pending}
          </div>
        </div>
      </section>

      {/* ────── Agent Card snapshot ──────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-sol-ink">Agent Card</h2>
        {openAgentCard ? (
          <div className="rounded-lg border border-sol-glass-border bg-white p-4 shadow-sol-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-sol-muted">Version</div>
                <div className="text-lg font-semibold">
                  {openAgentCard.version}
                </div>
              </div>
              <div>
                <div className="text-sm text-sol-muted">Signed at</div>
                <div className="font-mono text-sm">
                  {formatDate(openAgentCard.signedAt)}
                </div>
              </div>
              <div>
                <div className="text-sm text-sol-muted">Expires</div>
                <div className="font-mono text-sm">
                  {formatDate(openAgentCard.expiresAt)}
                </div>
              </div>
              <Link
                href="/api/agent-card"
                target="_blank"
                className="text-sm text-sol-accent underline"
              >
                view JSON →
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No active Agent Card. Buyer agents will receive 503 on
            /api/agent-card until one is published.
          </div>
        )}
      </section>

      {/* ────── Escrow breakdown ─────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-sol-ink">
          Escrow positions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(["pending", "funded", "released", "refunded", "disputed"] as const).map(
            (status) => {
              const row = escrowsByStatus.find((s) => s.status === status);
              const count = row?._count?._all ?? 0;
              const total = row?._sum?.amountMinor ?? 0;
              return (
                <div
                  key={status}
                  className="rounded-lg border border-sol-glass-border bg-white p-3 shadow-sol-soft"
                >
                  <div
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${escrowStatusBadgeColor(status)}`}
                  >
                    {status}
                  </div>
                  <div className="mt-2 text-2xl font-bold">{count}</div>
                  <div className="text-xs text-sol-muted">
                    {formatAmount(total, "DKK")}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </section>

      {/* ────── Disputed escrows queue ───────────────────────────────── */}
      {disputedEscrows.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-red-900">
            Disputed escrows — review queue ({disputedEscrows.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-sol-soft">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-left text-xs uppercase tracking-wider text-red-900">
                <tr>
                  <th className="px-3 py-2">Escrow ID</th>
                  <th className="px-3 py-2">Buyer Agent</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Disputed At</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {disputedEscrows.map((e) => (
                  <tr key={e.id} className="border-t border-red-100">
                    <td className="px-3 py-2 font-mono text-xs">{e.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {e.buyerAgentId}
                    </td>
                    <td className="px-3 py-2">
                      {formatAmount(e.amountMinor, e.currency)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {formatDate(e.disputedAt)}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {e.disputeReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-sol-muted">
            Force-release / force-refund actions are deferred to a
            follow-up Phase 9 commit (operator-supervised review).
          </p>
        </section>
      )}

      {/* ────── Recent A-JWT verifications ──────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-sol-ink">
          Recent verifications (24h, latest 50)
        </h2>
        {recentJwts.length === 0 ? (
          <div className="rounded-lg border border-sol-glass-border bg-white p-4 text-sm text-sol-muted shadow-sol-soft">
            No agentic calls in the past 24 hours.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-sol-glass-border bg-white shadow-sol-soft">
            <table className="w-full text-sm">
              <thead className="bg-sol-sand text-left text-xs uppercase tracking-wider text-sol-ink">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Path</th>
                  <th className="px-3 py-2">Verdict</th>
                  <th className="px-3 py-2">Reason / error</th>
                </tr>
              </thead>
              <tbody>
                {recentJwts.map((j) => (
                  <tr key={j.id} className="border-t border-sol-glass-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      {formatDate(j.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {j.issuerAgentId}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {j.requestMethod} {j.requestPath}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${verdictBadgeColor(j.verifyResult)}`}
                      >
                        {j.verifyResult}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-sol-muted">
                      {j.verifyError ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-8 text-xs text-sol-muted">
        Read-only view. Provider toggle (cloud vs local Ollama),
        legislation editor, and force-release / force-refund actions are
        deferred to a follow-up Phase 9 commit (operator-supervised).
      </footer>
    </div>
  );
}
