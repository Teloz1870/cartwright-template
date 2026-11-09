"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import {
  listRedirects,
  createRedirect,
  deleteRedirect,
  type RedirectResult,
} from "@/lib/redirects/store";
import {
  importRedirects,
  planRedirectCsv,
  type RedirectImportPlan,
  type RedirectImportResult,
} from "@/lib/redirects/import";

export async function getRedirectsForUi() {
  await requireAdmin();
  return listRedirects();
}

export async function addRedirect(
  fromPath: string,
  toPath: string,
  statusCode: number,
): Promise<RedirectResult> {
  const session = await requireAdmin();
  const r = await createRedirect(fromPath, toPath, statusCode, `user:${session.user.id}`);
  if (r.ok) revalidatePath("/admin/redirects");
  return r;
}

export async function removeRedirect(id: string): Promise<RedirectResult> {
  const session = await requireAdmin();
  const r = await deleteRedirect(id, `user:${session.user.id}`);
  if (r.ok) revalidatePath("/admin/redirects");
  return r;
}

/** Dry run: the plan the owner reviews before anything is saved. A failed read
 *  (DB down) is a result the panel can show, not a rejection for the error boundary. */
export async function previewRedirectImport(
  csv: string,
): Promise<{ ok: true; plan: RedirectImportPlan } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    return { ok: true, plan: await planRedirectCsv(csv) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not preview." };
  }
}

export async function importRedirectsFromCsv(
  csv: string,
): Promise<{ ok: true; result: RedirectImportResult } | { ok: false; error: string }> {
  const session = await requireAdmin();
  try {
    const result = await importRedirects(csv, `user:${session.user.id}`, { dryRun: false });
    if (result.imported > 0) revalidatePath("/admin/redirects");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not import." };
  }
}
