type AuditRow = {
  id: string;
  actor: string;
  tool: string;
  ok: boolean;
  createdAt: string | Date;
  errorMsg?: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

function actorBadge(raw: string): { label: string; color: string } {
  if (raw.startsWith("apikey:")) return { label: "AI (API)", color: "bg-sol-accent text-white" };
  if (raw.startsWith("user:")) return { label: "Admin (web)", color: "bg-sol-ink text-white" };
  if (raw.startsWith("operator-chat:")) return { label: "Admin (chat)", color: "bg-purple-600 text-white" };
  if (raw.startsWith("storefront-chat:")) return { label: "Kunde-chat", color: "bg-sol-sun/40 text-sol-ink" };
  if (raw.startsWith("system:")) return { label: "System", color: "bg-sol-sand text-sol-ink" };
  return { label: "?", color: "bg-gray-200 text-gray-700" };
}

/**
 * Kompakt tidslinje til audit.list tool-result i admin-chat. Viser actor-
 * badge, tool-navn, tid og evt. fejl. Klik på actor filtrerer /admin/audit.
 */
export default function AuditTimelineInline({ entries }: { entries: AuditRow[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-xs italic text-sol-muted">
        Ingen audit-entries matcher filtrene.
      </p>
    );
  }

  return (
    <ol className="space-y-1.5 text-xs">
      {entries.slice(0, 20).map((e) => {
        const created =
          typeof e.createdAt === "string" ? new Date(e.createdAt) : e.createdAt;
        const actor = actorBadge(e.actor);
        return (
          <li
            key={e.id}
            className="flex items-start gap-2 rounded-lg border border-sol-ink/10 bg-white px-2.5 py-1.5"
          >
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${actor.color}`}
            >
              {actor.label}
            </span>
            <div className="min-w-0 flex-1">
              <code className="font-mono text-[11px] font-bold text-sol-ink">
                {e.tool}
              </code>
              {!e.ok && e.errorMsg && (
                <p className="mt-0.5 text-[10px] text-red-700">{e.errorMsg}</p>
              )}
            </div>
            <time className="shrink-0 text-[10px] text-sol-muted">
              {dateFormatter.format(created)}
            </time>
          </li>
        );
      })}
      {entries.length > 20 && (
        <li className="px-2.5 py-1 text-[10px] italic text-sol-muted">
          +{entries.length - 20} flere — se /admin/audit for fuld liste
        </li>
      )}
    </ol>
  );
}
