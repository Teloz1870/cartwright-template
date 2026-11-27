"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import {
  pullProductsFromSheet,
  pushProductsToSheet,
  saveSheetsSpreadsheetId,
  syncProductsWithSheet,
} from "@/plugins/google-workspace/lib/sheets-sync";

function adminSheetsPath(status: string): string {
  return `/admin/sheets?status=${encodeURIComponent(status)}`;
}

export async function saveSheetsSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await saveSheetsSpreadsheetId(String(formData.get("spreadsheetId") ?? ""));
  revalidatePath("/admin/sheets");
  redirect(adminSheetsPath("saved"));
}

export async function runSheetsSyncAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const mode = String(formData.get("mode") ?? "sync");
  if (mode === "pull") {
    await pullProductsFromSheet();
  } else if (mode === "push") {
    await pushProductsToSheet();
  } else {
    await syncProductsWithSheet();
  }
  revalidatePath("/admin/sheets");
  redirect(adminSheetsPath("synced"));
}
