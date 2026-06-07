import Link from "next/link";
import { Download, RefreshCw, Save, Upload } from "lucide-react";

import { getGoogleConnectionStatus } from "@/lib/google/oauth";
import { getSheetsSyncSettings, type SheetsSyncResult } from "@/lib/sheets/sync";
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
    <div className="max-w-4xl space-y-8">
      <Link
        href="/admin/integrations"
        className="inline-flex text-sm font-bold text-sol-muted transition hover:text-sol-ink"
      >
        ← Integrationer
      </Link>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-black text-sol-ink">Google Sheets</h1>
          <StatusPill on={settings.enabled} label={settings.enabled ? "Flag on" : "Flag off"} />
          <StatusPill
            on={google.connected}
            label={google.connected ? "Google connected" : "Google disconnected"}
          />
        </div>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Sync the product catalog with a Google Sheet using SKU as the stable key.
        </p>
      </header>

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

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
        <h2 className="text-lg font-black text-sol-ink">Spreadsheet</h2>
        <form action={saveSheetsSettingsAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="text-xs font-black uppercase tracking-wider text-sol-muted">
              Spreadsheet id
            </span>
            <input
              name="spreadsheetId"
              defaultValue={settings.spreadsheetId ?? ""}
              placeholder="1abcDEF..."
              className="mt-1 w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-medium text-sol-ink outline-none transition focus:border-sol-accent"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-2 self-end rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:bg-sol-accent-deep"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Save
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-sol-ink">Run sync</h2>
            <p className="mt-1 text-sm text-sol-muted">
              Pull imports sheet rows, push writes catalog rows, sync does both.
            </p>
          </div>
          <form action={runSheetsSyncAction} className="flex flex-wrap gap-2">
            <button
              name="mode"
              value="pull"
              className="inline-flex items-center gap-2 rounded-lg border border-sol-ink/15 bg-white px-4 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Pull
            </button>
            <button
              name="mode"
              value="push"
              className="inline-flex items-center gap-2 rounded-lg border border-sol-ink/15 bg-white px-4 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Push
            </button>
            <button
              name="mode"
              value="sync"
              className="inline-flex items-center gap-2 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:bg-sol-accent-deep"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sync now
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
        <h2 className="text-lg font-black text-sol-ink">Last result</h2>
        <div className="mt-4">
          <ResultSummary result={settings.lastResult} />
        </div>
      </section>
    </div>
  );
}
