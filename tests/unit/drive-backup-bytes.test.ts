import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackupPayload } from "@/lib/backup/dump";

// DRIVE-BACKUP-BYTES: the Drive backup reported `bytes: json.length`, which
// counts UTF-16 code units, not bytes — a dump holding æøå came out smaller
// than the file Drive actually received. The reported size must equal the
// UTF-8 bytes in the upload body.

const mocks = vi.hoisted(() => ({
  authorizedGoogleFetch: vi.fn(),
  dumpDatabase: vi.fn(),
  getBrand: vi.fn(),
  verifyCronRequest: vi.fn(),
  prisma: {
    integrationSettings: { findUnique: vi.fn() },
  },
}));

vi.mock("@/plugins/google-workspace/lib/google/client", () => ({
  authorizedGoogleFetch: mocks.authorizedGoogleFetch,
}));
vi.mock("@/lib/backup/dump", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/backup/dump")>()),
  dumpDatabase: mocks.dumpDatabase,
}));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/cron/auth", () => ({
  verifyCronRequest: mocks.verifyCronRequest,
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

const payload: BackupPayload = {
  createdAt: "2026-10-24T03:00:00.000Z",
  host: "test.turso.io",
  tableCount: 1,
  counts: { Product: 2 },
  mediaAssetInventory: [],
  data: {
    Product: [
      { id: "p1", name: "Rødgrød med fløde", description: "Æblegrød på ø-vis" },
      { id: "p2", name: "Smørrebrød", description: "Kaffe ☕ fra Århus" },
    ],
  },
};

/** The file part of the multipart body the Drive upload actually sent. */
function uploadedFileBytes(): number {
  const init = mocks.authorizedGoogleFetch.mock.calls[0][1] as { body: Buffer };
  const marker = Buffer.from("Content-Type: application/json\r\n\r\n");
  const start = init.body.indexOf(marker) + marker.length;
  const end = init.body.lastIndexOf(Buffer.from("\r\n--"));
  return end - start;
}

describe("Drive backup reports its size in UTF-8 bytes (DRIVE-BACKUP-BYTES)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getBrand.mockResolvedValue({ features: { googleDrive: true } });
    mocks.dumpDatabase.mockResolvedValue(payload);
    mocks.verifyCronRequest.mockReturnValue(null);
    mocks.prisma.integrationSettings.findUnique.mockResolvedValue({
      driveBackupFolderId: "backup-folder",
      driveFolderId: null,
    });
    mocks.authorizedGoogleFetch.mockResolvedValue({
      ok: true,
      response: Response.json({ id: "drive-backup-1", name: "backup.json" }),
    });
  });

  it("runDriveBackup returns the byte count of the file Drive received", async () => {
    const { runDriveBackup } = await import(
      "@/plugins/google-workspace/lib/drive-backup"
    );
    const { serializeBackup } = await import("@/lib/backup/dump");
    const json = serializeBackup(payload);

    const result = await runDriveBackup();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sent = uploadedFileBytes();
    expect(sent).toBe(Buffer.byteLength(json, "utf8"));
    // The fixture is non-ASCII on purpose: bytes and code units differ.
    expect(sent).toBeGreaterThan(json.length);
    expect(result.bytes).toBe(sent);
  });

  it("the cron route answers with the same UTF-8 byte count", async () => {
    const { GET } = await import(
      "@/plugins/google-workspace/api/drive-backup-cron"
    );

    const response = await GET(
      new Request("http://localhost/api/cron/drive-backup") as never,
    );
    const body = (await response.json()) as { backedUp: boolean; bytes: number };

    expect(body.backedUp).toBe(true);
    expect(body.bytes).toBe(uploadedFileBytes());
  });
});
