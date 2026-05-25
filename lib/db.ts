import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/**
 * Prisma client med Turso (libSQL) adapter for production.
 *
 * Fallback-strategi:
 * - TURSO_DATABASE_URL sat → brug Turso (production + dev hvis du vil teste)
 * - Ellers → fallback til lokal SQLite-fil via DATABASE_URL (sædvanlig dev)
 *
 * Dette muliggør:
 * - Vercel deploy uden filsystem-issues (SQLite virker ikke i serverless)
 * - Lokal udvikling med snappy SQLite-fil (ingen netværks-roundtrip)
 * - Lokal test mod Turso ved at sætte TURSO_* i .env.local
 *
 * driverAdapters preview-feature kræves i schema.prisma generator-block.
 */

/**
 * Aggressivt rens env-værdier for invisible chars der gør HTTP-headers
 * ugyldige. Vercel UI har vist sig at tillade nul-width spaces, zero-width
 * joiners osv. via clipboard. Headers.set kaster TypeError hvis nogen kommer
 * gennem. Strip alt der ikke er printable ASCII (0x20-0x7E) + omkringliggende
 * quotes (env-format ".env" parsers preserver dem nogle gange).
 */
function cleanEnv(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw
    .replace(/[^\x20-\x7E]/g, "") // kun printable ASCII
    .trim();
  // Strip surrounding quotes hvis tilstede (sometimes from .env-parser)
  const unquoted = stripped.replace(/^["']|["']$/g, "");
  return unquoted || undefined;
}

function makePrismaClient(): PrismaClient {
  const tursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
  const tursoToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);

  if (tursoUrl && tursoToken) {
    // v6 API: PrismaLibSQL accepterer libsql Config direkte (url + authToken)
    const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken });
    return new PrismaClient({ adapter });
  }

  // Lokal SQLite-fil (dev-only fallback)
  return new PrismaClient();
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
