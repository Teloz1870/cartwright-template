import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DESTRUCTIVE_SEED_OVERRIDE_ENV,
  evaluateSeedSafety,
  isMissingTableError,
  type SeedRowCounts,
} from "@/lib/seed-guard";

/**
 * `prisma/seed.ts` clears ten tables — orders, carts and users included —
 * before it inserts the template catalogue. On a fresh scaffold that is the
 * whole point; against a database somebody has worked in it is unrecoverable
 * data loss, and DEPLOY.md §4 tells owners to run exactly that command with
 * their production DB env in place. These tests lock both halves of the guard:
 * the decision rule, and the fact that the seed consults it before deleting.
 */

const ALLOW = "1";

/** A database the seed has just filled and nobody has touched since. */
const FRESH: SeedRowCounts = {
  orders: 0,
  users: 1,
  adminUsers: 1,
  products: 0,
  pages: 0,
  categories: 0,
  auditEntries: 0,
};

/** A database that has never been seeded. */
const EMPTY: SeedRowCounts = { ...FRESH, users: 0, adminUsers: 0 };

describe("evaluateSeedSafety — a database with nothing to lose", () => {
  it("allows a completely empty database", () => {
    expect(evaluateSeedSafety({ counts: EMPTY })).toEqual({
      allowed: true,
      overridden: false,
    });
  });

  it("allows a database holding only the seed's own admin", () => {
    expect(evaluateSeedSafety({ counts: FRESH }).allowed).toBe(true);
  });
});

describe("evaluateSeedSafety — a database holding someone's work", () => {
  it.each([
    ["an order", { orders: 1 }],
    ["a second user account", { users: 2 }],
    ["a product", { products: 1 }],
    ["a page", { pages: 1 }],
    ["a category", { categories: 1 }],
    ["a recorded admin action", { auditEntries: 1 }],
  ])("refuses when the database holds %s", (_label, delta) => {
    expect(
      evaluateSeedSafety({ counts: { ...FRESH, ...delta } }).allowed,
    ).toBe(false);
  });

  it("refuses the pre-launch shop: one admin, no orders, a catalogue in /admin", () => {
    // A website-mode site can never take an order and has exactly one admin
    // forever; a webshop before its first sale looks identical. Counting the
    // catalogue is what separates them from a database seeded five seconds ago.
    // (The audit trail alone does not: app/admin/actions.ts writes products,
    // pages and categories through Prisma directly, without withAudit.)
    const verdict = evaluateSeedSafety({
      counts: { ...FRESH, products: 214, pages: 9, auditEntries: 0 },
    });
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) return;
    expect(verdict.message).toContain("214 product(s)");
    expect(verdict.message).toContain("9 page(s)");
  });

  it("names what it found and the ways out", () => {
    const verdict = evaluateSeedSafety({
      counts: { ...FRESH, orders: 12, users: 5 },
    });
    if (verdict.allowed) throw new Error("expected a refusal");
    expect(verdict.message).toContain("12 order(s)");
    expect(verdict.message).toContain("5 user account(s)");
    expect(verdict.message).toContain(DESTRUCTIVE_SEED_OVERRIDE_ENV);
    // The recoveries an operator actually needs, not just the wipe.
    expect(verdict.message).toContain("admin:reset");
    // `.env.local` OVERRIDES `.env` for the Prisma CLI (prisma.config.ts loads
    // it with override: true) — the message must not send the operator to the
    // file that loses, or they check the safe one and wipe the other.
    expect(verdict.message).toContain("`.env.local` wins");
  });

  it("reports only the counts that are actually above the baseline", () => {
    const verdict = evaluateSeedSafety({ counts: { ...FRESH, products: 3 } });
    if (verdict.allowed) throw new Error("expected a refusal");
    expect(verdict.message).toContain("3 product(s)");
    expect(verdict.message).not.toContain("order(s)");
    expect(verdict.message).not.toContain("user account(s)");
  });

  it("proceeds once the operator sets the override to 1", () => {
    expect(
      evaluateSeedSafety({
        counts: { ...FRESH, orders: 12, products: 40 },
        override: ALLOW,
      }),
    ).toEqual({ allowed: true, overridden: true });
  });

  it("does not treat a merely present override as consent", () => {
    // A stray `ALLOW_DESTRUCTIVE_SEED=` or `=0` in a .env must not disarm the
    // guard — only the explicit "1" counts.
    for (const override of ["", "0", "true", "yes", "11", " "]) {
      expect(
        evaluateSeedSafety({ counts: { ...FRESH, orders: 3 }, override })
          .allowed,
        `override=${JSON.stringify(override)}`,
      ).toBe(false);
    }
    // Surrounding whitespace is a .env artefact, not a different answer.
    expect(
      evaluateSeedSafety({
        counts: { ...FRESH, orders: 3 },
        override: " 1 ",
      }).allowed,
    ).toBe(true);
  });
});

describe("evaluateSeedSafety — unknown counts fail closed", () => {
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["fractional", 1.5],
  ])("refuses when a count is %s", (_label, value) => {
    for (const key of Object.keys(FRESH) as Array<keyof SeedRowCounts>) {
      const verdict = evaluateSeedSafety({
        counts: { ...FRESH, [key]: value },
      });
      expect(verdict.allowed, `${key}=${value}`).toBe(false);
    }
  });

  it("names the tables it could not read", () => {
    const verdict = evaluateSeedSafety({
      counts: { ...FRESH, orders: Number.NaN },
    });
    if (verdict.allowed) throw new Error("expected a refusal");
    expect(verdict.message).toContain("orders");
    // Both plausible causes, so nobody re-applies a schema to fix a bad token.
    expect(verdict.message).toContain("unreachable");
    expect(verdict.message).toContain("db:setup");
  });

  it("still honours an explicit override when counts are unknown", () => {
    const unreadable: SeedRowCounts = {
      orders: Number.NaN,
      users: Number.NaN,
      adminUsers: Number.NaN,
      products: Number.NaN,
      pages: Number.NaN,
      categories: Number.NaN,
      auditEntries: Number.NaN,
    };
    expect(evaluateSeedSafety({ counts: unreadable, override: ALLOW })).toEqual({
      allowed: true,
      overridden: true,
    });
  });
});

describe("isMissingTableError — the only failure that means zero rows", () => {
  it.each([
    "SQLITE_ERROR: no such table: main.AuditLog",
    'relation "AuditLog" does not exist',
    "Undefined table: 7 ERROR",
    "Table 'shop.AuditLog' doesn't exist",
  ])("treats %s as an absent table", (message) => {
    expect(isMissingTableError(message)).toBe(true);
  });

  it.each([
    "SERVER_ERROR: Hrana: connection closed",
    "Unauthorized: expired token",
    "getaddrinfo ENOTFOUND db.turso.io",
    "socket hang up",
    "Timed out after 5000ms",
  ])("refuses to read %s as zero rows", (message) => {
    // An exception is not proof that a table is empty. Anything but a missing
    // table has to stay unknown, or a transient error becomes permission to
    // wipe a live database.
    expect(isMissingTableError(message)).toBe(false);
  });
});

/**
 * Strips comments before the structural scans below. Without this, every one of
 * them can be satisfied by a comment: a `// process.exit(1)` left behind while
 * debugging, or a stray `// evaluateSeedSafety(` above the delete block, would
 * keep the tests green while the guard is disarmed.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("prisma/seed.ts consults the guard before it deletes", () => {
  const raw = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
  const source = stripComments(raw);

  it("strips comments before scanning (this file's own premise)", () => {
    const stripped = stripComments(
      'const a = 1; // process.exit(1)\n/* evaluateSeedSafety( */\nconst b = "https://example.com";',
    );
    expect(stripped).not.toContain("process.exit(1)");
    expect(stripped).not.toContain("evaluateSeedSafety(");
    // …without eating a URL that merely contains "//".
    expect(stripped).toContain("https://example.com");
  });

  it("imports the guard", () => {
    expect(source).toMatch(/evaluateSeedSafety/);
    expect(source).toMatch(/from\s+"\.\.\/lib\/seed-guard"/);
  });

  it("calls the guard before the first deleteMany()", () => {
    // Match any call shape, and a real deleteMany rather than the word in prose.
    const guardCall = source.search(/evaluateSeedSafety\s*\(/);
    const firstDelete = source.search(/prisma\.\w+\.deleteMany\(/);
    expect(guardCall).toBeGreaterThan(-1);
    expect(firstDelete).toBeGreaterThan(-1);
    expect(guardCall).toBeLessThan(firstDelete);
  });

  it("aborts the process when the guard refuses", () => {
    // A guard whose verdict is computed and then ignored is worse than none —
    // it reads as protection in review while still wiping the database.
    expect(source).toMatch(
      /if\s*\(!verdict\.allowed\)\s*\{[\s\S]{0,200}?process\.exit\(1\)/,
    );
  });

  it("reads the override from the shared env-var name", () => {
    expect(source).toContain("process.env[DESTRUCTIVE_SEED_OVERRIDE_ENV]");
  });

  it("counts every table the guard decides on", () => {
    // A count the seed never reads is a signal the guard never gets.
    for (const model of ["order", "user", "product", "page", "category", "auditLog"]) {
      expect(source, `${model}.count() missing`).toContain(
        `prisma.${model}.count()`,
      );
    }
  });
});

/**
 * The three findings the review triad left unresolved. Each gets its own test,
 * because each was a different way for the guard to be wrong, and a fix without
 * a test is a fix that comes back.
 */
describe("review round 3 — the findings that blocked the merge", () => {
  describe("a lone user is not automatically the seed's admin", () => {
    it("refuses when the single account is a customer, not the admin", () => {
      // Magic-link signup before the first seed: every count reads exactly like
      // a fresh seed, and wiping deletes a real person's account.
      const verdict = evaluateSeedSafety({
        counts: { ...FRESH, users: 1, adminUsers: 0 },
      });

      if (verdict.allowed) throw new Error("expected a refusal");
      expect(verdict.message).toContain("non-admin account");
    });

    it("still allows the seeded baseline — one user, and it IS the admin", () => {
      expect(evaluateSeedSafety({ counts: FRESH })).toEqual({
        allowed: true,
        overridden: false,
      });
    });

    it("refuses a second account even when both are admins", () => {
      const verdict = evaluateSeedSafety({
        counts: { ...FRESH, users: 2, adminUsers: 2 },
      });

      if (verdict.allowed) throw new Error("expected a refusal");
      expect(verdict.message).toContain("admin account");
    });
  });

  describe("an interrupted first seed can still heal itself", () => {
    // The guard must not create a NEW failure while preventing another: before
    // it existed, `pnpm db:setup` re-ran the seed over a half-written database
    // and finished the job. Nobody can have authored that content — /admin
    // needs a session and the tool surface needs an API key, and both need a
    // user row that does not exist here.
    it("allows content with zero users and zero orders", () => {
      expect(
        evaluateSeedSafety({
          counts: { ...EMPTY, products: 12, categories: 3, pages: 4 },
        }),
      ).toEqual({ allowed: true, overridden: false });
    });

    it("but never when an order exists — a webhook needs no session", () => {
      const verdict = evaluateSeedSafety({
        counts: { ...EMPTY, products: 12, orders: 1 },
      });

      if (verdict.allowed) throw new Error("expected a refusal");
      expect(verdict.message).toContain("order");
    });

    it("and never when the counts are unknown", () => {
      const verdict = evaluateSeedSafety({
        counts: { ...EMPTY, users: Number.NaN, products: 12 },
      });

      expect(verdict.allowed).toBe(false);
    });
  });

  describe("isMissingTableError names a TABLE — it cannot fail open", () => {
    // This is the one place the guard can fail OPEN: "table missing" turns an
    // unreadable count into a confident zero, and a confident zero permits the
    // wipe. A bare /does not exist/ matched three Postgres messages that say
    // nothing about rows.
    const ABSENT_TABLE = [
      "no such table: Lead", // SQLite / libSQL
      'relation "Product" does not exist', // Postgres
      "The table `main.Order` does not exist in the current database.", // Prisma P2021
      "Table 'shop.User' doesn't exist", // MySQL 1146
      "undefined table", // Postgres 42P01 class name
    ];
    const NOT_ABSENT_TABLE = [
      'database "shop_prod" does not exist', // wrong URL — the real DB is fine
      'role "app" does not exist', // bad credentials
      'column "frameColor" does not exist', // the table exists, WITH rows
      'schema "public" does not exist',
      "connect ETIMEDOUT",
      "SQLITE_BUSY: database is locked",
    ];

    it.each(ABSENT_TABLE)("recognises %j", (message) => {
      expect(isMissingTableError(message)).toBe(true);
    });

    it.each(NOT_ABSENT_TABLE)("refuses to read %j as an absent table", (message) => {
      expect(isMissingTableError(message)).toBe(false);
    });
  });
});
