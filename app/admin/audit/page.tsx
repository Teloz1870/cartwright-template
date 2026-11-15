import { fetchAuditEntries } from "./actions";
import RevertButton from "./RevertButton";
import PayloadViewer from "./PayloadViewer";
import { actorLabel } from "./actor-label";
import { getTool } from "@/lib/tools/registry";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminBadge,
  AdminField,
  AdminInput,
  AdminSelect,
  EmptyState,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
});

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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Audit log"
        subtitle={`Complete history of every tool call (write and destructive operations). Click "Show payload" to see input/before/after snapshots. Destructive tools marked revertible can be rolled back with one click.`}
      />

      {/* Filter form (GET-based so links are shareable) */}
      <AdminCard padding="sm">
        <form>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterInput name="tool" label="Tool prefix" placeholder="e.g. 'products.' or 'marketing'" defaultValue={params.tool} />
            <FilterInput name="actor" label="Actor prefix" placeholder="e.g. 'apikey:' or 'user:'" defaultValue={params.actor} />
            <FilterSelect name="ok" label="Status" defaultValue={params.ok}>
              <option value="">All</option>
              <option value="true">Success only</option>
              <option value="false">Errors only</option>
            </FilterSelect>
            <div className="flex items-end gap-2">
              <AdminButton type="submit" variant="primary">
                Filter
              </AdminButton>
              <AdminButton href="/admin/audit" variant="secondary" size="sm">
                Reset
              </AdminButton>
            </div>
          </div>
        </form>
      </AdminCard>

      <AdminCard
        title={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        padding="none"
      >
        {entries.length === 0 ? (
          <EmptyState title="No audit entries match your filters." />
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
                      <AdminBadge tone={actor.tone}>{actor.label}</AdminBadge>
                      <code className="font-mono text-xs font-bold text-sol-ink">
                        {entry.tool}
                      </code>
                      {!entry.ok && <AdminBadge tone="critical">Error</AdminBadge>}
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
      </AdminCard>
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
    <AdminField label={label} htmlFor={name}>
      <AdminInput
        id={name}
        name={name}
        type="text"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
      />
    </AdminField>
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
    <AdminField label={label} htmlFor={name}>
      <AdminSelect id={name} name={name} defaultValue={defaultValue ?? ""}>
        {children}
      </AdminSelect>
    </AdminField>
  );
}
