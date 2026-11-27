import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * images.import_from_url handler — mocked network/blob/DB layer, but the REAL
 * magic-byte sniff (we hand it real JPEG header bytes). The SSRF guard itself is
 * covered separately in safe-fetch.test.ts.
 */

const mocks = vi.hoisted(() => ({
  fetchRemoteAsset: vi.fn(),
  put: vi.fn(),
  prisma: { mediaAsset: { findFirst: vi.fn() } },
  computeSha256: vi.fn(() => "sha-deadbeef"),
  findOrCreateBySha256: vi.fn(),
  withAudit: vi.fn(),
}));

vi.mock("@/lib/import/safe-fetch", () => ({ fetchRemoteAsset: mocks.fetchRemoteAsset }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/media/asset", () => ({
  computeSha256: mocks.computeSha256,
  findOrCreateBySha256: mocks.findOrCreateBySha256,
}));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const ctx = { actor: "test", ip: null, userAgent: null } as never;

// 12+ bytes starting with the JPEG magic (FF D8 FF) → sniffs as image/jpeg.
function jpeg(sizeBytes = 32): Buffer {
  const b = Buffer.alloc(sizeBytes);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0;
  return b;
}

beforeEach(() => {
  vi.resetModules();
  Object.values(mocks).forEach((m) => {
    if (typeof m === "function" && "mockReset" in m) (m as { mockReset: () => void }).mockReset();
  });
  mocks.prisma.mediaAsset.findFirst.mockReset();
  mocks.computeSha256.mockReturnValue("sha-deadbeef");
  mocks.withAudit.mockImplementation(async (_meta: unknown, fn: () => Promise<unknown>) => fn());
});

describe("images.import_from_url", () => {
  it("fetches, sniffs JPEG, uploads to Blob, dual-writes MediaAsset, returns the blob URL", async () => {
    mocks.fetchRemoteAsset.mockResolvedValue({ buffer: jpeg(), finalUrl: "https://example.com/hero.jpg", contentType: "image/jpeg" });
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue(null); // not yet imported
    mocks.put.mockResolvedValue({ url: "https://blob.store/imported/uuid-hero.jpg" });
    mocks.findOrCreateBySha256.mockResolvedValue({ id: "asset-1" });

    const { importImageFromUrl } = await import("@/lib/tools/images");
    const r = (await importImageFromUrl.handler({ url: "https://example.com/hero.jpg" }, ctx)) as {
      url: string;
      assetId: string;
      mime: string;
      deduped: boolean;
    };

    expect(r).toEqual({ url: "https://blob.store/imported/uuid-hero.jpg", assetId: "asset-1", mime: "image/jpeg", sizeBytes: 32, deduped: false });
    expect(mocks.put).toHaveBeenCalledTimes(1);
    // Blob is stored under imported/ and tagged with the sniffed (not remote) mime.
    const [pathname, , putOpts] = mocks.put.mock.calls[0];
    expect(pathname).toMatch(/^imported\/.*hero\.jpg$/);
    expect((putOpts as { contentType: string }).contentType).toBe("image/jpeg");
  });

  it("is idempotent — identical bytes already imported → returns the existing URL, no re-upload", async () => {
    mocks.fetchRemoteAsset.mockResolvedValue({ buffer: jpeg(), finalUrl: "https://example.com/hero.jpg", contentType: "image/jpeg" });
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue({ id: "existing", url: "https://blob.store/old.jpg" });

    const { importImageFromUrl } = await import("@/lib/tools/images");
    const r = (await importImageFromUrl.handler({ url: "https://example.com/hero.jpg" }, ctx)) as { url: string; assetId: string; deduped: boolean };

    expect(r).toEqual({ url: "https://blob.store/old.jpg", assetId: "existing", mime: "image/jpeg", sizeBytes: 32, deduped: true });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rejects content whose magic bytes are not an allowed type (the remote Content-Type is irrelevant)", async () => {
    // 'GIF89a…' — a real GIF, but GIF is NOT allowlisted; remote may even claim image/jpeg.
    const gif = Buffer.from("GIF89a" + "\0".repeat(20), "binary");
    mocks.fetchRemoteAsset.mockResolvedValue({ buffer: gif, finalUrl: "https://example.com/x.gif", contentType: "image/jpeg" });

    const { importImageFromUrl } = await import("@/lib/tools/images");
    await expect(importImageFromUrl.handler({ url: "https://example.com/x.gif" }, ctx)).rejects.toThrow(/Unsupported media type/);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rejects an image over the 5 MB image cap", async () => {
    mocks.fetchRemoteAsset.mockResolvedValue({ buffer: jpeg(5_000_001), finalUrl: "https://example.com/big.jpg", contentType: "image/jpeg" });
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue(null);

    const { importImageFromUrl } = await import("@/lib/tools/images");
    await expect(importImageFromUrl.handler({ url: "https://example.com/big.jpg" }, ctx)).rejects.toThrow(/too large/i);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("surfaces a clear error (mentioning the token) when Blob upload fails", async () => {
    mocks.fetchRemoteAsset.mockResolvedValue({ buffer: jpeg(), finalUrl: "https://example.com/hero.jpg", contentType: "image/jpeg" });
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue(null);
    mocks.put.mockRejectedValue(new Error("No token found"));

    const { importImageFromUrl } = await import("@/lib/tools/images");
    await expect(importImageFromUrl.handler({ url: "https://example.com/hero.jpg" }, ctx)).rejects.toThrow(/Upload failed.*BLOB_READ_WRITE_TOKEN/);
  });

  it("still returns the blob URL when the MediaAsset dual-write fails (best-effort)", async () => {
    mocks.fetchRemoteAsset.mockResolvedValue({ buffer: jpeg(), finalUrl: "https://example.com/hero.jpg", contentType: "image/jpeg" });
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue(null);
    mocks.put.mockResolvedValue({ url: "https://blob.store/imported/uuid-hero.jpg" });
    mocks.findOrCreateBySha256.mockRejectedValue(new Error("db down"));

    const { importImageFromUrl } = await import("@/lib/tools/images");
    const r = (await importImageFromUrl.handler({ url: "https://example.com/hero.jpg" }, ctx)) as { url: string; assetId: string | null };
    expect(r.url).toBe("https://blob.store/imported/uuid-hero.jpg");
    expect(r.assetId).toBeNull();
  });
});
