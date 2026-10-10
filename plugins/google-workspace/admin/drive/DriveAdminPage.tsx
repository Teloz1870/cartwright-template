import Link from "next/link";

import { brand as brandDefaults } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { getGoogleConnectionStatus } from "@/plugins/google-workspace/lib/google/oauth";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  AdminButton,
  AdminCard,
  AdminField,
  AdminInput,
  AdminPageHeader,
} from "@/components/admin/ui";
import {
  backupDriveNowAction,
  importDriveFolderAction,
  saveDriveSettingsAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = {
  saved?: string;
  status?: string;
};

export default async function AdminDrivePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const [brand, googleOAuth, settings, importedCount] = await Promise.all([
    getBrand(),
    getGoogleConnectionStatus(),
    prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { driveFolderId: true, driveBackupFolderId: true },
    }),
    prisma.mediaAsset.count({
      where: { driveFileId: { not: null } },
    }),
  ]);

  const features = brand.features as Record<string, boolean | undefined>;
  const defaultFeatures = brandDefaults.features as Record<
    string,
    boolean | undefined
  >;
  const driveEnabled = Boolean(features.googleDrive);
  const mediaEnabled = Boolean(features.mediaLibrary);
  const status = statusMessage(params);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <AdminPageHeader
        title="Google Drive"
        breadcrumb={[{ label: "Integrationer", href: "/admin/integrations" }]}
        subtitle="Importer billeder fra Drive til mediebiblioteket, og send logiske backups til Drive via den delte Google Workspace OAuth2-connector."
      />

      {status && (
        <div className="rounded-lg border border-sol-ink/10 bg-sol-sand px-4 py-3 text-sm font-semibold text-sol-ink">
          {status}
        </div>
      )}

      <AdminCard title="Status">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusItem
            label="Google Drive feature"
            value={driveEnabled ? "Til" : "Fra"}
          />
          <StatusItem
            label="Config default"
            value={defaultFeatures.googleDrive ? "Til" : "Fra"}
          />
          <StatusItem label="Media library" value={mediaEnabled ? "Til" : "Fra"} />
          <StatusItem
            label="OAuth connector"
            value={googleOAuth.connected ? "Connected" : googleOAuth.status}
          />
          <StatusItem
            label="Google account"
            value={googleOAuth.accountEmail ?? "Ikke forbundet"}
          />
          <StatusItem
            label="Importerede Drive-assets"
            value={String(importedCount)}
          />
        </dl>

        {!driveEnabled && (
          <p className="mt-4 text-sm font-semibold text-sol-muted">
            Funktionen er slået fra. Tænd runtime-flaget{" "}
            <Link className="font-black underline" href="/admin/features">
              googleDrive
            </Link>{" "}
            før import eller backup kører.
          </p>
        )}
        {driveEnabled && !mediaEnabled && (
          <p className="mt-4 text-sm font-semibold text-sol-muted">
            Google Drive import kræver mediebiblioteket. Tænd mediaLibrary i
            brand.config og redeploy før import bruges.
          </p>
        )}
        {!googleOAuth.connected && (
          <p className="mt-4 text-sm font-semibold text-sol-muted">
            Forbind Google Workspace OAuth2 under{" "}
            <Link className="font-black underline" href="/admin/integrations">
              Integrationer
            </Link>
            .
          </p>
        )}
      </AdminCard>

      <AdminCard title="Mapper">
        <form action={saveDriveSettingsAction} className="grid gap-4">
          <AdminField label="Importmappe" htmlFor="driveFolderId">
            <AdminInput
              id="driveFolderId"
              name="driveFolderId"
              defaultValue={settings?.driveFolderId ?? ""}
              placeholder="Drive folder ID eller https://drive.google.com/drive/folders/..."
            />
          </AdminField>
          <AdminField label="Backupmappe" htmlFor="driveBackupFolderId">
            <AdminInput
              id="driveBackupFolderId"
              name="driveBackupFolderId"
              defaultValue={settings?.driveBackupFolderId ?? ""}
              placeholder="Tom = brug importmappen"
            />
          </AdminField>
          <div>
            <AdminButton type="submit" variant="primary">
              Gem mapper
            </AdminButton>
          </div>
        </form>
      </AdminCard>

      <section className="grid gap-4 md:grid-cols-2">
        <AdminCard title="Importér billeder">
          <form action={importDriveFolderAction}>
            <p className="text-sm font-medium text-sol-muted">
              Henter de seneste JPEG/PNG/WebP-filer fra importmappen, uploader dem
              til Blob og opretter MediaAsset-rækker.
            </p>
            <AdminButton
              type="submit"
              variant="primary"
              disabled={!driveEnabled || !mediaEnabled || !googleOAuth.connected}
              className="mt-4"
            >
              Importér nu
            </AdminButton>
          </form>
        </AdminCard>

        <AdminCard title="Backup til Drive">
          <form action={backupDriveNowAction}>
            <p className="text-sm font-medium text-sol-muted">
              Kører den eksisterende logiske backup og uploader JSON-filen til
              backupmappen i Drive.
            </p>
            <AdminButton
              type="submit"
              variant="primary"
              disabled={!driveEnabled || !googleOAuth.connected}
              className="mt-4"
            >
              Backup nu
            </AdminButton>
          </form>
        </AdminCard>
      </section>
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2">
      <dt className="text-xs font-black uppercase tracking-wide text-sol-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-sol-ink">{value}</dd>
    </div>
  );
}

function statusMessage(params: SearchParams): string | null {
  if (params.saved === "1") return "Drive-mapper gemt.";
  if (!params.status) return null;
  if (params.status.startsWith("imported-")) {
    return `Drive-import færdig: ${params.status.replace("imported-", "")} nye assets.`;
  }
  if (params.status === "backup-ok") return "Backup uploadet til Google Drive.";
  if (params.status === "import-failed") {
    return "Drive-import fejlede eller blev sprunget over.";
  }
  if (params.status === "backup-failed") {
    return "Drive-backup fejlede eller blev sprunget over.";
  }
  return null;
}
