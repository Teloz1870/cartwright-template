import "server-only";

import { prisma } from "@/lib/db";

/**
 * One customer per address, whatever its case (REG-EMAIL-CASE).
 *
 * Sign-up used to save the address exactly as typed and login looked it up the
 * same way, so `Foo@x.dk` and `foo@x.dk` were two accounts. Every live shop
 * therefore holds rows saved in the case they were typed (`Ada@Example.com`).
 * Sign-up now saves the lowercased address, and sign-up and login both find an
 * account through `findAccountsByEmail`, which compares case-insensitively
 * against the rows as stored — so an account saved with capitals before this
 * counts as taken, and signs in, whatever case is typed. No row is rewritten.
 *
 * A password reset finds the account the same way (REG-EMAIL-CASE-b):
 * `findAccountForAddress`, picking with `accountForAddress`. A magic link still
 * looks the address up lowercased only (REG-EMAIL-CASE-c).
 */

/** The address as typed, without the spaces a paste or an autofill leaves around it. */
function typedAccountEmail(email: string): string {
  return email.trim();
}

/** The one spelling sign-up saves: trimmed and lowercased. */
export function normalizeAccountEmail(email: string): string {
  return typedAccountEmail(email).toLowerCase();
}

/** The `User` columns sign-up and login read. */
export type AccountRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string | null;
};

/**
 * Every account whose stored address equals `email` ignoring case.
 *
 * Raw SQL because the comparison must fold the STORED rows, and Prisma's
 * `mode: "insensitive"` exists only on Postgres; the engine also runs on SQLite
 * and libSQL/Turso (lib/db.ts). The statement is a tagged template, so both
 * values are bound parameters, and it is portable to all three: `lower()` is
 * built in everywhere, and the quoted names are the table and columns Prisma
 * creates for `model User` (no `@@map`; same idiom as lib/public-pages.ts).
 *
 * `lower("email") = <lowercased address>` is the case-insensitive match; a row
 * saved lowercased is its own `lower()` on every engine. SQLite's `lower()`
 * folds ASCII only, so there a row with a capital outside ASCII (`JÖRG@x.dk`)
 * is not matched by another spelling — sign-up's `z.email()` admits ASCII
 * addresses only, so no sign-up ever saved one — and the exact clause is what
 * keeps such a row signing in spelled the way it was saved, as it always did.
 * The `lower()` side cannot use the unique index, so this reads the `User`
 * table through. Sign-up, password login and a password reset run it once
 * each, behind their rate limits — one statement for every address, so an
 * address that has an account costs the same as one that has none.
 */
export async function findAccountsByEmail(email: string): Promise<AccountRow[]> {
  const typed = typedAccountEmail(email);
  if (!typed) return [];
  const normalized = normalizeAccountEmail(email);
  return prisma.$queryRaw<AccountRow[]>`
    SELECT "id", "email", "name", "role", "passwordHash"
    FROM "User"
    WHERE "email" = ${typed} OR lower("email") = ${normalized}
  `;
}

/**
 * Which of `findAccountsByEmail`'s rows a password login means, or null.
 *
 * Only rows that have a password are considered: a magic-link-only account
 * cannot take one, and a live shop can hold exactly that next to an older row
 * (a magic link for `Ada@Example.com` arrives lowercased and, not finding the
 * capitalised row, makes `ada@example.com` without a password). Among them:
 *
 *  1. The row spelled exactly as typed: every login that worked before this
 *     lands where it did, even where another spelling of the address exists.
 *  2. Otherwise the only row there is (`ada@example.com` typed, `Ada@Example.com`
 *     stored).
 *  3. Otherwise null: two or more accounts differ only in case and the typed
 *     spelling is none of them. Picking one — the oldest, the lowercased — would
 *     be a guess about which customer this is, and a customer who reused one
 *     password on both, or two people who share one, would be signed in to an
 *     account that may not be theirs. Refusing costs the customer nothing that
 *     typing the address the way they saved it does not fix, and the caller
 *     answers it exactly as a wrong password, so it reveals nothing either.
 *
 * Every answer is a row the typed address also reaches by being typed in that
 * row's own spelling, and its password still has to match, so the
 * case-insensitive match opens no account that was closed before.
 */
export function accountForLogin(
  rows: readonly AccountRow[],
  email: string,
): AccountRow | null {
  const typed = typedAccountEmail(email);
  const withPassword = rows.filter((row) => row.passwordHash);
  const exact = withPassword.find((row) => row.email === typed);
  if (exact) return exact;
  return withPassword.length === 1 ? withPassword[0] : null;
}

/**
 * Which of `findAccountsByEmail`'s rows an address means where no password is
 * typed — a password reset (REG-EMAIL-CASE-b) — or null.
 *
 *  1. The row spelled exactly as typed, with a password or without one, so a
 *     reset typed the way an account was saved is for that account — the one a
 *     login typed so signs in to once it has a password.
 *  2. Otherwise the account a password login with this address signs in to
 *     (`accountForLogin`), so a reset sets the password that login checks.
 *  3. Otherwise the only row there is: an account without a password, saved
 *     in another case.
 *  4. Otherwise null — the refusal `accountForLogin` gives, for the same
 *     reason: several accounts differ only in case and the rule cannot pick
 *     one. A reset then sends nothing.
 */
export function accountForAddress(
  rows: readonly AccountRow[],
  email: string,
): AccountRow | null {
  const typed = typedAccountEmail(email);
  const exact = rows.find((row) => row.email === typed);
  if (exact) return exact;
  const login = accountForLogin(rows, email);
  if (login) return login;
  return rows.length === 1 ? rows[0] : null;
}

/**
 * The account a password reset for `email` is for, or null: the one
 * `accountForAddress` picks.
 *
 * One `findAccountsByEmail` read for every address, as login does. The caller
 * mails the account's own stored address, never the spelling typed: the two
 * are one mailbox on every mail host we know of, but the stored one is the
 * address the account holds.
 */
export async function findAccountForAddress(email: string): Promise<AccountRow | null> {
  return accountForAddress(await findAccountsByEmail(email), email);
}
