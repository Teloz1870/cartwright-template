"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { runDriveBackup } from "@/plugins/google-workspace/lib/drive-backup";
import { prisma } from "@/lib/db";
import { importConfiguredDriveFolder } from "@/plugins/google-workspace/lib/drive-import";

function cleanDriveId(input: FormDataEntryValue | null): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const openId = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openId?.[1]) return openId[1];
  return raw;
}

export async function saveDriveSettingsAction(formData: FormData) {
  await requireAdmin();
  const driveFolderId = cleanDriveId(formData.get("driveFolderId"));
  const driveBackupFolderId = cleanDriveId(formData.get("driveBackupFolderId"));

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      driveFolderId,
      driveBackupFolderId,
    },
    update: {
      driveFolderId,
      driveBackupFolderId,
    },
  });

  revalidatePath("/admin/drive");
  redirect("/admin/drive?saved=1");
}

export async function importDriveFolderAction() {
  await requireAdmin();
  const result = await importConfiguredDriveFolder();
  revalidatePath("/admin/drive");
  revalidatePath("/admin/media");
  const status = result.ok ? `imported-${result.imported}` : "import-failed";
  redirect(`/admin/drive?status=${encodeURIComponent(status)}`);
}

export async function backupDriveNowAction() {
  await requireAdmin();
  const result = await runDriveBackup();
  revalidatePath("/admin/drive");
  const status = result.ok ? "backup-ok" : "backup-failed";
  redirect(`/admin/drive?status=${encodeURIComponent(status)}`);
}
