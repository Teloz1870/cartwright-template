import { Download, RefreshCw, Save, Upload } from "lucide-react";

import { getGoogleConnectionStatus } from "@/plugins/google-workspace/lib/google/oauth";
import { getSheetsSyncSettings, type SheetsSyncResult } from "@/plugins/google-workspace/lib/sheets-sync";
import {
  AdminButton,
  AdminCard,
  AdminField,
  AdminInput,
  AdminPageHeader,
} from "@/components/admin/ui";
import { runSheetsSyncAction, saveSheetsSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        on ? "bg-emerald-100 text-emerald-900" : "bg-sol-ink/10 text-sol-muted"
      }`}
    >
      {label}
    </span>
  );
}

function ResultSummary({ result }: { result: SheetsSyncResult | null }) {
  if (!result) {
    return <p className="text-sm text-sol-muted">No sync has run yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Mode", result.mode],
          ["Added", result.added],
          ["Updated", result.updated],
          ["Skipped", result.skipped],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-sol-ink/10 bg-sol-cream p-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-sol-muted">
              {label}
            </div>
            <div className="mt-1 text-lg font-black text-sol-ink">{String(value)}</div>
          </div>
        ))}
      </div>

      <dl className="grid gap-2 text-sm text-sol-muted sm:grid-cols-2">
        <div>
          <dt className="font-bold text-sol-ink">Finished</dt>
          <dd>{new Date(result.finishedAt).toLocaleString("da-DK")}</dd>
        </div>
        {result.reason && (
          <div>
            <dt className="font-bold text-sol-ink">Reason</dt>
            <dd>{result.reason}</dd>
          </div>
        )}
        {result.error && (
          <div className="sm:col-span-2">
            <dt className="font-bold text-sol-ink">Error</dt>
            <dd>{result.error}</dd>
          </div>
        )}
      </dl>

      {result.errors.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-sol-ink">Row errors</h2>
          <ul className="mt-2 divide-y divide-sol-ink/10 rounded-lg border border-sol-ink/10 bg-sol-cream text-sm">
            {result.errors.slice(0, 10).map((error, index) => (
              <li key={`${error.row ?? "x"}-${error.sku ?? "x"}-${index}`} className="p-3">
                <span className="font-bold text-sol-ink">
                  {error.row ? `Row ${error.row}` : error.sku ?? "Sheet"}
                </span>
                <span className="text-sol-muted">: {error.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function AdminSheetsPage({ searchParams }: PageProps) {
  const [{ status }, settings, google] = await Promise.all([
    searchParams ?? Promise.resolve({} as { status?: string }),
    getSheetsSyncSettings(),
    getGoogleConnectionStatus(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <AdminPageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Google Sheets
            <StatusPill on={settings.enabled} label={settings.enabled ? "Flag on" : "Flag off"} />
            <StatusPill
              on={google.connected}
              label={google.connected ? "Google connected" : "Google disconnected"}
            />
          </span>
        }
        breadcrumb={[{ label: "Integrationer", href: "/admin/integrations" }]}
        subtitle="Sync the product catalog with a Google Sheet using SKU as the stable key."
      />

      {status === "saved" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
          Spreadsheet id saved.
        </div>
      )}
      {status === "synced" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
          Sync action finished. See the latest result below.
        </div>
      )}

      <AdminCard title="Spreadsheet">
        <form action={saveSheetsSettingsAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <AdminField label="Spreadsheet id" htmlFor="spreadsheetId">
              <AdminInput
                id="spreadsheetId"
                name="spreadsheetId"
                defaultValue={settings.spreadsheetId ?? ""}
                placeholder="1abcDEF..."
              />
            </AdminField>
          </div>
          <AdminButton type="submit" variant="primary" icon={Save}>
            Save
          </AdminButton>
        </form>
      </AdminCard>

      <AdminCard title="Run sync">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-sol-muted">
            Pull imports sheet rows, push writes catalog rows, sync does both.
          </p>
          <form action={runSheetsSyncAction} className="flex flex-wrap gap-2">
            <AdminButton type="submit" name="mode" value="pull" variant="secondary" icon={Download}>
              Pull
            </AdminButton>
            <AdminButton type="submit" name="mode" value="push" variant="secondary" icon={Upload}>
              Push
            </AdminButton>
            <AdminButton type="submit" name="mode" value="sync" variant="primary" icon={RefreshCw}>
              Sync now
            </AdminButton>
          </form>
        </div>
      </AdminCard>

      <AdminCard title="Last result">
        <ResultSummary result={settings.lastResult} />
      </AdminCard>
    </div>
  );
}
