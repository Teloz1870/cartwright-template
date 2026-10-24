import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { createClient, type Client, type InValue } from "@libsql/client";

/**
 * REG-EMAIL-CASE: `Foo@x.dk` and `foo@x.dk` are one customer. Sign-up saves
 * the address lowercased; sign-up and login find an account whatever case is
 * typed — including a row an earlier engine saved in the case it was typed,
 * which is what every live shop holds.
 *
 * The real registerUser and the real lib/auth.ts `authorize` run against a real
 * SQLite `User` table (libSQL, in memory): Prisma's `$queryRaw` is handed to
 * libSQL as the parameterised statement it is, so the SQL in
 * lib/auth/account-email.ts runs as written, against TEXT compared the way
 * SQLite compares it (case-sensitively) and the unique index Prisma creates.
 * NextAuth itself is a stub that hands back the config, so `authorize` can be
 * called directly.
 */

const mocks = vi.hoisted(() => ({
  db: null as null | Client,
  config: null as null | { providers: Array<Record<string, unknown>> },
}));

/** `model User`'s columns these paths read, as Prisma's SQLite DDL has them. */
const USER_DDL = `
  CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'customer'
  );
  CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
`;

vi.mock("@/lib/db", () => ({
  prisma: {
    // A tagged template: the statement's text with `?` for every value.
    $queryRaw: async (strings: TemplateStringsArray, ...values: InValue[]) => {
      const result = await mocks.db!.execute({ sql: strings.join("?"), args: values });
      return result.rows.map((row) =>
        Object.fromEntries(result.columns.map((column, i) => [column, row[i]])),
      );
    },
    user: {
      create: async ({ data }: { data: Record<string, string> }) => {
        const id = `u${Date.now()}${Math.random().toString(36).slice(2)}`;
        try {
          await mocks.db!.execute({
            sql: 'INSERT INTO "User" ("id", "email", "passwordHash", "name", "role") VALUES (?, ?, ?, ?, ?)',
            args: [id, data.email, data.passwordHash, data.name, data.role],
          });
        } catch (err) {
          // What Prisma turns SQLite's unique-index failure into.
          if (/UNIQUE/i.test(String(err))) {
            throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
          }
          throw err;
        }
        return { id, ...data };
      },
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: vi.fn(async () => undefined),
  MARKETING_EVENTS: { userCreated: "user.created" },
}));
vi.mock("@/lib/mailer", () => ({ sendMagicLinkEmail: vi.fn() }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("next-auth", () => ({
  default: (config: { providers: Array<Record<string, unknown>> }) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: Record<string, unknown>) => ({ id: "credentials", ...options }),
}));

import { registerUser } from "@/app/[locale]/account/actions";
import "@/lib/auth";
import { loginPerEmailLimiter, loginPerIpLimiter, registerPerIpLimiter } from "@/lib/rate-limit";
import { REGISTER_ELAPSED_FIELD, REGISTER_MIN_FILL_MS } from "@/lib/auth/register-guard";

const PASSWORD = "correct-horse";

function signUp(email: string): Promise<{ ok: boolean }> {
  const fd = new FormData();
  fd.set("name", "Ada Lovelace");
  fd.set("email", email);
  fd.set("password", PASSWORD);
  fd.set(REGISTER_ELAPSED_FIELD, String(REGISTER_MIN_FILL_MS + 1500));
  return registerUser(fd);
}

function logIn(email: string, password = PASSWORD): Promise<{ id: string } | null> {
  const credentials = mocks.config!.providers.find((p) => p.id === "credentials") as {
    authorize: (c: Record<string, string>, req: Request) => Promise<{ id: string } | null>;
  };
  return credentials.authorize({ email, password }, new Request("https://shop.test/api/auth"));
}

/** A row as an earlier engine saved it: the address in the case it was typed. */
async function seed(id: string, email: string, password = PASSWORD): Promise<void> {
  await mocks.db!.execute({
    sql: 'INSERT INTO "User" ("id", "email", "passwordHash") VALUES (?, ?, ?)',
    args: [id, email, bcrypt.hashSync(password, 4)],
  });
}

/** What a magic link leaves behind for a capitalised row: a lowercased account with no password. */
async function seedMagicLinkOnly(id: string, email: string): Promise<void> {
  await mocks.db!.execute({
    sql: 'INSERT INTO "User" ("id", "email") VALUES (?, ?)',
    args: [id, email],
  });
}

async function rows(): Promise<Array<{ id: string; email: string }>> {
  const result = await mocks.db!.execute('SELECT "id", "email" FROM "User" ORDER BY "email"');
  return result.rows.map((row) => ({ id: String(row[0]), email: String(row[1]) }));
}

beforeEach(async () => {
  mocks.db = createClient({ url: ":memory:" });
  await mocks.db.executeMultiple(USER_DDL);
  registerPerIpLimiter.reset();
  loginPerEmailLimiter.reset();
  loginPerIpLimiter.reset();
});

describe("the table these tests run on", () => {
  it("compares an address case-sensitively, as a live shop's SQLite does", async () => {
    await seed("legacy", "Ada@Example.com");
    await seed("other", "ada@example.com");
    expect((await rows()).map((r) => r.id)).toEqual(["legacy", "other"]);
  });
});

describe("sign-up — one spelling of an address", () => {
  it("saves the address lowercased, whatever case it was typed in", async () => {
    expect(await signUp("Ada.Lovelace@Example.COM")).toEqual({ ok: true });
    expect((await rows()).map((r) => r.email)).toEqual(["ada.lovelace@example.com"]);
  });

  it("a second sign-up that differs only in case makes no second account", async () => {
    await signUp("ada@example.com");
    expect(await signUp("ADA@Example.com")).toEqual({ ok: true });
    expect(await rows()).toHaveLength(1);
  });

  it("an address saved in its own case before the fix counts as taken by the same spelling", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await signUp("Ada@Example.com")).toEqual({ ok: true });
    expect((await rows()).map((r) => r.id)).toEqual(["legacy"]);
  });

  it("…and by any other spelling, so a live shop's customer gets no second account", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await signUp("ada@example.com")).toEqual({ ok: true });
    expect(await signUp("ADA@EXAMPLE.COM")).toEqual({ ok: true });
    expect(await rows()).toEqual([{ id: "legacy", email: "Ada@Example.com" }]);
  });
});

describe("login — the same spelling", () => {
  it("an account saved lowercased signs in with the address typed in any case", async () => {
    await signUp("ada@example.com");
    expect(await logIn("Ada@Example.COM")).toMatchObject({ email: "ada@example.com" });
  });

  it("an account saved in its own case before the fix still signs in as typed", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await logIn("Ada@Example.com")).toMatchObject({ id: "legacy" });
  });

  it("…and signs in with the address typed in another case", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await logIn("ada@example.com")).toMatchObject({ id: "legacy", email: "Ada@Example.com" });
    expect(await logIn("ADA@EXAMPLE.COM")).toMatchObject({ id: "legacy" });
  });

  it("a row with a capital SQLite cannot fold still signs in spelled the way it was saved", async () => {
    // SQLite's lower() folds ASCII only: lower('JÖRG@Example.com') is
    // 'jÖrg@example.com', never the lowercased address.
    await seed("legacy", "JÖRG@Example.com");
    expect(await logIn("JÖRG@Example.com")).toMatchObject({ id: "legacy" });
  });

  it("the spaces a paste or an autofill leaves around the address do not matter", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await logIn("  ada@example.com\t")).toMatchObject({ id: "legacy" });
  });

  it("a wrong password is still refused", async () => {
    await signUp("ada@example.com");
    expect(await logIn("ADA@example.com", "not-the-password")).toBeNull();
  });
});

describe("login — an address saved in more than one case", () => {
  it("the spelling typed exactly is the account signed in", async () => {
    await seed("lower", "ada@example.com", "password-of-lower");
    await seed("legacy", "Ada@Example.com", "password-of-legacy");
    expect(await logIn("Ada@Example.com", "password-of-legacy")).toMatchObject({ id: "legacy" });
    expect(await logIn("ada@example.com", "password-of-lower")).toMatchObject({ id: "lower" });
  });

  it("…also with spaces around it", async () => {
    await seed("lower", "ada@example.com", "password-of-lower");
    await seed("legacy", "Ada@Example.com", "password-of-legacy");
    expect(await logIn(" Ada@Example.com ", "password-of-legacy")).toMatchObject({ id: "legacy" });
  });

  it("a magic-link account with no password does not stand in front of the one that has one", async () => {
    await seed("legacy", "Ada@Example.com");
    await seedMagicLinkOnly("magic", "ada@example.com");
    expect(await logIn("ada@example.com")).toMatchObject({ id: "legacy" });
    expect(await logIn("ADA@EXAMPLE.COM")).toMatchObject({ id: "legacy" });
  });

  it("a spelling that is none of them is refused rather than guessed, even with one account's password", async () => {
    await seed("first", "Ada@Example.com", "password-of-first");
    await seed("second", "ADA@example.com", "password-of-second");
    expect(await logIn("ada@example.com", "password-of-first")).toBeNull();
    expect(await logIn("ada@EXAMPLE.com", "password-of-second")).toBeNull();
    // Each still signs in by the spelling it was saved under.
    expect(await logIn("ADA@example.com", "password-of-second")).toMatchObject({ id: "second" });
  });
});
