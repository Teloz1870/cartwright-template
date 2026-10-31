"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Upload, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

import AdminCard from "@/components/admin/ui/AdminCard";
import AdminButton from "@/components/admin/ui/AdminButton";
import AdminBadge from "@/components/admin/ui/AdminBadge";
import { AdminTable, AdminThead, AdminTbody, AdminTr, AdminTh, AdminTd } from "@/components/admin/ui/AdminTable";
import type { ImportPlan } from "@/lib/sitepack/import-plan";
import { exportSiteAction, importPreviewAction, importApplyAction, type ApplyResult } from "./actions";

/** human-readable bytes (the plan's fetchBytes + export size). */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Trigger a browser download of base64 bytes (no server round-trip). Decodes via
 *  a data-URL fetch → the browser does the base64→binary natively (no atob() that
 *  would materialize a megabyte string on the main thread for a large pack). */
async function downloadBase64(base64: string, filename: string): Promise<void> {
  const blob = await (await fetch(`data:application/octet-stream;base64,${base64}`)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Phase = "idle" | "preview" | "done";

export function SitePackWizard({ currentMode }: { currentMode: string }) {
  const [isPending, startTransition] = useTransition();

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Restore
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [base64, setBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [allowModeMismatch, setAllowModeMismatch] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportErr(null);
    setExportMsg(null);
    try {
      const r = await exportSiteAction();
      if (!r.ok) {
        setExportErr(r.error);
        return;
      }
      await downloadBase64(r.cartpackBase64, r.filename);
      const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
      setExportMsg(`Exported ${r.filename} — ${total} records, ${formatBytes(r.sizeBytes)}.`);
    } catch {
      setExportErr("Export failed unexpectedly. Please try again.");
    } finally {
      setExporting(false); // always clears the loading state, even on a thrown transport error
    }
  }

  function reset() {
    setPhase("idle");
    setBase64(null);
    setFileName(null);
    setPlan(null);
    setRestoreErr(null);
    setResult(null);
    setAllowModeMismatch(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function runPreview(b64: string, override: boolean) {
    setRestoreErr(null);
    startTransition(async () => {
      const r = await importPreviewAction(b64, override);
      if (r.ok) {
        setPlan(r.plan);
        setPhase("preview");
      } else {
        setRestoreErr(r.error);
        setPhase("idle");
      }
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const b64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
      setBase64(b64);
      runPreview(b64, false);
    };
    reader.onerror = () => setRestoreErr("Could not read the file.");
    reader.readAsDataURL(file);
  }

  function runApply() {
    if (!base64) return;
    startTransition(async () => {
      const r = await importApplyAction(base64, allowModeMismatch);
      setResult(r);
      setPhase("done");
    });
  }

  const modeMismatch = /mode mismatch/i.test(restoreErr ?? "");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Export ─────────────────────────────────────────────────────── */}
      <AdminCard title="Export this site" description="Bundle design, pages, products, content & media into one portable .cartpack you can restore onto a newer Cartwright.">
        <AdminButton variant="primary" icon={Download} loading={exporting} onClick={handleExport}>
          Export .cartpack
        </AdminButton>
        <div aria-live="polite">
          {exportMsg ? <p className="mt-3 text-sm text-sol-ink/70">{exportMsg}</p> : null}
          {exportErr ? <p className="mt-3 text-sm text-red-600">{exportErr}</p> : null}
        </div>
      </AdminCard>

      {/* ── Restore ────────────────────────────────────────────────────── */}
      <AdminCard title="Restore a .cartpack" description="Non-destructive: a name that already exists is restored under a suffix (about → about-2), never overwritten.">
        <input ref={fileRef} type="file" accept=".cartpack,application/octet-stream" onChange={onFileChange} className="hidden" />

        <div aria-live="polite">
        {phase === "idle" && (
          <div className="flex flex-col gap-3">
            <AdminButton variant="secondary" icon={Upload} loading={isPending} onClick={() => fileRef.current?.click()}>
              Choose a .cartpack file
            </AdminButton>
            {fileName ? <p className="text-sm text-sol-ink/60">{fileName}</p> : null}
            {restoreErr ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <p>{restoreErr}</p>
                {modeMismatch && base64 ? (
                  <AdminButton
                    className="mt-2"
                    variant="secondary"
                    loading={isPending}
                    disabled={isPending}
                    onClick={() => {
                      setAllowModeMismatch(true);
                      runPreview(base64, true);
                    }}
                  >
                    Preview anyway (allow mode mismatch)
                  </AdminButton>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {phase === "preview" && plan ? (
          <PlanView
            plan={plan}
            currentMode={currentMode}
            allowedModeMismatch={allowModeMismatch}
            pending={isPending}
            onConfirm={runApply}
            onCancel={reset}
          />
        ) : null}

        {phase === "done" && result ? <ResultView result={result} onReset={reset} /> : null}
        </div>
      </AdminCard>
    </div>
  );
}

function PlanView({
  plan,
  currentMode,
  allowedModeMismatch,
  pending,
  onConfirm,
  onCancel,
}: {
  plan: ImportPlan;
  currentMode: string;
  allowedModeMismatch: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-sol-ink">
          Restore “{plan.name}” <span className="text-sol-ink/50">({plan.mode})</span>
        </p>
        <p className="text-sm text-sol-ink/70">
          {plan.totals.create} new · {plan.totals.suffixed} renamed · {plan.totals.skip} skipped
        </p>
      </div>

      {plan.mode !== currentMode ? (
        <AdminBadge tone={allowedModeMismatch ? "warning" : "critical"}>
          Pack mode “{plan.mode}” ≠ this site “{currentMode}”
        </AdminBadge>
      ) : null}

      <AdminTable>
        <AdminThead>
          <AdminTr>
            <AdminTh>Collection</AdminTh>
            <AdminTh align="right">New</AdminTh>
            <AdminTh align="right">Renamed</AdminTh>
            <AdminTh align="right">Skipped</AdminTh>
            <AdminTh align="right">Total</AdminTh>
          </AdminTr>
        </AdminThead>
        <AdminTbody>
          {plan.collections.map((c) => (
            <AdminTr key={c.collection}>
              <AdminTd>{c.collection}</AdminTd>
              <AdminTd align="right">{c.create}</AdminTd>
              <AdminTd align="right">{c.suffixed}</AdminTd>
              <AdminTd align="right">{c.skip}</AdminTd>
              <AdminTd align="right">{c.total}</AdminTd>
            </AdminTr>
          ))}
        </AdminTbody>
      </AdminTable>

      <p className="text-sm text-sol-ink/70">
        Media: {plan.media.reuse} reused, {plan.media.fetch} to store ({formatBytes(plan.media.fetchBytes)})
        {plan.media.skip > 0 ? `, ${plan.media.skip} skipped` : ""}.
        {plan.riders.variants + plan.riders.productMedia > 0
          ? ` Plus ${plan.riders.variants} variants, ${plan.riders.productMedia} gallery links.`
          : ""}
      </p>

      {plan.designRef.kind === "code" && plan.designRef.installed === false ? (
        <AdminBadge tone="warning">Design “{plan.designRef.slug}” isn’t installed — palette only</AdminBadge>
      ) : null}

      {plan.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-1 font-medium">
            <AlertTriangle className="h-4 w-4" /> Before you restore
          </p>
          <ul className="mt-1 list-disc pl-5">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.totals.suffixed > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-sol-ink/70">Renamed to avoid collisions ({plan.totals.suffixed})</summary>
          <ul className="mt-2 space-y-1">
            {plan.collections.flatMap((c) =>
              c.items
                .filter((i) => i.action === "create-suffixed")
                .map((i, idx) => (
                  <li key={`${c.collection}-${idx}`}>
                    <span className="font-mono text-sol-ink/50">{c.collection}</span> {i.key} →{" "}
                    {i.resolvedSlug ?? i.key}
                    {i.resolvedSku ? ` (sku → ${i.resolvedSku})` : ""}
                  </li>
                )),
            )}
          </ul>
        </details>
      ) : null}

      <p className="text-xs text-sol-ink/50">
        The current site is snapshotted to a .cartpack first — you can download it afterwards to undo this restore.
      </p>

      <div className="flex gap-2">
        <AdminButton variant="primary" loading={pending} onClick={onConfirm}>
          Confirm restore
        </AdminButton>
        <AdminButton variant="plain" onClick={onCancel} disabled={pending}>
          Cancel
        </AdminButton>
      </div>
    </div>
  );
}

function ResultView({ result, onReset }: { result: ApplyResult; onReset: () => void }) {
  const snapshot: string | undefined = "snapshotBase64" in result ? result.snapshotBase64 : undefined;
  const snapName = `${result.name || "site"}-undo.cartpack`;
  return (
    <div className="flex flex-col gap-4" role="status">
      {result.ok ? (
        <>
          <p className="flex items-center gap-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Restored “{result.name}”.
          </p>
          <p className="text-sm text-sol-ink/70">
            Created {Object.values(result.created).reduce((a, b) => a + b, 0)} records · {result.mediaStored} media stored
            {result.mediaFailed > 0 ? ` · ${result.mediaFailed} media failed` : ""} · look{" "}
            {result.appliedComposition ? "applied" : "skipped"}.
          </p>
          {result.warnings.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-amber-800">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Restore did not complete: {result.error}</p>
          {result.snapshotBase64 ? (
            <p className="mt-1">Download the undo snapshot below, then restore it to roll back the partial changes.</p>
          ) : null}
        </div>
      )}

      <div className="flex gap-2">
        {snapshot ? (
          <AdminButton variant="secondary" icon={RotateCcw} onClick={() => void downloadBase64(snapshot, snapName)}>
            Download undo snapshot
          </AdminButton>
        ) : null}
        <AdminButton variant="plain" onClick={onReset}>
          Done
        </AdminButton>
      </div>
    </div>
  );
}
