import "server-only";

import { randomUUID } from "node:crypto";
import { authorizedGoogleFetch } from "@/plugins/google-workspace/lib/google/client";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string | null;
  size: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
};

export type DriveResult<T> = ({ ok: true } & T) | { ok: false; error: string };

type GoogleDriveFilePayload = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  size?: unknown;
  modifiedTime?: unknown;
  webViewLink?: unknown;
};

function normalizeDriveFile(raw: GoogleDriveFilePayload): DriveFile | null {
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  return {
    id: raw.id,
    name: raw.name,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : null,
    size: typeof raw.size === "string" ? raw.size : null,
    modifiedTime:
      typeof raw.modifiedTime === "string" ? raw.modifiedTime : null,
    webViewLink: typeof raw.webViewLink === "string" ? raw.webViewLink : null,
  };
}

function connectorError(
  result: Extract<
    Awaited<ReturnType<typeof authorizedGoogleFetch>>,
    { ok: false }
  >,
): string {
  return result.error.message;
}

async function jsonError(response: Response): Promise<string | null> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: unknown } }
    | null;
  return typeof payload?.error?.message === "string"
    ? payload.error.message
    : null;
}

export async function listDriveFilesInFolder(
  folderId: string,
  options: { pageSize?: number; pageToken?: string | null } = {},
): Promise<DriveResult<{ files: DriveFile[]; nextPageToken: string | null }>> {
  const trimmed = folderId.trim();
  if (!trimmed) return { ok: false, error: "Google Drive folder id is missing." };

  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("pageSize", String(options.pageSize ?? 100));
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)",
  );
  url.searchParams.set(
    "q",
    `'${trimmed.replace(/'/g, "\\'")}' in parents and trashed = false`,
  );
  url.searchParams.set("orderBy", "modifiedTime desc,name");
  if (options.pageToken) url.searchParams.set("pageToken", options.pageToken);

  let result: Awaited<ReturnType<typeof authorizedGoogleFetch>>;
  try {
    result = await authorizedGoogleFetch(url);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Google Drive list failed.",
    };
  }
  if (!result.ok) return { ok: false, error: connectorError(result) };
  if (!result.response.ok) {
    return {
      ok: false,
      error:
        (await jsonError(result.response)) ??
        `Google Drive list failed with status ${result.response.status}.`,
    };
  }

  const payload = (await result.response.json().catch(() => null)) as
    | { files?: unknown; nextPageToken?: unknown }
    | null;
  const files = Array.isArray(payload?.files)
    ? payload.files
        .map((file) => normalizeDriveFile(file as GoogleDriveFilePayload))
        .filter((file): file is DriveFile => file != null)
    : [];
  return {
    ok: true,
    files,
    nextPageToken:
      typeof payload?.nextPageToken === "string" ? payload.nextPageToken : null,
  };
}

export async function downloadDriveFileBytes(
  fileId: string,
): Promise<DriveResult<{ bytes: Buffer; mime: string | null }>> {
  const trimmed = fileId.trim();
  if (!trimmed) return { ok: false, error: "Google Drive file id is missing." };

  let result: Awaited<ReturnType<typeof authorizedGoogleFetch>>;
  try {
    result = await authorizedGoogleFetch(
      `${DRIVE_API}/files/${encodeURIComponent(trimmed)}?alt=media`,
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Google Drive download failed.",
    };
  }
  if (!result.ok) return { ok: false, error: connectorError(result) };
  if (!result.response.ok) {
    return {
      ok: false,
      error:
        (await jsonError(result.response)) ??
        `Google Drive download failed with status ${result.response.status}.`,
    };
  }

  const bytes = Buffer.from(await result.response.arrayBuffer());
  return {
    ok: true,
    bytes,
    mime: result.response.headers.get("content-type"),
  };
}

export async function uploadDriveFile(args: {
  name: string;
  mime: string;
  bytes: Buffer | Uint8Array | string;
  folderId?: string | null;
}): Promise<DriveResult<{ file: { id: string; name: string } }>> {
  const name = args.name.trim();
  if (!name) return { ok: false, error: "Google Drive filename is missing." };

  const boundary = `cartwright-${randomUUID()}`;
  const metadata: { name: string; parents?: string[] } = { name };
  const folderId = args.folderId?.trim();
  if (folderId) metadata.parents = [folderId];

  const bytes = Buffer.isBuffer(args.bytes)
    ? args.bytes
    : typeof args.bytes === "string"
      ? Buffer.from(args.bytes)
      : Buffer.from(args.bytes);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${args.mime}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  let result: Awaited<ReturnType<typeof authorizedGoogleFetch>>;
  try {
    result = await authorizedGoogleFetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Google Drive upload failed.",
    };
  }
  if (!result.ok) return { ok: false, error: connectorError(result) };
  if (!result.response.ok) {
    return {
      ok: false,
      error:
        (await jsonError(result.response)) ??
        `Google Drive upload failed with status ${result.response.status}.`,
    };
  }

  const payload = (await result.response.json().catch(() => null)) as
    | { id?: unknown; name?: unknown }
    | null;
  if (typeof payload?.id !== "string" || typeof payload.name !== "string") {
    return { ok: false, error: "Google Drive upload response was malformed." };
  }
  return { ok: true, file: { id: payload.id, name: payload.name } };
}
