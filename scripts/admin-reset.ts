/**
 * Reset / recover the admin password WITHOUT wiping data.
 *
 * Use this when you're locked out, or when the password drifted from
 * `.admin-credentials` (e.g. someone changed the DB password directly with raw
 * SQL — which is exactly how the file goes stale). Unlike `prisma db seed`
 * (which wipes + reseeds the whole shop), this ONLY updates the admin user's
 * password and rewrites `.admin-credentials`, so the file and the DB always stay
 * in sync. Everything else (products, orders, settings) is untouched.
 *
 * IMPORTANT for AI agents + scripts: to change the admin password, run THIS —
 * never `UPDATE User SET passwordHash = …` directly. A raw update leaves
 * `.admin-credentials` pointing at the old password and makes login look broken.
 *
 * Usage:  pnpm admin:reset                      (generates a strong password)
 *         ADMIN_PASSWORD=YourPass pnpm admin:reset   (set a specific one)
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateStrongPassword } from "../lib/auth/password";

function cleanEnv(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw.replace(/[^\x20-\x7E]/g, "").trim();
  const unquoted = stripped.replace(/^["']|["']$/g, "");
  return unquoted || undefined;
}

/** Same backend selection as lib/db.ts: Turso → Postgres opt-in → local SQLite. */
function makeClient(): PrismaClient {
  const tursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
  const tursoToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);
  if (tursoUrl && tursoToken) {
    return new PrismaClient({ adapter: new PrismaLibSql({ url: tursoUrl, authToken: tursoToken }) });
  }
  if (cleanEnv(process.env.DATABASE_DRIVER) === "postgres") {
    const url = cleanEnv(process.env.DATABASE_URL);
    if (!url) {
      console.error("\n❌  DATABASE_DRIVER=postgres but DATABASE_URL is missing.\n");
      process.exit(1);
    }
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  const fileUrl = cleanEnv(process.env.DATABASE_URL) ?? "file:./dev.db";
  return new PrismaClient({ adapter: new PrismaLibSql({ url: fileUrl }) });
}

async function main() {
  const explicit = cleanEnv(process.env.ADMIN_PASSWORD);
  const password = explicit || generateStrongPassword();
  const prisma = makeClient();

  try {
    const admin = await prisma.user.findFirst({
      where: { role: "admin" },
      select: { id: true, email: true },
    });
    if (!admin) {
      console.error(
        "\n❌  No admin user found in the database.\n" +
          "    Create one first with `pnpm db:setup` (or `prisma db seed`).\n",
      );
      process.exit(1);
    }

    // Non-destructive: only the admin's password. mustChangePassword=false — the
    // password you reset to IS the working one (this is a deliberate reset, not a
    // one-time bootstrap), so no forced change loop on next login.
    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false },
    });

    if (explicit) {
      // You supplied the password — you already know it; don't write it to disk.
      console.log(`\n✅  Admin password reset for ${admin.email} (from ADMIN_PASSWORD).`);
      console.log("    Sign in at /account/login → Password tab. Nothing written to disk.\n");
      return;
    }

    // Generated password — show it once and persist it so the file matches the DB.
    const banner =
      "\n┌─────────────────────────────────────────────────────────────┐\n" +
      "│  ADMIN PASSWORD RESET — new login (shown once, save it now) │\n" +
      "├─────────────────────────────────────────────────────────────┤\n" +
      `│  Email:    ${admin.email}\n` +
      `│  Password: ${password}\n` +
      "│                                                             │\n" +
      "│  → Sign in at /account/login → Password tab.               │\n" +
      "│  → Also written to .admin-credentials (delete after saving).│\n" +
      "└─────────────────────────────────────────────────────────────┘\n";
    console.log(banner);

    try {
      fs.writeFileSync(
        path.join(process.cwd(), ".admin-credentials"),
        `Cartwright admin-login (reset via 'pnpm admin:reset' ${new Date().toISOString()})\n\n` +
          `Email:    ${admin.email}\n` +
          `Password: ${password}\n\n` +
          `Sign in at /account/login → Password tab. Delete this file once saved.\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      console.log("Saved to .admin-credentials (matches the DB).\n");
    } catch (err) {
      console.warn(`Could not write .admin-credentials: ${String(err)} (password is in the box above).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
