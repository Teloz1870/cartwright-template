import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { brand } from "@/brand.config";
import {
  hasValidMagicBytes,
  MAGIC_BYTES_HEADER_BYTES,
} from "@/lib/upload/magic-bytes";
import {
  contactUploadPerIpLimiter,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * OFFENTLIGT (uautentificeret) kontakt-upload-endpoint. Lader en besøgende
 * vedhæfte ét billede til kontaktformularen (fx skærmbillede af en fejl).
 *
 * Et offentligt upload-endpoint er en abuse/omkostnings-flade, så det er stramt:
 * - Gated bag brand.features.contactAttachments (default-off).
 * - Rate-limited pr. IP.
 * - KUN billeder (jpeg/png/webp), ≤5 MB.
 * - Magic-bytes-validering (en .exe omdøbt til .jpg afvises).
 * - Ingen MediaAsset/audit-write (det er ikke katalog-media).
 * Kræver BLOB_READ_WRITE_TOKEN.
 */

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5_000_000;

function attachmentsEnabled(): boolean {
  return Boolean(
    (brand.features as { contactAttachments?: boolean }).contactAttachments,
  );
}

export async function POST(request: NextRequest) {
  if (!attachmentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = contactUploadPerIpLimiter.check(ip);
  if (!limit.allowed) return rateLimitResponse(limit);

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
  if (!IMAGE_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Kun billeder (JPEG, PNG, WebP) kan vedhæftes." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Billedet er for stort. Max ${Math.round(MAX_BYTES / 1_000_000)} MB.`,
      },
      { status: 400 },
    );
  }

  const header = Buffer.from(
    await file.slice(0, MAGIC_BYTES_HEADER_BYTES).arrayBuffer(),
  );
  if (!hasValidMagicBytes(header, file.type)) {
    return NextResponse.json(
      { error: "Filens indhold matcher ikke filtypen." },
      { status: 400 },
    );
  }

  const safeName = (file.name || "vedhaeftning")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .slice(0, 80);
  const pathname = `contact-uploads/${randomUUID()}-${safeName}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vercel Blob fejl";
    return NextResponse.json(
      { error: `Upload fejlede: ${message}. Tjek BLOB_READ_WRITE_TOKEN.` },
      { status: 500 },
    );
  }
}
