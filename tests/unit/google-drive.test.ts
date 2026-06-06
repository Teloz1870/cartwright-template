import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedGoogleFetch: vi.fn(),
  put: vi.fn(),
  prisma: {
    integrationSettings: {
      findUnique: vi.fn(),
    },
    mediaAsset: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/google/client", () => ({
  authorizedGoogleFetch: mocks.authorizedGoogleFetch,
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

describe("Google Drive API wrapper", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists non-trashed files in a folder without throwing on API errors", async () => {
    const { listDriveFilesInFolder } = await import("@/lib/google/drive");
    mocks.authorizedGoogleFetch.mockResolvedValue({
      ok: true,
      response: new Response("nope", { status: 403 }),
    });

    const result = await listDriveFilesInFolder("folder-1");

    expect(result).toEqual({
      ok: false,
      error: "Google Drive list failed with status 403.",
    });
    const url = new URL(String(mocks.authorizedGoogleFetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/drive/v3/files");
    expect(url.searchParams.get("q")).toContain("'folder-1' in parents");
    expect(url.searchParams.get("q")).toContain("trashed = false");
  });

  it("uploads JSON to Drive using multipart metadata and content", async () => {
    const { uploadDriveFile } = await import("@/lib/google/drive");
    mocks.authorizedGoogleFetch.mockResolvedValue({
      ok: true,
      response: Response.json({ id: "file-1", name: "backup.json" }),
    });

    const result = await uploadDriveFile({
      name: "backup.json",
      mime: "application/json",
      bytes: Buffer.from("{}"),
      folderId: "folder-1",
    });

    expect(result).toEqual({
      ok: true,
      file: { id: "file-1", name: "backup.json" },
    });
    const [_url, init] = mocks.authorizedGoogleFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toContain("multipart/related");
    expect(String(init.body)).toContain('"parents":["folder-1"]');
    expect(String(init.body)).toContain("{}");
  });
});

describe("Google Drive media import and backup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("imports Drive image bytes through Vercel Blob and MediaAsset dedupe", async () => {
    const { importDriveImageFile } = await import(
      "@/lib/media/google-drive-import"
    );
    mocks.authorizedGoogleFetch.mockResolvedValue({
      ok: true,
      response: new Response(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        {
          headers: { "content-type": "image/png" },
        },
      ),
    });
    mocks.put.mockResolvedValue({
      url: "https://blob.example/drive-imports/file.png",
      pathname: "drive-imports/file.png",
    });
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue(null);
    mocks.prisma.mediaAsset.create.mockResolvedValue({ id: "asset-1" });

    const result = await importDriveImageFile({
      id: "drive-file-1",
      name: "Hero Image.png",
      mimeType: "image/png",
      size: "8",
    });

    expect(result).toEqual({ ok: true, assetId: "asset-1", skipped: false });
    expect(mocks.put.mock.calls[0][0]).toMatch(
      /^drive-imports\/.+-hero-image\.png$/,
    );
    expect(mocks.prisma.mediaAsset.create.mock.calls[0][0].data).toMatchObject({
      url: "https://blob.example/drive-imports/file.png",
      mime: "image/png",
      sizeBytes: 8,
      driveFileId: "drive-file-1",
      uploadedBy: "system:google-drive",
    });
  });

  it("backs up existing serialized payload to the configured Drive folder", async () => {
    const { uploadBackupJsonToDrive } = await import("@/lib/backup/google-drive");
    mocks.prisma.integrationSettings.findUnique.mockResolvedValue({
      driveBackupFolderId: "backup-folder",
      driveFolderId: "import-folder",
    });
    mocks.authorizedGoogleFetch.mockResolvedValue({
      ok: true,
      response: Response.json({ id: "drive-backup-1", name: "backup.json" }),
    });

    const result = await uploadBackupJsonToDrive("{}", "backup.json");

    expect(result).toEqual({
      ok: true,
      file: { id: "drive-backup-1", name: "backup.json" },
      folderId: "backup-folder",
    });
  });
});
