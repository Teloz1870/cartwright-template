import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client, type InValue } from "@libsql/client";

/**
 * REG-EMAIL-CASE-c: a magic link for an account saved with capitals
 * (`Foo@Example.com`) signs in to THAT account, instead of making a second,
 * lowercased one. The account is bound when the link is issued: the token row
 * and the link's `email` both name the stored spelling, so Auth.js's own
 * redemption finds it exactly (lib/auth/magic-link-account.ts).
 *
 * The path from the request to the session is the real code: the INSTALLED
 * Auth.js `sendToken` and `callback` (loaded from the @auth/core next-auth
 * resolves, so a version bump runs here too), the real PrismaAdapter wrapped as
 * lib/auth.ts wraps it, and the real lib/auth.ts email provider with its real
 * rate limits. Stubbed: Prisma — over a real SQLite table (libSQL, in memory),
 * so the case-insensitive lookup runs as written — NextAuth itself, which hands
 * back the config, and the Auth.js callbacks/events (allow-all, plus a probe
 * recording who was signed in), which decide nothing about the account.
 */

const mocks = vi.hoisted(() => ({
  db: null as null | Client,
  config: null as null | {
    adapter: Record<string, (...args: never[]) => Promise<unknown>>;
    providers: Array<Record<string, unknown>>;
  },
  /** How many times the case-insensitive statement read the table through. */
  scans: 0,
  mails: [] as Array<{ email: string; url: string }>,
}));

type Row = Record<string, unknown>;

async function rows(sql: string, args: InValue[] = []): Promise<Row[]> {
  const result = await mocks.db!.execute({ sql, args });
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((column, i) => [column, row[i]])),
  );
}

/** A User row as Prisma would return it (`emailVerified` a Date or null). */
function asUser(row: Row | undefined): Row | null {
  if (!row) return null;
  return { ...row, emailVerified: row.emailVerified ? new Date(String(row.emailVerified)) : null };
}

const DDL = `
  CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'customer',
    "emailVerified" TEXT
  );
  CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
  CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TEXT NOT NULL
  );
  CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
  CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
`;

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: InValue[]) => {
      mocks.scans += 1;
      return rows(strings.join("?"), values);
    },
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        const [column, value] = where.email !== undefined ? ["email", where.email] : ["id", where.id!];
        return asUser((await rows(`SELECT * FROM "User" WHERE "${column}" = ?`, [value]))[0]);
      },
      create: async ({ data }: { data: { email: string; emailVerified?: Date | null } }) => {
        const id = `u${(await rows('SELECT "id" FROM "User"')).length + 1}`;
        await rows('INSERT INTO "User" ("id", "email", "emailVerified") VALUES (?, ?, ?)', [
          id,
          data.email,
          data.emailVerified?.toISOString() ?? null,
        ]);
        return asUser((await rows('SELECT * FROM "User" WHERE "id" = ?', [id]))[0]);
      },
      update: async ({ where, data }: { where: { id: string }; data: { emailVerified?: Date } }) => {
        if (data.emailVerified) {
          await rows('UPDATE "User" SET "emailVerified" = ? WHERE "id" = ?', [
            data.emailVerified.toISOString(),
            where.id,
          ]);
        }
        return asUser((await rows('SELECT * FROM "User" WHERE "id" = ?', [where.id]))[0]);
      },
    },
    verificationToken: {
      create: async ({ data }: { data: { identifier: string; token: string; expires: Date } }) => {
        await rows('INSERT INTO "VerificationToken" VALUES (?, ?, ?)', [
          data.identifier,
          data.token,
          data.expires.toISOString(),
        ]);
        return data;
      },
      // `@@unique([identifier, token])`: both must match exactly, as in Prisma.
      delete: async ({
        where: { identifier_token },
      }: {
        where: { identifier_token: { identifier: string; token: string } };
      }) => {
        const [found] = await rows(
          'SELECT * FROM "VerificationToken" WHERE "identifier" = ? AND "token" = ?',
          [identifier_token.identifier, identifier_token.token],
        );
        if (!found) throw Object.assign(new Error("Record to delete does not exist."), { code: "P2025" });
        await rows('DELETE FROM "VerificationToken" WHERE "identifier" = ? AND "token" = ?', [
          identifier_token.identifier,
          identifier_token.token,
        ]);
        return { ...found, expires: new Date(String(found.expires)) };
      },
    },
  },
}));
vi.mock("@/lib/mailer", () => ({
  sendMagicLinkEmail: async (data: { email: string; url: string }) => {
    mocks.mails.push(data);
  },
}));
vi.mock("next-auth", () => ({
  default: (config: NonNullable<typeof mocks.config>) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

import "@/lib/auth";
import { magicLinkPerEmailLimiter, magicLinkPerIpLimiter } from "@/lib/rate-limit";
import {
  openMagicLinkRequest,
  pendingMagicLinkBindings,
  resetMagicLinkBindings,
} from "@/lib/auth/magic-link-account";

/** A request past the limits, as lib/auth.ts makes it: join, then look up. */
const bindMagicLink = (identifier: string, expires: Date) =>
  openMagicLinkRequest(identifier, expires).bind();

/** The @auth/core next-auth is installed with — npm's or pnpm's layout alike. */
const authCoreDir = path.dirname(
  createRequire(path.join(realpathSync(path.resolve("node_modules/next-auth")), "package.json")).resolve(
    "@auth/core",
  ),
);
const SEND_TOKEN = path.join(authCoreDir, "lib/actions/signin/send-token.js");
const CALLBACK = path.join(authCoreDir, "lib/actions/callback/index.js");

type SendToken = (request: unknown, options: unknown) => Promise<{ redirect: string }>;
type Callback = (
  request: unknown,
  options: unknown,
  sessionStore: unknown,
  cookies: unknown[],
) => Promise<{ redirect: string }>;

const SECRET = "test-secret";
const ORIGIN = "https://shop.test";

function emailProvider() {
  return mocks.config!.providers.find((p) => p.id === "email")!;
}

/**
 * The provider Auth.js is given. When the per-address limit throws, `sendToken`
 * holds the rejected send unobserved across its `await createHash` before
 * `Promise.all` takes it — an unhandled rejection in Auth.js itself, which
 * Vitest reports as an error; `quiet` observes it at once, changing nothing
 * else (Promise.all still rejects with it).
 */
function providerFor(quiet: boolean, token?: string) {
  const provider = emailProvider();
  // A fixed raw token, so a test can tell one request's token from another's.
  const fixed = token ? { ...provider, generateVerificationToken: async () => token } : provider;
  if (!quiet) return fixed;
  const send = provider.sendVerificationRequest as (params: unknown) => Promise<void>;
  return {
    ...fixed,
    sendVerificationRequest(params: unknown) {
      const sent = send(params);
      sent.catch(() => {});
      return sent;
    },
  };
}

/** Auth.js's "email me a link" for `email`, as POST /api/auth/signin/email runs it. */
async function requestLink(email: string, ip = "203.0.113.7", quiet = false, token?: string) {
  const { sendToken } = (await import(pathToFileURL(SEND_TOKEN).href)) as { sendToken: SendToken };
  return sendToken(
    {
      body: { email },
      url: `${ORIGIN}/api/auth/signin/email`,
      method: "POST",
      headers: new Headers({ "x-vercel-forwarded-for": ip }),
    },
    {
      provider: providerFor(quiet, token),
      adapter: mocks.config!.adapter,
      callbacks: { signIn: async () => true, redirect: async ({ url }: { url: string }) => url },
      callbackUrl: `${ORIGIN}/en/account`,
      theme: {},
      secret: SECRET,
      basePath: "/api/auth",
      url: new URL(`${ORIGIN}/api/auth`),
    },
  );
}

/** The customer clicking `link`: Auth.js's own callback route, returning who it signed in. */
async function clickLink(link: string): Promise<{ id: string; email: string }> {
  const { callback } = (await import(pathToFileURL(CALLBACK).href)) as { callback: Callback };
  const query = Object.fromEntries(new URL(link).searchParams);
  let signedIn: { id: string; email: string } | null = null;
  await callback(
    { query, body: undefined, method: "GET", headers: new Headers() },
    {
      provider: emailProvider(),
      adapter: mocks.config!.adapter,
      url: new URL(`${ORIGIN}/api/auth`),
      callbackUrl: `${ORIGIN}/en/account`,
      pages: {},
      jwt: { encode: async () => "session-jwt" },
      events: {
        signIn: async ({ user }: { user: { id: string; email: string } }) => {
          signedIn = user;
        },
      },
      callbacks: {
        signIn: async () => true,
        redirect: async ({ url }: { url: string }) => url,
        jwt: async ({ token }: { token: unknown }) => token,
      },
      session: { strategy: "jwt", maxAge: 3600 },
      cookies: { sessionToken: { name: "authjs.session-token", options: {} } },
      logger: { debug() {}, error() {}, warn() {} },
      secret: SECRET,
    },
    { value: undefined, chunk: () => [], clean: () => [] },
    [],
  );
  if (!signedIn) throw new Error("the callback signed no one in");
  return signedIn;
}

async function seed(...emails: string[]) {
  for (const [i, email] of emails.entries()) {
    await rows('INSERT INTO "User" ("id", "email", "passwordHash") VALUES (?, ?, ?)', [
      `seed${i + 1}`,
      email,
      "$2b$10$hash",
    ]);
  }
}

/** Accounts with no password: made by an earlier link, imported, or a guest. */
async function seedWithoutPassword(...emails: string[]) {
  for (const [i, email] of emails.entries()) {
    await rows('INSERT INTO "User" ("id", "email") VALUES (?, ?)', [`seed${i + 1}`, email]);
  }
}

const users = () => rows('SELECT "id", "email" FROM "User" ORDER BY "id"');
const tokenIdentifiers = async () =>
  (await rows('SELECT "identifier" FROM "VerificationToken" ORDER BY rowid')).map((r) => r.identifier);

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "");
  magicLinkPerIpLimiter.reset();
  magicLinkPerEmailLimiter.reset();
  resetMagicLinkBindings();
  mocks.mails.length = 0;
  mocks.scans = 0;
  mocks.db = createClient({ url: ":memory:" });
  await mocks.db.executeMultiple(DDL);
});

describe("magic link — an account saved with capitals (REG-EMAIL-CASE-c)", () => {
  it("names the stored spelling in the token and the link, and signs in to that account without making another", async () => {
    await seed("Foo@Example.com");

    await requestLink("foo@example.com");

    expect(await tokenIdentifiers()).toEqual(["Foo@Example.com"]);
    expect(mocks.mails).toHaveLength(1);
    expect(mocks.mails[0].email).toBe("Foo@Example.com");
    const link = new URL(mocks.mails[0].url);
    expect(link.searchParams.get("email")).toBe("Foo@Example.com");

    const user = await clickLink(mocks.mails[0].url);
    expect(user.id).toBe("seed1");
    expect(await users()).toEqual([{ id: "seed1", email: "Foo@Example.com" }]);
    expect(await tokenIdentifiers()).toEqual([]);
  });

  it("the same link edited back to the lowercased address opens nothing", async () => {
    await seed("Foo@Example.com");
    await requestLink("FOO@example.com");

    const edited = new URL(mocks.mails[0].url);
    edited.searchParams.set("email", "foo@example.com");
    await expect(clickLink(edited.toString())).rejects.toThrow();
    expect(await users()).toEqual([{ id: "seed1", email: "Foo@Example.com" }]);
  });

  it("an account saved lowercased: token, link and sign-in exactly as before", async () => {
    await seed("ada@example.com");

    await requestLink("Ada@Example.com");

    expect(await tokenIdentifiers()).toEqual(["ada@example.com"]);
    expect(mocks.mails[0].email).toBe("ada@example.com");
    expect(new URL(mocks.mails[0].url).searchParams.get("email")).toBe("ada@example.com");
    expect((await clickLink(mocks.mails[0].url)).id).toBe("seed1");
    expect(await users()).toHaveLength(1);
  });

  it("an exact lowercased row wins over a capitalised one, as login and reset pick", async () => {
    await seed("Ada@Example.com", "ada@example.com");

    await requestLink("ada@example.com");

    expect(await tokenIdentifiers()).toEqual(["ada@example.com"]);
    expect((await clickLink(mocks.mails[0].url)).id).toBe("seed2");
  });

  it("a password-less lowercased account (made by an earlier link) gets its link as before", async () => {
    await seedWithoutPassword("ada@example.com");

    await requestLink("Ada@Example.com");

    expect(await tokenIdentifiers()).toEqual(["ada@example.com"]);
    expect(mocks.mails).toHaveLength(1);
    expect(mocks.mails[0].email).toBe("ada@example.com");
    expect(new URL(mocks.mails[0].url).searchParams.get("email")).toBe("ada@example.com");
    expect((await clickLink(mocks.mails[0].url)).id).toBe("seed1");
    expect(await users()).toHaveLength(1);
  });

  it("the only capitalised account, with no password (imported or a guest), gets its link", async () => {
    await seedWithoutPassword("Ada@Example.com");

    await requestLink("ada@example.com");

    expect(await tokenIdentifiers()).toEqual(["Ada@Example.com"]);
    expect(mocks.mails).toHaveLength(1);
    expect(mocks.mails[0].email).toBe("Ada@Example.com");
    expect((await clickLink(mocks.mails[0].url)).id).toBe("seed1");
    expect(await users()).toEqual([{ id: "seed1", email: "Ada@Example.com" }]);
  });

  it("no account: a new customer signs up under the address as Auth.js gave it", async () => {
    await requestLink("New@Example.com");

    expect(await tokenIdentifiers()).toEqual(["new@example.com"]);
    expect(mocks.mails[0].email).toBe("new@example.com");
    const user = await clickLink(mocks.mails[0].url);
    expect(user.email).toBe("new@example.com");
    expect(await users()).toEqual([{ id: "u1", email: "new@example.com" }]);
  });

  it("several accounts differ only in case and the rule cannot pick one: no link, logged without the address", async () => {
    await seed("Foo@Example.com", "FOO@EXAMPLE.COM");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(requestLink("foo@example.com")).resolves.toBeDefined();

      expect(mocks.mails).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      const line = warn.mock.calls[0].map(String).join(" ");
      expect(line).toMatch(/magic link not sent/i);
      expect(line.toLowerCase()).not.toContain("foo@example.com");
    } finally {
      warn.mockRestore();
    }
    // The token Auth.js filed anyway names no account's spelling.
    expect(await tokenIdentifiers()).toEqual(["foo@example.com"]);
  });

  it("a request the per-address limit stops: no lookup, no link, its token under the address as given", async () => {
    await seed("Foo@Example.com");
    for (let i = 0; i < 3; i++) await requestLink("foo@example.com", `192.0.2.${i}`);
    expect(mocks.scans).toBe(3);

    await expect(requestLink("foo@example.com", "192.0.2.99", true)).rejects.toThrow(/too many/i);

    expect(mocks.scans).toBe(3);
    expect(mocks.mails).toHaveLength(3);
    // Auth.js files the token even so; Promise.all rejected before it landed.
    await vi.waitFor(async () =>
      expect((await tokenIdentifiers()).filter((id) => id === "foo@example.com")).toHaveLength(1),
    );
    expect(mocks.scans).toBe(3);
  });

  it("a request the per-client limit drops: no lookup, no link", async () => {
    await seed("Foo@Example.com");
    for (let i = 0; i < 10; i++) await requestLink(`c${i}@example.com`);
    const scans = mocks.scans;

    await requestLink("foo@example.com");

    expect(mocks.scans).toBe(scans);
    expect(mocks.mails.map((m) => m.email)).not.toContain("Foo@Example.com");
    expect(await tokenIdentifiers()).toContain("foo@example.com");
    expect(await tokenIdentifiers()).not.toContain("Foo@Example.com");
  });
});

describe("requests for one address in one millisecond, one of them stopped by a limit", () => {
  /**
   * Auth.js files a token for a stopped request too, and hashes each raw token
   * before filing it (`await createHash`, the Web Crypto digest), so the tokens
   * of two requests sharing an `expires` can be filed in either order. `slow`
   * holds back the digest of one raw token until the other has been filed.
   */
  function holdDigest(slow: string) {
    const subtle = globalThis.crypto.subtle;
    const digest = subtle.digest.bind(subtle);
    return vi.spyOn(subtle, "digest").mockImplementation(async (algorithm, data) => {
      const text = new TextDecoder().decode(data as ArrayBuffer);
      if (text.startsWith(slow)) await new Promise((resolve) => setTimeout(resolve, 30));
      return digest(algorithm, data);
    });
  }

  for (const slow of ["tok-sent", "tok-dropped"]) {
    it(`the sent link signs in to the stored spelling whichever token is filed first (${slow} filed last)`, async () => {
      await seed("Foo@Example.com");
      // One client out of its per-client budget.
      for (let i = 0; i < 10; i++) await requestLink(`c${i}@example.com`, "198.51.100.1");
      mocks.mails.length = 0;

      const spy = holdDigest(slow);
      // Both requests in one millisecond: one `expires` (the clock otherwise
      // stands still, so the limits refill nothing).
      const now = Date.now();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      try {
        await Promise.all([
          requestLink("foo@example.com", "198.51.100.1", false, "tok-dropped"),
          requestLink("foo@example.com", "203.0.113.50", false, "tok-sent"),
        ]);
      } finally {
        vi.useRealTimers();
        spy.mockRestore();
      }

      expect(mocks.mails).toHaveLength(1);
      expect(mocks.mails[0].email).toBe("Foo@Example.com");
      const user = await clickLink(mocks.mails[0].url);
      expect(user.id).toBe("seed1");
      expect((await users()).filter((u) => String(u.email).toLowerCase() === "foo@example.com")).toEqual([
        { id: "seed1", email: "Foo@Example.com" },
      ]);
      expect(pendingMagicLinkBindings()).toBe(0);
    });
  }
});

describe("the answers waiting for their token stay few", () => {
  /** What Auth.js files next to a send: the adapter lib/auth.ts builds. */
  function fileToken(identifier: string, expires: Date, token: string) {
    const create = mocks.config!.adapter.createVerificationToken as unknown as (t: {
      identifier: string;
      token: string;
      expires: Date;
    }) => Promise<unknown>;
    return create({ identifier, token, expires });
  }

  it("a filed token takes its answer away", async () => {
    await seed("Foo@Example.com");
    const expires = new Date(Date.now() + 900_000);
    await bindMagicLink("foo@example.com", expires);
    expect(pendingMagicLinkBindings()).toBe(1);

    await fileToken("foo@example.com", expires, "t1");

    expect(pendingMagicLinkBindings()).toBe(0);
    expect(await tokenIdentifiers()).toEqual(["Foo@Example.com"]);
  });

  it("two requests for one address in one millisecond: both tokens get the stored spelling", async () => {
    await seed("Foo@Example.com");
    const expires = new Date(Date.now() + 900_000);
    await bindMagicLink("foo@example.com", expires);
    await bindMagicLink("foo@example.com", new Date(expires.getTime()));

    await fileToken("foo@example.com", expires, "t1");
    await fileToken("foo@example.com", expires, "t2");

    expect(await tokenIdentifiers()).toEqual(["Foo@Example.com", "Foo@Example.com"]);
    // Both passed the limits; the group looked the account up once.
    expect(mocks.scans).toBe(1);
    expect(pendingMagicLinkBindings()).toBe(0);
  });

  it("a token filed before any request of its group decided waits for the decision", async () => {
    await seed("Foo@Example.com");
    const expires = new Date(Date.now() + 900_000);
    const sent = openMagicLinkRequest("foo@example.com", expires);
    let filed = false;
    const token = fileToken("foo@example.com", expires, "t1").then(() => (filed = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(filed).toBe(false);

    await sent.bind();
    await token;
    expect(await tokenIdentifiers()).toEqual(["Foo@Example.com"]);
  });

  it("a stopped request's token waits for a group-mate still deciding, and every token of the group takes its answer", async () => {
    await seed("Foo@Example.com");
    const expires = new Date(Date.now() + 900_000);
    const stopped = openMagicLinkRequest("foo@example.com", expires);
    const sent = openMagicLinkRequest("foo@example.com", expires);
    stopped.close();

    const first = fileToken("foo@example.com", expires, "t-stopped");
    await sent.bind();
    await first;
    await fileToken("foo@example.com", expires, "t-sent");

    expect(await tokenIdentifiers()).toEqual(["Foo@Example.com", "Foo@Example.com"]);
    expect(mocks.scans).toBe(1);
    expect(pendingMagicLinkBindings()).toBe(0);
  });

  it("a group in which every request was stopped: tokens under the address as given, nothing looked up", async () => {
    await seed("Foo@Example.com");
    const expires = new Date(Date.now() + 900_000);
    const a = openMagicLinkRequest("foo@example.com", expires);
    const b = openMagicLinkRequest("foo@example.com", expires);
    a.close();
    const first = fileToken("foo@example.com", expires, "ta");
    b.close();
    b.close();
    await first;
    await fileToken("foo@example.com", expires, "tb");

    expect(await tokenIdentifiers()).toEqual(["foo@example.com", "foo@example.com"]);
    expect(mocks.scans).toBe(0);
    expect(pendingMagicLinkBindings()).toBe(0);
  });

  it("answers no token comes for are capped, oldest dropped first", async () => {
    await seed("X@Example.com");
    const base = Date.now() + 900_000;
    for (let i = 0; i < 400; i++) await bindMagicLink("x@example.com", new Date(base + i));
    expect(pendingMagicLinkBindings()).toBeLessThanOrEqual(256);

    // The oldest is gone: its token goes under the address as given (its link
    // then opens nothing, never another account). The newest still binds.
    await fileToken("x@example.com", new Date(base), "old");
    await fileToken("x@example.com", new Date(base + 399), "new");
    expect(await tokenIdentifiers()).toEqual(["x@example.com", "X@Example.com"]);
  });

  it("a token waiting on an undecided request is woken when the cap drops its group, under the address as given", async () => {
    await seed("X@Example.com");
    const base = Date.now() + 900_000;
    // Two undecided requests, one token filed: the group stays open, waiting.
    openMagicLinkRequest("x@example.com", new Date(base));
    openMagicLinkRequest("x@example.com", new Date(base));
    let filed = false;
    const waiting = fileToken("x@example.com", new Date(base), "waiting").then(() => (filed = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(filed).toBe(false);

    // Groups still deciding, so none is finished and the oldest such goes first.
    for (let i = 1; i <= 256; i++) openMagicLinkRequest("x@example.com", new Date(base + i));

    await waiting;
    expect(await tokenIdentifiers()).toEqual(["x@example.com"]);
    expect(mocks.scans).toBe(0);
  });

  it("a flood of stopped requests: the cap drops their groups, never a sent link's", async () => {
    await seed("Foo@Example.com");
    const expires = new Date(Date.now() + 900_000);
    const sent = openMagicLinkRequest("foo@example.com", expires);
    await sent.bind();
    sent.close();

    const base = expires.getTime() + 1;
    for (let i = 0; i < 300; i++) openMagicLinkRequest(`x${i}@example.com`, new Date(base + i)).close();
    expect(pendingMagicLinkBindings()).toBeLessThanOrEqual(256);

    await fileToken("foo@example.com", expires, "sent");
    expect(await tokenIdentifiers()).toEqual(["Foo@Example.com"]);
  });

  it("a flood of requests still deciding: the cap drops those before a bound group", async () => {
    await seed("Foo@Example.com");
    const expires = new Date(Date.now() + 900_000);
    await bindMagicLink("foo@example.com", expires);

    const base = expires.getTime() + 1;
    for (let i = 0; i < 300; i++) openMagicLinkRequest(`x${i}@example.com`, new Date(base + i));
    expect(pendingMagicLinkBindings()).toBeLessThanOrEqual(256);

    await fileToken("foo@example.com", expires, "sent");
    expect(await tokenIdentifiers()).toEqual(["Foo@Example.com"]);
  });

  it("an answer older than its TTL is not used, and is swept by the next request", async () => {
    await seed("Foo@Example.com");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const expires = new Date(Date.now() + 900_000);
      await bindMagicLink("foo@example.com", expires);
      vi.setSystemTime(Date.now() + 61_000);

      await fileToken("foo@example.com", expires, "late");
      expect(await tokenIdentifiers()).toEqual(["foo@example.com"]);

      await bindMagicLink("foo@example.com", new Date(Date.now() + 1));
      vi.setSystemTime(Date.now() + 61_000);
      await bindMagicLink("bar@example.com", new Date(Date.now() + 2));
      expect(pendingMagicLinkBindings()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("drift guard — the installed Auth.js still hands one expires to both calls", () => {
  const source = readFileSync(SEND_TOKEN, "utf8");

  /** The source from the first `<callee>(` call up to `end` — the whole argument list. */
  function callArgs(callee: string, end: string): string {
    const start = source.indexOf(callee);
    expect(start, `${callee} is no longer called in send-token.js`).toBeGreaterThan(-1);
    const stop = source.indexOf(end, start);
    expect(stop, `${end} no longer follows ${callee} in send-token.js`).toBeGreaterThan(start);
    return source.slice(start, stop);
  }

  it("sendVerificationRequest is started before the token is filed, and both get the same expires and identifier", () => {
    const send = callArgs("provider.sendVerificationRequest(", "const createToken");
    const create = callArgs("adapter.createVerificationToken?.(", "await Promise.all");
    expect(source.indexOf("provider.sendVerificationRequest(")).toBeLessThan(
      source.indexOf("adapter.createVerificationToken?.("),
    );
    expect(send).toMatch(/\bexpires,/);
    expect(create).toMatch(/\bexpires,/);
    expect(send).toMatch(/identifier: email,/);
    expect(create).toMatch(/identifier: email,/);
    expect(source.match(/\bconst expires = /g)).toHaveLength(1);
    expect(source).toMatch(/await Promise\.all\(\[sendRequest, createToken\]\)/);
  });
});
