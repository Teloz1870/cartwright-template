import { beforeEach, describe, expect, it, vi } from "vitest";

// DRIVE-IMPORT-PAGINATION: the folder import listed one page of 50 and never
// passed nextPageToken back, so every run saw the same newest 50 files — and a
// file imported by an earlier run counted as imported again. These tests run
// the import against a fake Drive folder that pages like the real API.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const mocks = vi.hoisted(() => ({
  listDriveFilesInFolder: vi.fn(),
  downloadDriveFileBytes: vi.fn(),
  put: vi.fn(),
  findOrCreateBySha256: vi.fn(),
  redirect: vi.fn(),
  prisma: {
    integrationSettings: { findUnique: vi.fn() },
    mediaAsset: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/plugins/google-workspace/lib/google/drive", () => ({
  listDriveFilesInFolder: mocks.listDriveFilesInFolder,
  downloadDriveFileBytes: mocks.downloadDriveFileBytes,
}));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({
    features: { googleDrive: true, mediaLibrary: true },
  }),
}));
vi.mock("@/lib/media/asset", () => ({
  computeSha256: () => "sha",
  findOrCreateBySha256: mocks.findOrCreateBySha256,
}));
// For the /admin/drive action, which runs the real import against the fake Drive.
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/plugins/google-workspace/lib/drive-backup", () => ({
  runDriveBackup: vi.fn(),
}));

import {
  importConfiguredDriveFolder,
  importDriveImageFile,
} from "@/plugins/google-workspace/lib/drive-import";
import { importDriveFolderAction } from "@/plugins/google-workspace/admin/drive/actions";

type FakeFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string | null;
  webViewLink: string | null;
};

function folderOf(count: number): FakeFile[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    name: `image-${i}.png`,
    mimeType: "image/png",
    size: String(PNG.length),
    modifiedTime: null,
    webViewLink: null,
  }));
}

// MediaAsset rows that carry a driveFileId, i.e. what earlier runs imported.
let importedIds: Set<string>;

function serveFolder(files: FakeFile[]) {
  mocks.listDriveFilesInFolder.mockImplementation(
    async (
      _folderId: string,
      options: { pageSize?: number; pageToken?: string | null } = {},
    ) => {
      const size = options.pageSize ?? 100;
      const offset = options.pageToken ? Number(options.pageToken) : 0;
      const next = offset + size;
      return {
        ok: true,
        files: files.slice(offset, next),
        nextPageToken: next < files.length ? String(next) : null,
      };
    },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  importedIds = new Set();
  mocks.prisma.integrationSettings.findUnique.mockResolvedValue({
    driveFolderId: "folder-1",
  });
  mocks.prisma.mediaAsset.findMany.mockImplementation(
    async (args: { where: { driveFileId: { in: string[] } } }) =>
      args.where.driveFileId.in
        .filter((id) => importedIds.has(id))
        .map((driveFileId) => ({ driveFileId })),
  );
  mocks.prisma.mediaAsset.findFirst.mockImplementation(
    async (args: { where: { driveFileId: string } }) =>
      importedIds.has(args.where.driveFileId)
        ? { id: `asset-${args.where.driveFileId}` }
        : null,
  );
  mocks.downloadDriveFileBytes.mockImplementation(async () => ({
    ok: true,
    bytes: Buffer.from(PNG),
    mime: "image/png",
  }));
  mocks.put.mockImplementation(async (pathname: string) => ({
    url: `https://blob.example/${pathname}`,
    pathname,
  }));
  mocks.findOrCreateBySha256.mockImplementation(
    async (params: { driveFileId: string }) => {
      importedIds.add(params.driveFileId);
      return { id: `asset-${params.driveFileId}` };
    },
  );
});

describe("Drive folder import paging", () => {
  it("follows nextPageToken past files an earlier run imported and counts them as skipped", async () => {
    serveFolder(folderOf(1030));
    for (let i = 0; i < 1010; i += 1) importedIds.add(`f${i}`);

    const result = await importConfiguredDriveFolder();

    expect(mocks.listDriveFilesInFolder).toHaveBeenCalledTimes(2);
    expect(mocks.listDriveFilesInFolder.mock.calls[1][1]).toMatchObject({
      pageToken: "1000",
    });
    expect(result).toMatchObject({
      ok: true,
      scanned: 1030,
      imported: 20,
      skipped: 1010,
      more: false,
      errors: [],
    });
    expect(result.assets.map((a) => a.driveFileId)).toEqual(
      Array.from({ length: 20 }, (_, i) => `f${1010 + i}`),
    );
    expect(mocks.downloadDriveFileBytes).toHaveBeenCalledTimes(20);
  });

  it("imports at most 50 per run, says more is left, and the next runs continue where it stopped", async () => {
    serveFolder(folderOf(120));

    const first = await importConfiguredDriveFolder();
    expect(first).toMatchObject({ imported: 50, skipped: 0, more: true });

    const second = await importConfiguredDriveFolder();
    expect(second).toMatchObject({ imported: 50, skipped: 50, more: true });

    const third = await importConfiguredDriveFolder();
    expect(third).toMatchObject({ imported: 20, skipped: 100, more: false });

    const all = [first, second, third].flatMap((r) =>
      r.assets.map((a) => a.driveFileId),
    );
    expect(new Set(all).size).toBe(120);
    expect(all).toHaveLength(120);

    const fourth = await importConfiguredDriveFolder();
    expect(fourth).toMatchObject({ imported: 0, skipped: 120, more: false });
    expect(mocks.downloadDriveFileBytes).toHaveBeenCalledTimes(120);
  });

  it("reaches every file of a folder past 2,000, run after run, until more is false", async () => {
    serveFolder(folderOf(2100));

    const runs = [];
    let result;
    do {
      result = await importConfiguredDriveFolder();
      runs.push(result);
    } while (result.more && runs.length < 100);

    expect(runs).toHaveLength(42);
    expect(runs.every((r) => r.imported === 50)).toBe(true);
    expect(importedIds.size).toBe(2100);
    expect(result).toMatchObject({ imported: 50, more: false, errors: [] });
  });

  // R1 falsifier: every run re-lists from the newest file and the walk is
  // capped, so the files past the cap are out of reach however often the
  // import runs. It must say so instead of asking for another run.
  it("walks 20 pages of 1,000 and says the folder is too large instead of 'run again' when it goes on past that", async () => {
    const files = folderOf(20_100);
    serveFolder(files);
    for (const file of files.slice(0, 20_000)) importedIds.add(file.id);

    const result = await importConfiguredDriveFolder();

    expect(mocks.listDriveFilesInFolder).toHaveBeenCalledTimes(20);
    expect(mocks.listDriveFilesInFolder.mock.calls[0][1]).toMatchObject({
      pageSize: 1000,
    });
    expect(result).toMatchObject({
      ok: true,
      scanned: 20_000,
      imported: 0,
      skipped: 20_000,
      more: false,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^drive-folder-too-large: /);
    expect(result.errors[0]).toContain("20,000");
    expect(mocks.downloadDriveFileBytes).not.toHaveBeenCalled();

    const again = await importConfiguredDriveFolder();
    expect(again).toMatchObject({ imported: 0, more: false });
    expect(again.errors[0]).toMatch(/^drive-folder-too-large: /);
  });

  it("imports what the walk reaches and still says too large, not more, when it ends at the page cap", async () => {
    const files = folderOf(20_010);
    serveFolder(files);
    // f19990..f19999 sit inside the walk, f20000..f20009 past it.
    for (const file of files.slice(0, 19_990)) importedIds.add(file.id);

    const result = await importConfiguredDriveFolder();

    expect(result).toMatchObject({ ok: true, imported: 10, more: false });
    expect(result.assets.map((a) => a.driveFileId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `f${19_990 + i}`),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^drive-folder-too-large: /);
  });

  it("/admin/drive is sent to the too-large message, not to 'run again', when the walk cannot reach the rest", async () => {
    const files = folderOf(20_100);
    serveFolder(files);
    for (const file of files.slice(0, 20_000)) importedIds.add(file.id);

    await importDriveFolderAction();

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/admin/drive?status=imported-0&toolarge=1",
    );
  });

  it("/admin/drive is told to run again when the download cap stopped the run", async () => {
    serveFolder(folderOf(70));

    await importDriveFolderAction();

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/admin/drive?status=imported-50&more=1",
    );
  });

  it("keeps what earlier pages imported when a later page fails to list", async () => {
    const files = folderOf(1050);
    serveFolder(files);
    const served = mocks.listDriveFilesInFolder.getMockImplementation()!;
    mocks.listDriveFilesInFolder.mockImplementation(
      async (folderId: string, options: { pageToken?: string | null }) =>
        options.pageToken
          ? { ok: false, error: "Google Drive list failed with status 500." }
          : served(folderId, options),
    );
    for (let i = 0; i < 990; i += 1) importedIds.add(`f${i}`);

    const result = await importConfiguredDriveFolder();

    expect(result).toMatchObject({
      ok: true,
      imported: 10,
      skipped: 990,
      more: true,
      errors: ["Google Drive list failed with status 500."],
    });
  });

  it("reports an already-imported file as skipped, not as a new import", async () => {
    importedIds.add("drive-file-1");

    const result = await importDriveImageFile({
      id: "drive-file-1",
      name: "Hero.png",
      mimeType: "image/png",
      size: "8",
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "already-imported",
      assetId: "asset-drive-file-1",
    });
    expect(mocks.downloadDriveFileBytes).not.toHaveBeenCalled();
  });
});
