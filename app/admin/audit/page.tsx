import { fetchAuditEntries } from "./actions";
import RevertButton from "./RevertButton";
import PayloadViewer from "./PayloadViewer";
import { getTool } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

function actorLabel(raw: string): { label: string; color: string } {
  if (raw.startsWith("apikey:")) return { label: "AI (API-key)", color: "bg-sol-accent text-white" };
  if (raw.startsWith("user:")) return { label: "Admin (web)", color: "bg-sol-ink text-white" };
  if (raw.startsWith("operator-chat:")) return { label: "Admin (chat)", color: "bg-purple-600 text-white" };
  if (raw.startsWith("storefront-chat:")) return { label: "Kunde-chat", color: "bg-sol-sun/40 text-sol-ink" };
  if (raw.startsWith("system:")) return { label: "System", color: "bg-sol-sand text-sol-ink" };
  return { label: "Ukendt", color: "bg-gray-200 text-gray-700" };
}

type SearchParams = Promise<{
  tool?: string;
  actor?: string;
  ok?: string;
}>;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const entries = await fetchAuditEntries({
    toolPrefix: params.tool,
    actorPrefix: params.actor,
    onlyOk:
      params.ok === "true" ? true : params.ok === "false" ? false : undefined,
    limit: 100,
  });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Audit-log</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Komplet historik over alle tool-kald (skrive- og destruktive operationer).
          Klik &quot;Vis payload&quot; for at se input/før/efter-snapshots. Destruktive
          tools markeret revertible kan rulles tilbage med ét klik.
        </p>
      </header>

      {/* Filter-form (GET-baseret så links er delbare) */}
      <form className="rounded-2xl border border-sol-ink/10 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput name="tool" label="Tool-prefix" placeholder="fx 'products.' eller 'marketing'" defaultValue={params.tool} />
          <FilterInput name="actor" label="Aktør-prefix" placeholder="fx 'apikey:' eller 'user:'" defaultValue={params.actor} />
          <FilterSelect name="ok" label="Status" defaultValue={params.ok}>
            <option value="">Alle</option>
            <option value="true">Kun success</option>
            <option value="false">Kun fejl</option>
          </FilterSelect>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-full bg-sol-accent px-5 py-2 text-sm font-black uppercase tracking-wider text-white hover:bg-sol-accent/90"
            >
              Filtrér
            </button>
            <a
              href="/admin/audit"
              className="rounded-full border border-sol-ink/15 px-4 py-2 text-sm font-bold text-sol-muted hover:bg-sol-cream"
            >
              Nulstil
            </a>
          </div>
        </div>
      </form>

      <section className="sol-card-elevated">
        <div className="flex items-center justify-between border-b border-sol-ink/10 px-5 py-4">
          <h2 className="text-xl font-black text-sol-ink">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </h2>
        </div>

        {entries.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm font-semibold text-sol-muted">
            Ingen audit-entries matcher dine filtre.
          </p>
        ) : (
          <ul className="divide-y divide-sol-ink/10">
            {entries.map((entry) => {
              const actor = actorLabel(entry.actor);
              const tool = getTool(entry.tool);
              const canRevert = tool?.revertible && entry.ok;
              return (
                <li key={entry.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-6">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${actor.color}`}
                      >
                        {actor.label}
                      </span>
                      <code className="font-mono text-xs font-bold text-sol-ink">
                        {entry.tool}
                      </code>
                      {!entry.ok && (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-700">
                          Fejl
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-sol-muted">
                      {dateFormatter.format(entry.createdAt)} · req:{" "}
                      <code className="font-mono">{entry.requestId.slice(0, 8)}</code>
                    </p>
                    <div className="mt-1">
                      <PayloadViewer
                        argsJson={entry.argsJson ?? null}
                        beforeJson={entry.beforeJson ?? null}
                        afterJson={entry.afterJson ?? null}
                        errorMsg={entry.errorMsg ?? null}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 sm:pt-1">
                    {canRevert && (
                      <RevertButton auditLogId={entry.id} toolName={entry.tool} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterInput({
  name,
  label,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-sol-muted">
        {label}
      </span>
      <input
        name={name}
        type="text"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className="rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm text-sol-ink outline-none focus:border-sol-accent"
      />
    </label>
  );
}

function FilterSelect({
  name,
  label,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-sol-muted">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm text-sol-ink outline-none focus:border-sol-accent"
      >
        {children}
      </select>
    </label>
  );
}
