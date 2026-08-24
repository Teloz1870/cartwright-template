/**
 * Guard for the destructive half of `prisma/seed.ts`.
 *
 * The seed clears ten tables — including `Order` and `User` — before it inserts
 * the template catalogue. That is exactly right for a fresh scaffold and
 * catastrophic for a shop that already exists: `pnpm seed`, or the
 * `npx prisma db seed` line in DEPLOY.md §4, run against a production
 * `DATABASE_URL` deletes the owner's catalogue, pages, accounts and orders,
 * with no confirmation and nothing to roll back to.
 *
 * The rule asks one question: is there anything here to lose? A database that
 * has never been seeded is empty; a database the seed has just filled holds the
 * template's own rows and exactly ONE user, the admin it created. Anything past
 * that baseline is somebody's work:
 *
 *   • orders                    — money, never recreatable.
 *   • more than one user        — customers signed up, or staff was added.
 *   • products/pages/categories — the catalogue. Counting these is what
 *     protects the shop that has not sold anything yet and the website-mode
 *     site that never will: both sit at one admin and zero orders forever
 *     while holding everything their owner wrote. An earlier version of this
 *     guard used the audit trail instead, which misses the main path —
 *     `app/admin/actions.ts` writes products, pages and categories through
 *     Prisma directly, without `withAudit`.
 *   • audit entries             — kept as a cheap extra signal for a database
 *     whose content was deleted but which was plainly administered.
 *
 * The consequence is deliberate: after ANY successful seed, seeding again is a
 * decision, not a default. `pnpm db:setup` — the documented way to get a
 * database — is unaffected, because it only ever seeds a fresh one.
 *
 * Escape hatch: `ALLOW_DESTRUCTIVE_SEED=1`, the same shape as the existing
 * `ALLOW_SQLITE_IN_PRODUCTION` opt-in in `lib/db.ts`.
 */

/** Env var an operator sets to confirm they really mean to wipe a database. */
export const DESTRUCTIVE_SEED_OVERRIDE_ENV = "ALLOW_DESTRUCTIVE_SEED";

export type SeedRowCounts = {
  orders: number;
  users: number;
  /** Of `users`, how many hold the admin role. See the non-admin rule below. */
  adminUsers: number;
  products: number;
  pages: number;
  categories: number;
  auditEntries: number;
};

/**
 * The counts a database has the moment the seed finishes on an empty one —
 * except `users`, where the seed's own admin is the single allowed row. Any
 * count above its baseline means the database has been used since.
 */
const FRESH_COUNTS: SeedRowCounts = {
  orders: 0,
  users: 1,
  adminUsers: 1,
  products: 0,
  pages: 0,
  categories: 0,
  auditEntries: 0,
};

/** Human labels for the refusal message, in the order they are reported. */
const COUNT_LABELS: Array<[keyof SeedRowCounts, string]> = [
  ["orders", "order(s)"],
  ["users", "user account(s)"],
  ["adminUsers", "admin account(s)"],
  ["products", "product(s)"],
  ["pages", "page(s)"],
  ["categories", "categor(y/ies)"],
  ["auditEntries", "recorded admin action(s)"],
];

export type SeedSafetyInput = {
  /** Row counts; a non-finite value means the count could not be read. */
  counts: SeedRowCounts;
  /** Raw value of the override env var (undefined when unset). */
  override?: string | undefined;
};

export type SeedSafetyVerdict =
  | { allowed: true; overridden: boolean }
  | { allowed: false; message: string };

function isOverridden(override: string | undefined): boolean {
  return override?.trim() === "1";
}

function isKnownCount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/**
 * True when a failed count means the TABLE is absent — a schema older than the
 * table, where zero rows is not a guess but a fact. Every other failure (an
 * unreachable database, a dead token, a driver mismatch) proves nothing and
 * must fail closed.
 *
 * This is the one place in the guard that can fail OPEN: saying "the table is
 * missing" turns an unreadable count into a confident zero, and a confident
 * zero lets the wipe proceed. So it matches only messages that name a TABLE.
 *
 * A bare `/does not exist/` does not. Postgres emits that phrasing for objects
 * whose absence says nothing about the rows:
 *
 *   database "shop_prod" does not exist   ← wrong URL. The real database is fine.
 *   role "app" does not exist             ← bad credentials.
 *   column "foo" does not exist           ← the table exists, and has rows.
 *
 * Each of those would have been read as "no table, so no rows" and cleared a
 * live database. The forms below are the ones drivers actually use for an
 * absent relation.
 */
const TABLE_ABSENT_PATTERNS: RegExp[] = [
  /no such table/i, // SQLite / libSQL
  /undefined table/i, // Postgres error-class name (42P01)
  /relation\s+"?[\w.$]+"?\s+does not exist/i, // Postgres
  /table\s+\S+\s+does not exist/i, // Prisma P2021
  /table\s+\S+\s+doesn't exist/i, // MySQL / MariaDB 1146
];

export function isMissingTableError(message: string): boolean {
  return TABLE_ABSENT_PATTERNS.some((re) => re.test(message));
}

/**
 * Decides whether `prisma/seed.ts` may run its `deleteMany()` block.
 *
 * Pure and synchronous on purpose — the caller reads the counts, this decides.
 * Unknown counts fail CLOSED: a seed that cannot prove the database is
 * disposable must not wipe it.
 */
export function evaluateSeedSafety(input: SeedSafetyInput): SeedSafetyVerdict {
  const overridden = isOverridden(input.override);
  const unknown = COUNT_LABELS.filter(
    ([key]) => !isKnownCount(input.counts[key]),
  ).map(([key]) => key);

  if (unknown.length > 0) {
    if (overridden) return { allowed: true, overridden: true };
    return {
      allowed: false,
      message: [
        "[seed] Refusing to wipe: could not read the row counts for",
        `       ${unknown.join(", ")}, so the seed cannot prove this database is`,
        "       safe to clear. The underlying error is printed above — usually:",
        "",
        "       • The database is unreachable, or the driver cannot talk to it:",
        "         wrong URL, expired Turso token, no network, or a Postgres URL",
        "         (the seed connects over libSQL). Nothing was touched.",
        "       • The schema has not been applied yet. Run `pnpm db:setup` — it",
        "         applies the schema and seeds a fresh DB in one step, and never",
        "         re-seeds a database that already has data.",
        "",
        `       To clear the database anyway, re-run with ${DESTRUCTIVE_SEED_OVERRIDE_ENV}=1.`,
      ].join("\n"),
    };
  }

  // An interrupted FIRST seed: content rows written, `user.create` never
  // reached. Nobody can have made that content — /admin needs a session and the
  // tool surface needs an API key, and both need a user row. So zero users with
  // zero orders is not "someone's work", it is a half-finished seed, and
  // `pnpm db:setup` re-running the seed to heal it is the documented recovery.
  // Refusing here would break that recovery: a regression this guard must not
  // introduce while preventing a different one.
  //
  // `orders` still has to be zero. Orders can arrive from a webhook with no
  // session at all, and they are the one thing that is never recreatable.
  if (isKnownCount(input.counts.users) && input.counts.users === 0) {
    if (isKnownCount(input.counts.orders) && input.counts.orders === 0) {
      return { allowed: true, overridden };
    }
  }

  const exceeded = COUNT_LABELS.filter(
    ([key]) => input.counts[key] > FRESH_COUNTS[key],
  );

  // The baseline's one user is specifically THE ADMIN THE SEED CREATES — not
  // "any one account". A magic-link signup that landed before the first seed
  // also reads as users: 1, and wiping it deletes a real person's account while
  // every count still looks like a fresh seed.
  const nonAdmins =
    isKnownCount(input.counts.users) && isKnownCount(input.counts.adminUsers)
      ? input.counts.users - input.counts.adminUsers
      : 0;

  const found = [
    ...exceeded.map(([key, label]) => `${input.counts[key]} ${label}`),
    ...(nonAdmins > 0 ? [`${nonAdmins} non-admin account(s)`] : []),
  ];

  if (found.length === 0) return { allowed: true, overridden };
  if (overridden) return { allowed: true, overridden: true };

  return {
    allowed: false,
    message: [
      "[seed] Refusing to wipe a database that already holds someone's work.",
      "",
      `       Found ${found.join(", ")}.`,
      "       A database that has only ever been seeded holds the template's own",
      `       rows and ${FRESH_COUNTS.users} user (the admin the seed creates), so this one has`,
      "       been used since — or was never a scratch database to begin with.",
      "",
      "       `prisma db seed` DELETES every order, cart, product, page, category,",
      "       discount code and user before inserting the template catalogue.",
      "       Orders, accounts and anything typed into /admin are not recreatable.",
      "",
      "       • Pointed at the wrong database? The Prisma CLI loads `.env` first and",
      "         then `.env.local`, which OVERRIDES it (prisma.config.ts) — check",
      "         DATABASE_URL / TURSO_DATABASE_URL in both, `.env.local` wins.",
      "       • Just want the admin password back? Run `pnpm admin:reset` — it",
      "         resets only the password and keeps all data.",
      "       • Want a clean database? Point at a new one, or run `pnpm db:setup`,",
      "         which seeds a fresh DB and skips one that already has data.",
      `       • Really want to wipe THIS one? Re-run with ${DESTRUCTIVE_SEED_OVERRIDE_ENV}=1.`,
    ].join("\n"),
  };
}
