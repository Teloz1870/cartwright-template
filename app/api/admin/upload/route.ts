import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  hasValidMagicBytes,
  MAGIC_BYTES_HEADER_BYTES,
} from "@/lib/upload/magic-bytes";

export const runtime = "nodejs";

/**
 * Admin-only file-upload endpoint. Uploader til Vercel Blob storage og
 * returnerer en CDN-URL der kan bruges som heroImage/heroVideo/product-image.
 *
 * Validation:
 * - Admin-auth via requireAdmin() (kaster hvis ikke admin)
 * - MIME-allowlist: jpeg/png/webp (images) + mp4 (videos)
 * - Size-cap: 5 MB images, 10 MB videos
 * - Magic-bytes (forhindrer .exe som .jpg) — genbrugt fra lib/upload/magic-bytes.ts
 *
 * Kræver BLOB_READ_WRITE_TOKEN env-var (set via `vercel blob` CLI).
 */

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME = new Set(["video/mp4"]);
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_VIDEO_BYTES = 10_000_000;

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  const ip = request.headers.get("x-forwarded-for") ?? null;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ugyldigt upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Mangler fil." }, { status: 400 });
  }

  const isImage = IMAGE_MIME.has(file.type);
  const isVideo = VIDEO_MIME.has(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "Filtype skal være JPEG, PNG, WebP eller MP4." },
      { status: 400 },
    );
  }

  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error: `Fil for stor. Max ${Math.round(maxBytes / 1_000_000)} MB for ${isImage ? "billeder" : "videoer"}.`,
      },
      { status: 400 },
    );
  }

  // Magic-byte-validation — forhindrer at en .exe omdøbt til .jpg slipper igennem
  const header = Buffer.from(
    await file.slice(0, MAGIC_BYTES_HEADER_BYTES).arrayBuffer(),
  );
  if (!hasValidMagicBytes(header, file.type)) {
    return NextResponse.json(
      { error: "Filens indhold matcher ikke filtypen." },
      { status: 400 },
    );
  }

  // Generer unique pathname så vi ikke overskriver eksisterende filer.
  // Format: admin-uploads/<uuid>-<original-navn> — gør debugging nemmere.
  const safeName = (file.name || "upload")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .slice(0, 80);
  const pathname = `admin-uploads/${randomUUID()}-${safeName}`;

  let url: string;
  try {
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
    });
    url = blob.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vercel Blob fejl";
    return NextResponse.json(
      { error: `Upload fejlede: ${message}. Tjek BLOB_READ_WRITE_TOKEN i Vercel env.` },
      { status: 500 },
    );
  }

  // Audit-log uploaden — sporbarhed for hvem der har uploadet hvad
  await prisma.auditLog.create({
    data: {
      actor: `admin:${session.user?.email ?? "unknown"}`,
      tool: "admin.upload",
      argsJson: JSON.stringify({
        mime: file.type,
        sizeBytes: file.size,
        url,
      }),
      ok: true,
      errorMsg: null,
      requestId: randomUUID(),
      ip,
      userAgent: request.headers.get("user-agent") ?? null,
    },
  });

  return NextResponse.json({ url, mime: file.type, sizeBytes: file.size });
}
