import Link from "next/link";

import { brand as brandDefaults } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { getGoogleConnectionStatus } from "@/lib/google/oauth";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
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
    <div className="flex max-w-4xl flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Google Drive</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Importer billeder fra Drive til mediebiblioteket, og send logiske
          backups til Drive via den delte Google Workspace OAuth2-connector.
        </p>
      </header>

      {status && (
        <div className="rounded-lg border border-sol-ink/10 bg-sol-sand px-4 py-3 text-sm font-semibold text-sol-ink">
          {status}
        </div>
      )}

      <section className="rounded-lg border border-sol-ink/10 bg-sol-sand p-5 shadow-sm">
        <h2 className="text-lg font-black text-sol-ink">Status</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
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
      </section>

      <section className="rounded-lg border border-sol-ink/10 bg-sol-sand p-5 shadow-sm">
        <h2 className="text-lg font-black text-sol-ink">Mapper</h2>
        <form action={saveDriveSettingsAction} className="mt-4 grid gap-4">
          <label className="grid gap-1 text-sm font-bold text-sol-ink">
            Importmappe
            <input
              name="driveFolderId"
              defaultValue={settings?.driveFolderId ?? ""}
              placeholder="Drive folder ID eller https://drive.google.com/drive/folders/..."
              className="rounded-lg border border-sol-ink/15 bg-white px-3 py-2 font-medium outline-none focus:border-sol-accent"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-sol-ink">
            Backupmappe
            <input
              name="driveBackupFolderId"
              defaultValue={settings?.driveBackupFolderId ?? ""}
              placeholder="Tom = brug importmappen"
              className="rounded-lg border border-sol-ink/15 bg-white px-3 py-2 font-medium outline-none focus:border-sol-accent"
            />
          </label>
          <div>
            <button
              type="submit"
              className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:bg-sol-accent-deep"
            >
              Gem mapper
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <form
          action={importDriveFolderAction}
          className="rounded-lg border border-sol-ink/10 bg-sol-sand p-5 shadow-sm"
        >
          <h2 className="text-lg font-black text-sol-ink">Importér billeder</h2>
          <p className="mt-2 text-sm font-medium text-sol-muted">
            Henter de seneste JPEG/PNG/WebP-filer fra importmappen, uploader dem
            til Blob og opretter MediaAsset-rækker.
          </p>
          <button
            type="submit"
            disabled={!driveEnabled || !mediaEnabled || !googleOAuth.connected}
            className="mt-4 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:bg-sol-accent-deep disabled:cursor-not-allowed disabled:bg-sol-ink/20"
          >
            Importér nu
          </button>
        </form>

        <form
          action={backupDriveNowAction}
          className="rounded-lg border border-sol-ink/10 bg-sol-sand p-5 shadow-sm"
        >
          <h2 className="text-lg font-black text-sol-ink">Backup til Drive</h2>
          <p className="mt-2 text-sm font-medium text-sol-muted">
            Kører den eksisterende logiske backup og uploader JSON-filen til
            backupmappen i Drive.
          </p>
          <button
            type="submit"
            disabled={!driveEnabled || !googleOAuth.connected}
            className="mt-4 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:bg-sol-accent-deep disabled:cursor-not-allowed disabled:bg-sol-ink/20"
          >
            Backup nu
          </button>
        </form>
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
