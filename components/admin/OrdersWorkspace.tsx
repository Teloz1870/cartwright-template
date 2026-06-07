"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPriceDkk } from "@/lib/format";
import {
  ORDER_TABS,
  STATUS_LABELS,
  statusColor,
  statusLabel,
} from "@/lib/orders/status";
import { listOrdersPage, bulkUpdateStatus } from "@/app/admin/ordrer/actions";
import type { OrderListRow } from "@/app/admin/ordrer/types";

type Filters = { tab: string; q: string; from: string; to: string };

type Props = {
  initialRows: OrderListRow[];
  initialNextCursor: string | null;
  filters: Filters;
};

// Kurateret sæt af bulk-mål — operatør-meningsfulde fremad-skift. Ulovlige
// transitions afvises pr. ordre af bulkUpdateStatus og rapporteres som skipped.
const BULK_TARGETS = [
  "processing",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
] as const;

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

const inputClass =
  "rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

export default function OrdersWorkspace({
  initialRows,
  initialNextCursor,
  filters,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<OrderListRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(filters.q);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [bulkTarget, setBulkTarget] = useState<string>("processing");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingMore, startLoadMore] = useTransition();
  const [isBulking, startBulk] = useTransition();

  // Reset ved filter-skift håndteres via `key` på parent (server re-render
  // remounter komponenten med friske initial-props) — derfor ingen
  // setState-i-effect her (jf. react-hooks/set-state-in-effect).

  function buildQuery(next: Partial<Filters>): string {
    const merged = { tab: filters.tab, q, from, to, ...next };
    const params = new URLSearchParams();
    if (merged.tab && merged.tab !== "all") params.set("tab", merged.tab);
    if (merged.q) params.set("q", merged.q);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    const qs = params.toString();
    return qs ? `/admin/ordrer?${qs}` : "/admin/ordrer";
  }

  function applyFilters() {
    router.push(buildQuery({}));
  }

  function loadMore() {
    if (!cursor) return;
    startLoadMore(() => {
      void (async () => {
        const res = await listOrdersPage({
          tab: filters.tab,
          q: filters.q,
          fromDate: filters.from || undefined,
          toDate: filters.to || undefined,
          cursor,
        });
        setRows((prev) => [...prev, ...res.rows]);
        setCursor(res.nextCursor);
      })();
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }

  function runBulk() {
    if (selected.size === 0) return;
    setMessage(null);
    startBulk(() => {
      void (async () => {
        const res = await bulkUpdateStatus(Array.from(selected), bulkTarget);
        const skippedNote =
          res.skipped.length > 0
            ? ` — ${res.skipped.length} sprunget over (ulovlig transition)`
            : "";
        setMessage(`${res.updated} ordre(r) opdateret${skippedNote}`);
        setSelected(new Set());
        router.refresh();
      })();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status-faner */}
      <nav className="flex flex-wrap gap-2">
        {ORDER_TABS.map((t) => {
          const active = (filters.tab || "all") === t.key;
          return (
            <Link
              key={t.key}
              href={buildQuery({ tab: t.key })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? "bg-sol-accent text-white"
                  : "bg-sol-cream/70 text-sol-muted hover:text-sol-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Filter-bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-sol-ink/10 bg-sol-sand p-4">
        <div className="flex flex-col">
          <label className="mb-1 text-xs font-black uppercase text-sol-muted">
            Søg (email / ordre-id)
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            placeholder="kunde@eksempel.dk"
            className={`${inputClass} min-w-56`}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs font-black uppercase text-sol-muted">
            Fra dato
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs font-black uppercase text-sol-muted">
            Til dato
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          onClick={applyFilters}
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95"
        >
          Anvend
        </button>
        {(q || from || to) && (
          <Link
            href={buildQuery({ q: "", from: "", to: "" })}
            className="px-2 py-2 text-sm font-bold text-sol-muted underline-offset-2 hover:underline"
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
            }}
          >
            Ryd
          </Link>
        )}
      </div>

      {/* Bulk-handlinger */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sol-accent/30 bg-sol-accent/5 p-3">
          <span className="text-sm font-bold text-sol-ink">
            {selected.size} valgt
          </span>
          <select
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value)}
            className={inputClass}
          >
            {BULK_TARGETS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            onClick={runBulk}
            disabled={isBulking}
            className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {isBulking ? "Opdaterer…" : "Anvend på valgte"}
          </button>
        </div>
      )}

      {message && (
        <p className="text-sm font-bold text-sol-muted">{message}</p>
      )}

      {/* Tabel */}
      <section className="sol-card-elevated">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen ordrer matcher filtrene.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={toggleAll}
                      aria-label="Vælg alle"
                    />
                  </th>
                  <th className="px-4 py-3 font-black">Ordrenr.</th>
                  <th className="px-4 py-3 font-black">Dato</th>
                  <th className="px-4 py-3 font-black">Kunde</th>
                  <th className="px-4 py-3 font-black">Status</th>
                  <th className="px-4 py-3 font-black">Flag</th>
                  <th className="px-4 py-3 text-right font-black">Varer</th>
                  <th className="px-4 py-3 text-right font-black">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {rows.map((o) => (
                  <tr key={o.id} className="hover:bg-sol-cream/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                        aria-label={`Vælg ordre ${o.id.slice(0, 8)}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/ordrer/${o.id}`}
                        className="font-bold text-sol-accent underline-offset-2 hover:underline"
                      >
                        {o.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sol-muted">
                      {dateFormatter.format(new Date(o.createdAt))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-bold text-sol-ink">
                        {o.shippingName}
                      </span>
                      <span className="block text-xs text-sol-muted">
                        {o.email}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${statusColor(o.status)}`}
                      >
                        {statusLabel(o.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {o.flags.attention && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            Kræver handling
                          </span>
                        )}
                        {o.flags.delayed && (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">
                            Forsinket
                          </span>
                        )}
                        {o.flags.lowStock && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Lavt lager
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-sol-muted">
                      {o.itemCount}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-sol-ink">
                      {formatPriceDkk(o.totalDkk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cursor && (
        <button
          onClick={loadMore}
          disabled={isLoadingMore}
          className="self-center rounded-lg border border-sol-ink/15 px-5 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream/60 disabled:opacity-50"
        >
          {isLoadingMore ? "Indlæser…" : "Indlæs flere"}
        </button>
      )}
    </div>
  );
}
