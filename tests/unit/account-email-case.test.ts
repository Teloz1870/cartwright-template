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
  /** How many times the case-insensitive statement read the table through. */
  scans: 0,
  /** How many times a row was looked up by its exact spelling (`user.findUnique`). */
  exactReads: 0,
  /** The user each password-reset token was issued for. */
  resetFor: [] as string[],
  resetMails: [] as string[],
  afterCallbacks: [] as Array<() => unknown>,
}));

/** The row spelled exactly `email`, as the unique index finds it. */
async function exactRow(email: string): Promise<Record<string, unknown> | null> {
  const result = await mocks.db!.execute({
    sql: 'SELECT "id", "email", "name", "role", "passwordHash" FROM "User" WHERE "email" = ?',
    args: [email],
  });
  const row = result.rows[0];
  return row ? Object.fromEntries(result.columns.map((column, i) => [column, row[i]])) : null;
}

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
      mocks.scans += 1;
      const result = await mocks.db!.execute({ sql: strings.join("?"), args: values });
      return result.rows.map((row) =>
        Object.fromEntries(result.columns.map((column, i) => [column, row[i]])),
      );
    },
    passwordResetToken: {
      create: async ({ data }: { data: { userId: string } }) => {
        mocks.resetFor.push(data.userId);
        return data;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        mocks.exactReads += 1;
        return exactRow(where.email);
      },
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
// The forgot-password action schedules the reset with `after()`; collected here
// and run by `flushAfter`, as the response would.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    mocks.afterCallbacks.push(cb);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: vi.fn(async () => undefined),
  MARKETING_EVENTS: { userCreated: "user.created" },
}));
vi.mock("@/lib/mailer", () => ({
  sendMagicLinkEmail: vi.fn(),
  sendPasswordResetEmail: async ({ email }: { email: string }) => {
    mocks.resetMails.push(email);
  },
}));
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
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { requestPasswordResetAction } from "@/app/[locale]/account/forgot-password/actions";
import { accountForAddress, type AccountRow } from "@/lib/auth/account-email";
import {
  loginPerEmailLimiter,
  loginPerIpLimiter,
  passwordResetPerEmailLimiter,
  passwordResetPerIpLimiter,
  registerPerIpLimiter,
} from "@/lib/rate-limit";
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
  process.env.AUTH_SECRET = "test-secret-for-reset";
  mocks.scans = 0;
  mocks.exactReads = 0;
  mocks.resetFor = [];
  mocks.resetMails = [];
  mocks.afterCallbacks = [];
  passwordResetPerEmailLimiter.reset();
  passwordResetPerIpLimiter.reset();
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

/**
 * The account the reset issued since `tokens`/`mails` counted a token for, or
 * null when it issued none. At most one per reset, and every one is mailed to
 * the address that account holds — never the spelling typed — so each case
 * below also pins where the link went.
 */
async function issuedSince(tokens: number, mails: number): Promise<string | null> {
  const issued = mocks.resetFor.slice(tokens);
  const mailed = mocks.resetMails.slice(mails);
  expect(issued.length).toBeLessThanOrEqual(1);
  expect(mailed).toHaveLength(issued.length);
  if (issued.length === 0) return null;
  const stored = await mocks.db!.execute({ sql: 'SELECT "email" FROM "User" WHERE "id" = ?', args: [issued[0]] });
  expect(mailed[0]).toBe(String(stored.rows[0][0]));
  return issued[0];
}

/** The account THIS password reset for `email` issues a token for, or null when it sends none. */
async function resetAccount(email: string): Promise<string | null> {
  const [tokens, mails] = [mocks.resetFor.length, mocks.resetMails.length];
  await requestPasswordReset(email);
  return issuedSince(tokens, mails);
}

describe("password reset — the same account, whatever case it was saved in (REG-EMAIL-CASE-b)", () => {
  it("an account saved in its own case before the fix gets the link when the address is typed lowercased", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await resetAccount("ada@example.com")).toBe("legacy");
    // To the address the account holds, not the spelling typed.
    expect(mocks.resetMails).toEqual(["Ada@Example.com"]);
  });

  it("an account saved lowercased gets it typed in any case, with one read of the accounts each time", async () => {
    await signUp("ada@example.com");
    const [{ id }] = await rows();
    mocks.scans = 0;
    mocks.exactReads = 0;
    expect(await resetAccount("ADA@Example.COM")).toBe(id);
    expect(await resetAccount("ada@example.com")).toBe(id);
    expect(await resetAccount("grace@example.com")).toBeNull();
    expect(mocks.resetFor).toEqual([id, id]);
    // One read each, and no second lookup by the exact spelling beside it.
    expect(mocks.scans).toBe(3);
    expect(mocks.exactReads).toBe(0);
  });

  it("resets the account login signs in to: the spelling typed exactly, then the one with a password", async () => {
    await seed("legacy", "Ada@Example.com");
    await seedMagicLinkOnly("magic", "ada@example.com");
    expect(await resetAccount("Ada@Example.com")).toBe("legacy");
    expect(await resetAccount("ADA@EXAMPLE.COM")).toBe("legacy");
    expect(await logIn("ADA@EXAMPLE.COM")).toMatchObject({ id: "legacy" });
    // Typed the way the passwordless account was saved, it is that one, as before.
    expect(await resetAccount("ada@example.com")).toBe("magic");
  });

  it("an account without a password saved in another case gets the link, so it can set one", async () => {
    await seedMagicLinkOnly("magic", "Ada@Example.com");
    expect(await resetAccount("ada@example.com")).toBe("magic");
  });

  it("two accounts with a password that differ only in case, and a spelling that is neither, get nothing", async () => {
    await seed("first", "Ada@Example.com");
    await seed("second", "ADA@example.com");
    expect(await resetAccount("ada@example.com")).toBeNull();
    expect(mocks.resetMails).toEqual([]);
    expect(await resetAccount("ADA@example.com")).toBe("second");
    // A refusal after an issued reset is still a refusal, not the last token.
    expect(await resetAccount("ada@EXAMPLE.com")).toBeNull();
  });

  it("two accounts with a password and one without, and a spelling that is none of them, get nothing", async () => {
    await seed("first", "Ada@Example.com");
    await seed("second", "ADA@example.com");
    await seedMagicLinkOnly("magic", "ada@Example.com");
    expect(await resetAccount("ada@example.com")).toBeNull();
    expect(mocks.resetMails).toEqual([]);
  });

  it("an address with no account gets nothing", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await resetAccount("grace@example.com")).toBeNull();
    expect(mocks.resetMails).toEqual([]);
  });
});

describe("accountForAddress — the rule on its own, for a caller that has not looked the exact spelling up", () => {
  const row = (id: string, email: string, passwordHash: string | null): AccountRow => ({
    id,
    email,
    name: "",
    role: "customer",
    passwordHash,
  });

  it("the spelling typed exactly wins even without a password, over the account login would pick", () => {
    const rows = [row("legacy", "Ada@Example.com", "hash"), row("magic", "ada@example.com", null)];
    expect(accountForAddress(rows, " ada@example.com ")?.id).toBe("magic");
    expect(accountForAddress(rows, "ADA@EXAMPLE.COM")?.id).toBe("legacy");
  });

  it("no rows, no account", () => {
    expect(accountForAddress([], "ada@example.com")).toBeNull();
  });

  // Step 3 is "the only row there is", not "the only row without a password"
  // and not "the first row": three shapes that tell those readings apart.
  it("one row without a password beside two with one is still a refusal", () => {
    const rows = [row("first", "Ada@Example.com", "hash"), row("second", "ADA@example.com", "hash"), row("magic", "ada@Example.com", null)];
    expect(accountForAddress(rows, "ada@example.com")).toBeNull();
  });

  it("two rows without a password, neither spelled as typed, is a refusal", () => {
    const rows = [row("one", "Ada@Example.com", null), row("two", "ADA@example.com", null)];
    expect(accountForAddress(rows, "ada@example.com")).toBeNull();
  });

  it("the only row, without a password and in another case, is the account", () => {
    expect(accountForAddress([row("magic", "Ada@Example.com", null)], "ada@example.com")?.id).toBe("magic");
  });
});

/** The account the forgot-password form issues a token for, once its answer is sent, or null. */
async function resetFormAccount(email: string): Promise<string | null> {
  const [tokens, mails] = [mocks.resetFor.length, mocks.resetMails.length];
  const fd = new FormData();
  fd.set("email", email);
  expect(await requestPasswordResetAction({ status: "idle" }, fd)).toMatchObject({ status: "sent" });
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
  return issuedSince(tokens, mails);
}

describe("the forgot-password form hands the reset the address as typed (REG-EMAIL-CASE-b)", () => {
  it("of two accounts with a password that differ only in case, the spelling typed is the one reset", async () => {
    await seed("first", "Ada@Example.com");
    await seed("second", "ADA@example.com");
    expect(await resetFormAccount("Ada@Example.com")).toBe("first");
    expect(await resetFormAccount("ADA@example.com")).toBe("second");
  });

  it("typed the way the account with a password was saved, that one is reset — the one login then checks", async () => {
    await seed("legacy", "Ada@Example.com");
    await seedMagicLinkOnly("magic", "ada@example.com");
    expect(await resetFormAccount("Ada@Example.com")).toBe("legacy");
  });

  it("an account saved with capitals gets its link when the address is typed lowercased", async () => {
    await seed("legacy", "Ada@Example.com");
    expect(await resetFormAccount("ada@example.com")).toBe("legacy");
  });
});
