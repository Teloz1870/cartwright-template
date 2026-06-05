import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { assertEnv } from "@/lib/env-preflight";

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
 * Production-guard: i runtime-production UDEN Turso-vars kaster vi hellere end
 * at boote tavst på en ephemeral lokal SQLite-fil (data tabes ved hvert deploy
 * på serverless). Build-fasen er fritaget, og en bevidst self-host kan sætte
 * ALLOW_SQLITE_IN_PRODUCTION=1. Se DEPLOY.md §2.
 *
 * Prisma 7: driver-adapteren er nu PÅKRÆVET for alle forbindelser (den Rust-frie
 * query-compiler har ingen indbygget connection). Generatoren (`prisma-client`)
 * outputter til app/generated/prisma; CLI-forbindelsen ligger i prisma.config.ts.
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
    // PrismaLibSql accepterer libsql Config direkte (url + authToken).
    const adapter = new PrismaLibSql({ url: tursoUrl, authToken: tursoToken });
    return new PrismaClient({ adapter });
  }

  // Production-guard: nægt at boote på en ephemeral lokal SQLite-fil. På
  // Vercel/serverless er filsystemet read-only/flygtigt — data tabes ved hvert
  // deploy og deles ikke på tværs af instanser. Vi fanger det HÅRDT her, så en
  // fork ikke kommer til at sende rigtige kunder ind på en fil-DB.
  const isProd = process.env.NODE_ENV === "production";
  // Next sætter NEXT_PHASE under `next build` — client'en instantieres ved
  // modul-load fra routes, så build skal eksplicit fritages (ellers fejler et
  // lokalt `pnpm build` uden Turso-vars).
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  if (!isBuildPhase) {
    assertEnv();
  }

  if (isProd && !isBuildPhase) {
    const msg =
      "[Cartwright] Production uden TURSO_DATABASE_URL/TURSO_AUTH_TOKEN. " +
      "Appen nægter at starte på en ephemeral lokal SQLite-fil — data tabes ved " +
      "hvert deploy og kan ikke skaleres. Sæt Turso-vars (se DEPLOY.md §2). " +
      "Self-hoster du bevidst på et persistent volume, sæt ALLOW_SQLITE_IN_PRODUCTION=1.";
    if (process.env.ALLOW_SQLITE_IN_PRODUCTION !== "1") {
      throw new Error(msg);
    }
    console.warn(
      msg + " (ALLOW_SQLITE_IN_PRODUCTION=1 sat — fortsætter på lokal SQLite.)"
    );
  }

  // Lokal SQLite-fil (dev-only fallback). Prisma 7's Rust-frie client kræver
  // en driver-adapter for ALLE forbindelser — også lokalt — så vi kan ikke
  // længere lave en bar `new PrismaClient()`. libSQL-adapteren forbinder til en
  // lokal fil via `file:`-URL (samme @libsql/client som Turso bruger).
  const fileUrl = cleanEnv(process.env.DATABASE_URL) ?? "file:./dev.db";
  const adapter = new PrismaLibSql({ url: fileUrl });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
