import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { put } from "@vercel/blob";
import { searchUnsplash } from "@/lib/unsplash";
import { defineTool } from "@/lib/tools/types";
import { withAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { computeSha256, findOrCreateBySha256 } from "@/lib/media/asset";
import { hasValidMagicBytes, MAGIC_BYTES_HEADER_BYTES } from "@/lib/upload/magic-bytes";
import { fetchRemoteAsset } from "@/lib/import/safe-fetch";

/**
 * Tools til billed-håndtering.
 *
 * v1: search via Unsplash. v1.1: import_from_url — lander et REMOTE billede
 * (typisk scraped fra et site af import-pipelinen) i Vercel Blob, så det kan
 * bruges som heroImage/coverImage/product-image over tool-fladen.
 */

// MIME-allowlist + størrelses-cap spejler app/api/admin/upload/route.ts — én
// kilde til sandhed for hvad der må lande i Blob (JPEG/PNG/WebP + MP4).
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_VIDEO_BYTES = 10_000_000;
const SNIFF_MIMES = ["image/jpeg", "image/png", "image/webp", "video/mp4"] as const;

/**
 * Determine the REAL media type from the file's own magic bytes — never trust
 * the remote Content-Type (it can lie, and a redirect/CDN may mislabel). Mirrors
 * the admin upload's magic-byte gate; returns null for anything not allowlisted.
 */
function sniffMime(header: Buffer): (typeof SNIFF_MIMES)[number] | null {
  for (const mime of SNIFF_MIMES) {
    if (hasValidMagicBytes(header, mime)) return mime;
  }
  return null;
}

function safeBaseName(filename: string | undefined, finalUrl: string): string {
  let fromUrl = "";
  try {
    fromUrl = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() ?? "");
  } catch {
    fromUrl = "";
  }
  const cleaned = (filename || fromUrl || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "asset";
}

const searchUnsplashInput = z.object({
  query: z
    .string()
    .min(2, "Search terms must be at least 2 characters")
    .max(100, "Search term is too long"),
  count: z.number().int().min(1).max(10).default(4),
});

export const searchUnsplashTool = defineTool({
  name: "images.search_unsplash",
  description:
    "Search product images on Unsplash (free stock photo service). Returns 4 candidates with thumbnails. The AI should call this after products.create to give the admin image choices. Best queries: 'brand model product-type' (for example 'patagonia jacket' or 'kitchenaid mixer') or 'category descriptor' (for example 'leather wallet brown'). If there are 0 hits, try a broader query.",
  scope: "catalog:read",
  input: searchUnsplashInput,
  skipAudit: true,
  handler: async (args) => {
    const candidates = await searchUnsplash(args.query, args.count);
    return candidates;
  },
});

const importFromUrlInput = z.object({
  url: z.string().url(),
  filename: z.string().max(120).optional(),
});

export const importImageFromUrl = defineTool({
  name: "images.import_from_url",
  description:
    "Fetch a remote image (or MP4) by URL and store it in this site's media storage (Vercel Blob), returning a stable URL usable as heroImage/coverImage/product image. Built for the site-import pipeline: pass a scraped asset URL and get back a Cartwright-hosted URL. Only JPEG/PNG/WebP/MP4 (verified by content, not the remote header); 5 MB image / 10 MB video cap. Re-importing the same bytes is idempotent (deduped by checksum). Private/loopback/internal URLs are refused. Requires BLOB_READ_WRITE_TOKEN.",
  scope: "settings:write",
  input: importFromUrlInput,
  examples: [
    {
      name: "Import a scraped hero image",
      body: { url: "https://example.com/img/hero.jpg", filename: "hero.jpg" },
    },
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "images.import_from_url",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => Promise.resolve(null),
      },
      async () => {
        // SSRF-guarded fetch; cap at the larger (video) ceiling, then enforce
        // the per-type cap once we know the real MIME.
        const { buffer, finalUrl } = await fetchRemoteAsset(args.url, { maxBytes: MAX_VIDEO_BYTES });

        const mime = sniffMime(buffer.subarray(0, MAGIC_BYTES_HEADER_BYTES));
        if (!mime) {
          throw new Error("Unsupported media type — only JPEG, PNG, WebP, or MP4 (verified by file content).");
        }
        const cap = mime === "video/mp4" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (buffer.byteLength > cap) {
          throw new Error(`File too large — max ${Math.round(cap / 1_000_000)} MB for ${mime === "video/mp4" ? "video" : "images"}.`);
        }

        const sha256 = computeSha256(buffer);

        // Idempotent re-import: if these exact bytes are already a MediaAsset,
        // return its URL without re-uploading. Defensive — a DB hiccup here must
        // not block a fresh upload.
        try {
          const existing = await prisma.mediaAsset.findFirst({ where: { sha256 }, select: { id: true, url: true } });
          if (existing) {
            return { url: existing.url, assetId: existing.id, mime, sizeBytes: buffer.byteLength, deduped: true };
          }
        } catch {
          // fall through to a normal upload
        }

        const pathname = `imported/${randomUUID()}-${safeBaseName(args.filename, finalUrl)}`;
        let blobUrl: string;
        try {
          const blob = await put(pathname, buffer, { access: "public", addRandomSuffix: false, contentType: mime });
          blobUrl = blob.url;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Vercel Blob error";
          throw new Error(`Upload failed: ${message}. Check BLOB_READ_WRITE_TOKEN.`);
        }

        // Dual-write to MediaAsset (dedup by sha256). Defensive: the URL is the
        // important return value, so a DB failure here doesn't fail the import.
        let assetId: string | null = null;
        try {
          const asset = await findOrCreateBySha256({
            url: blobUrl,
            mime,
            sizeBytes: buffer.byteLength,
            blobPathname: pathname,
            sha256,
            uploadedBy: ctx.actor,
          });
          assetId = asset.id;
        } catch {
          // best-effort
        }

        return { url: blobUrl, assetId, mime, sizeBytes: buffer.byteLength, deduped: false };
      },
    );
  },
});

export const imagesTools = [searchUnsplashTool, importImageFromUrl];
