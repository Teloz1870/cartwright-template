/**
 * Create or recover the admin login WITHOUT wiping data.
 *
 * Two modes, one script, because they share every piece of plumbing (backend
 * selection, password generation, the credentials file) and differ only in
 * whether an admin is supposed to exist yet:
 *
 *   pnpm admin:reset    an admin exists; give it a new password
 *   pnpm admin:create   no admin exists; make the first one
 *
 * `admin:create` is what makes a production database reachable. `prisma db seed`
 * used to be the only way to get an admin, and it clears ten tables to do it —
 * so since lib/seed-guard.ts it refuses on any database holding someone's work.
 * That is correct, and it would leave a real deployment with no route to a first
 * login. This is that route: one INSERT, nothing deleted, nothing overwritten.
 *
 * Each mode refuses the other's situation rather than guessing. Creating when an
 * admin already exists would either duplicate an account or silently reset a
 * password nobody asked about; resetting when none exists cannot work at all.
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
 * Usage:  pnpm admin:reset                       (generates a strong password)
 *         ADMIN_PASSWORD=YourPass pnpm admin:reset    (set a specific one)
 *         pnpm admin:create                       (first admin, brand.emails.admin)
 *         ADMIN_EMAIL=you@shop.dk pnpm admin:create   (a different address)
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateStrongPassword } from "../lib/auth/password";
import { brand } from "../brand.config";

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

/**
 * Write the generated password where the operator can find it after the
 * scrollback is gone. Shared by both modes so the file always matches the DB —
 * the drift this whole script exists to prevent.
 */
function persistCredentials(email: string, password: string, how: string): void {
  try {
    fs.writeFileSync(
      path.join(process.cwd(), ".admin-credentials"),
      `Cartwright admin-login (${how} ${new Date().toISOString()})\n\n` +
        `Email:    ${email}\n` +
        `Password: ${password}\n\n` +
        `Sign in at /account/login → Password tab. Delete this file once saved.\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    console.log("Saved to .admin-credentials (matches the DB).\n");
  } catch (err) {
    console.warn(
      `Could not write .admin-credentials: ${String(err)} (password is in the box above).`,
    );
  }
}

/**
 * `pnpm admin:create` — the first admin on a database the seed will not touch.
 *
 * One INSERT. It never updates an existing row: if an admin is already there,
 * creating another would either duplicate the account or quietly reset a
 * password nobody asked about, so it stops and names the other mode.
 *
 * A generated password lands with `mustChangePassword: true`, matching the seed
 * — a password that has been printed to a terminal and written to a file is a
 * bootstrap credential, not the owner's password.
 */
async function createAdmin(prisma: PrismaClient, password: string, explicit: boolean) {
  const email = cleanEnv(process.env.ADMIN_EMAIL) ?? brand.emails.admin;

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { email: true },
  });
  if (existingAdmin) {
    console.error(
      `\n❌  An admin already exists (${existingAdmin.email}).\n` +
        "    This command only creates the FIRST one — it will not touch an\n" +
        "    existing account. To change that admin's password instead, run:\n\n" +
        "        pnpm admin:reset\n",
    );
    process.exit(1);
  }

  const clash = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });
  if (clash) {
    console.error(
      `\n❌  ${email} already exists as a ${clash.role} account.\n` +
        "    Refusing to promote it — a customer account silently becoming an\n" +
        "    admin is not something a script should decide. Use ADMIN_EMAIL to\n" +
        "    pick a different address, or change the role deliberately in the DB.\n",
    );
    process.exit(1);
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name: "Administrator",
      role: "admin",
      mustChangePassword: !explicit,
    },
  });

  if (explicit) {
    console.log(`\n✅  Admin created: ${email} (password from ADMIN_PASSWORD).`);
    console.log("    Sign in at /account/login → Password tab. Nothing written to disk.\n");
    return;
  }

  console.log(
    "\n┌─────────────────────────────────────────────────────────────┐\n" +
      "│  ADMIN CREATED — first login (shown once, save it now)      │\n" +
      "├─────────────────────────────────────────────────────────────┤\n" +
      `│  Email:    ${email}\n` +
      `│  Password: ${password}\n` +
      "│                                                             │\n" +
      "│  → Sign in at /account/login → Password tab.               │\n" +
      "│  → You will be asked to choose your own password.          │\n" +
      "│  → Also written to .admin-credentials (delete after saving).│\n" +
      "└─────────────────────────────────────────────────────────────┘\n",
  );
  persistCredentials(email, password, "created via 'pnpm admin:create'");
}

async function main() {
  const explicit = cleanEnv(process.env.ADMIN_PASSWORD);
  const password = explicit || generateStrongPassword();
  const create = process.argv.includes("--create");
  const prisma = makeClient();

  try {
    if (create) {
      await createAdmin(prisma, password, Boolean(explicit));
      return;
    }

    const admin = await prisma.user.findFirst({
      where: { role: "admin" },
      select: { id: true, email: true },
    });
    if (!admin) {
      console.error(
        "\n❌  No admin user found in the database.\n" +
          "    Create one with `pnpm admin:create` — it adds the first admin\n" +
          "    without touching any other data. (`pnpm db:setup` also works on\n" +
          "    a fresh database; `prisma db seed` refuses once a database holds\n" +
          "    someone's work — see lib/seed-guard.ts.)\n",
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

    persistCredentials(admin.email, password, "reset via 'pnpm admin:reset'");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
