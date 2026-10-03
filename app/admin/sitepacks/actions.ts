"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { invokeTool } from "@/lib/tools/registry";
import { ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import type { ImportPlan } from "@/lib/sitepack/import-plan";

/**
 * Server actions for the /admin/sitepacks wizard. Each gates on requireAdmin()
 * and invokes the audited sitepack tools with the admin actor + the full admin
 * scope set (the tools themselves re-check the `sitePack` flag + scope). The
 * megabyte .cartpack base64 flows through here but is never logged (the tools
 * keep it OUT of the audit record).
 */

async function adminCtx() {
  const session = await requireAdmin();
  return { actor: `user:${session.user.id}` as const, requestId: randomUUID() };
}

export type ExportResult =
  | { ok: true; filename: string; sizeBytes: number; counts: Record<string, number>; cartpackBase64: string }
  | { ok: false; error: string };

/** Export the whole live site → a .cartpack (base64 rides back for download). */
export async function exportSiteAction(): Promise<ExportResult> {
  const r = await invokeTool("sitepack.export", { confirm: true }, await adminCtx(), ADMIN_CHAT_SCOPES);
  if (!r.ok) return { ok: false, error: r.error };
  const out = r.result as { filename: string; sizeBytes: number; counts: Record<string, number>; cartpackBase64: string };
  return { ok: true, filename: out.filename, sizeBytes: out.sizeBytes, counts: out.counts, cartpackBase64: out.cartpackBase64 };
}

export type PreviewResult = { ok: true; name: string; mode: string; plan: ImportPlan } | { ok: false; error: string };

/** Dry-run: parse + plan the pack WITHOUT writing — the confirm-surface. */
export async function importPreviewAction(cartpackBase64: string, allowModeMismatch?: boolean): Promise<PreviewResult> {
  const args = { cartpackBase64, dryRun: true, ...(allowModeMismatch ? { allowModeMismatch: true } : {}) };
  const r = await invokeTool("sitepack.import", args, await adminCtx(), ADMIN_CHAT_SCOPES);
  if (!r.ok) return { ok: false, error: r.error };
  const out = r.result as { name: string; mode: string; plan: ImportPlan };
  return { ok: true, name: out.name, mode: out.mode, plan: out.plan };
}

export type ApplyResult =
  | {
      ok: true;
      name: string;
      created: Record<string, number>;
      skipped: Record<string, number>;
      mediaStored: number;
      mediaFailed: number;
      appliedComposition: boolean;
      warnings: string[];
      snapshotBase64: string;
    }
  | { ok: false; error: string; name?: string; snapshotBase64?: string };

/** Apply the restore (non-destructive). The undo snapshot ALWAYS rides back —
 *  even on a partial failure — so the wizard can offer a rollback download. */
export async function importApplyAction(cartpackBase64: string, allowModeMismatch?: boolean): Promise<ApplyResult> {
  const args = { cartpackBase64, confirm: true, ...(allowModeMismatch ? { allowModeMismatch: true } : {}) };
  const r = await invokeTool("sitepack.import", args, await adminCtx(), ADMIN_CHAT_SCOPES);
  if (!r.ok) return { ok: false, error: r.error }; // a pre-flight error (no snapshot taken yet)
  const out = r.result as {
    ok: boolean;
    name: string;
    error?: string;
    created?: Record<string, number>;
    skipped?: Record<string, number>;
    mediaStored?: number;
    mediaFailed?: number;
    appliedComposition?: boolean;
    warnings?: string[];
    snapshotBase64: string;
  };
  if (!out.ok) return { ok: false, error: out.error ?? "Import failed mid-restore.", name: out.name, snapshotBase64: out.snapshotBase64 };
  revalidatePath("/"); // storefront picks up the restored content
  return {
    ok: true,
    name: out.name,
    created: out.created ?? {},
    skipped: out.skipped ?? {},
    mediaStored: out.mediaStored ?? 0,
    mediaFailed: out.mediaFailed ?? 0,
    appliedComposition: out.appliedComposition ?? false,
    warnings: out.warnings ?? [],
    snapshotBase64: out.snapshotBase64,
  };
}
