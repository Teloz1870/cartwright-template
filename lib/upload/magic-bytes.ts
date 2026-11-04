/**
 * Magic-byte-validering af uploaded filer. Tjekker at filen FAKTISK er det
 * MIME-type den udgiver sig for at være (klienten kan lyve om Content-Type).
 *
 * Ekstraheret fra app/api/tryon/upload/route.ts så både admin-upload (Vercel Blob)
 * og tryon-upload (ephemeral store) bruger samme validation. Forhindrer at
 * en .exe omdøbt til .jpg slipper igennem.
 *
 * Læs MAGIC_BYTES_HEADER_BYTES bytes af filen først via file.slice(0, N).arrayBuffer(),
 * derefter call hasValidMagicBytes(headerBuffer, mime).
 */

/** Antal bytes der skal læses for at validere — dækker alle understøttede MIME-typer. */
export const MAGIC_BYTES_HEADER_BYTES = 12;

export function hasValidMagicBytes(bytes: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (mime === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mime === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (mime === "video/mp4") {
    // MP4: bytes 4-7 = "ftyp" (file-type-box header)
    return (
      bytes.length >= 8 &&
      bytes.subarray(4, 8).toString("ascii") === "ftyp"
    );
  }
  return false;
}
