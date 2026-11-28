import "server-only";

import type { Adapter, VerificationToken } from "next-auth/adapters";
import { accountForAddress, findAccountsByEmail } from "@/lib/auth/account-email";

/**
 * A magic link opens the account held for its address, whatever the case it
 * was saved in (REG-EMAIL-CASE-c).
 *
 * Auth.js lowercases the address a customer types (`send-token.js`,
 * `defaultNormalizer`) and later signs in to the account its adapter finds
 * spelled exactly like that (`getUserByEmail`, a unique-index lookup). An
 * account saved before sign-up lowercased — `Ada@Example.com` — was therefore
 * never found, and the first link made a second, password-less account
 * `ada@example.com` next to it.
 *
 * The account is bound when the link is ISSUED, not when it is used: the token
 * row is filed under the account's stored spelling, and the link names that
 * same spelling, so Auth.js's own `useVerificationToken` and `getUserByEmail`
 * find the account exactly — no fallback, no second lookup when the link is
 * clicked, and an account changed between the two cannot redirect the link to
 * another spelling. A link edited to any other spelling matches no token.
 *
 * Auth.js asks for the link to be sent (`sendVerificationRequest`, where our
 * rate limits run) and for the token to be filed (`createVerificationToken`)
 * at the same time (`Promise.all`), handing both the same `expires` — and it
 * files a token for EVERY request, also one the limits stopped. The two calls
 * share no request identity (the adapter sees only the hashed token), so the
 * pairing is by `(address, expires)`, and requests sharing that pair form one
 * group that answers as one:
 *
 * - every request joins its group synchronously, as its send starts — before
 *   Auth.js can file its token (it awaits a hash in between);
 * - a request past the limits looks the account up (`bind`), once per group;
 *   a stopped one only says it is done (`close`), and is not looked up;
 * - each token filed in the group waits until either some request bound — it
 *   then goes under that answer — or every request so far said it is done
 *   without binding — it then goes under the address as given.
 *
 * So a sent link's token goes under the spelling the link names, in whatever
 * order the hashes finish: its own request is in the group and undecided until
 * it binds. A stopped request's token may take a group-mate's answer; no link
 * carries it, so that opens nothing. Lone requests — the normal case — behave
 * exactly as one request did before.
 *
 * One exception, failing closed: when 256 groups are open at once, the cap
 * drops one (`capVictim`) — a group whose requests were all stopped first,
 * which changes nothing; else the oldest still deciding; a bound group only
 * when every open group is bound. A token of a dropped group, waiting or filed
 * later, goes under the address as given. If that group's link names a stored
 * spelling, it opens nothing — never another account — and the customer asks
 * for a new one.
 * `tests/unit/magic-link-account-case.test.ts` reads the installed
 * `send-token.js` and fails if `expires` stops reaching both calls.
 */

/** What a link for one address is: the spelling it names, or none sent. */
export type MagicLinkTarget = { identifier: string } | null;

type Group = {
  /** Requests that joined, requests that bound or closed, tokens filed. */
  members: number;
  decided: number;
  filed: number;
  /** The lookup, once a request in the group got past the limits. */
  target: Promise<MagicLinkTarget> | null;
  waiters: Array<(target: Promise<MagicLinkTarget> | null) => void>;
  expiresAt: number;
};

/**
 * Open groups, by `(address, expires)`. A group lives for the microseconds
 * until its last token is filed; the TTL and the cap only bound what a token
 * that never comes (a thrown hash, a crashed request) could leave.
 */
const groups = new Map<string, Group>();
const BINDING_TTL_MS = 60_000;
const MAX_BINDINGS = 256;

function groupKey(identifier: string, expires: Date): string {
  return `${identifier}\u0000${expires.getTime()}`;
}

/** Hands waiting tokens their answer once the group has one. */
function settle(group: Group, force = false): void {
  let answer: Promise<MagicLinkTarget> | null;
  if (group.target) answer = group.target;
  else if (force || group.decided >= group.members) answer = null;
  else return;
  for (const wake of group.waiters.splice(0)) wake(answer);
}

function drop(key: string, group: Group): void {
  if (groups.get(key) === group) groups.delete(key);
  // A token still waiting goes under the address as given: its link then
  // opens nothing, never another account.
  settle(group, true);
}

function sweep(now: number): void {
  for (const [key, group] of groups) {
    if (group.expiresAt <= now) drop(key, group);
  }
  while (groups.size >= MAX_BINDINGS) {
    const [key, group] = capVictim();
    drop(key, group);
  }
}

/**
 * The group the cap drops: the one whose loss costs least, oldest first (a Map
 * keeps insertion order). A group every request closed unbound has its final
 * answer already — the address as given, which is also what a token finds when
 * its group is gone — so dropping it changes nothing. A group still deciding
 * loses only a lookup it may not need; a bound group loses the answer its sent
 * link names, so it goes last.
 */
function capVictim(): [string, Group] {
  let undecided: [string, Group] | null = null;
  let bound: [string, Group] | null = null;
  for (const entry of groups) {
    const group = entry[1];
    if (group.target) bound ??= entry;
    else if (group.decided < group.members) undecided ??= entry;
    else return entry;
  }
  return (undecided ?? bound)!;
}

/**
 * The spelling a link for `identifier` names, or null when the rule cannot pick
 * one account: the account a password reset for this address is for
 * (`accountForAddress`), so both land on one account — exact spelling first, a
 * row saved in another case only when it is the one the rule picks. No account
 * at all: the address as given, so a new customer signs up as before.
 */
async function resolveTarget(identifier: string): Promise<MagicLinkTarget> {
  const rows = await findAccountsByEmail(identifier);
  if (rows.length === 0) return { identifier };
  const account = accountForAddress(rows, identifier);
  return account ? { identifier: account.email } : null;
}

/** One magic-link request's part in its group. */
export type MagicLinkRequest = {
  /** Past the limits: the account this link is for (looked up once per group). */
  bind(): Promise<MagicLinkTarget>;
  /** Done; a request that did not bind is counted as sending nothing. Idempotent. */
  close(): void;
};

/**
 * Joins the group for `(identifier, expires)`. Call it as the first, synchronous
 * statement of `sendVerificationRequest`, before the limits, and `close()` it in
 * a `finally` — a request that never says it is done holds its group's tokens
 * until the TTL.
 */
export function openMagicLinkRequest(identifier: string, expires: Date): MagicLinkRequest {
  const now = Date.now();
  const key = groupKey(identifier, expires);
  let group = groups.get(key);
  if (!group || group.expiresAt <= now) {
    sweep(now);
    group = { members: 0, decided: 0, filed: 0, target: null, waiters: [], expiresAt: now + BINDING_TTL_MS };
    groups.set(key, group);
  }
  const own = group;
  own.members += 1;
  let done = false;
  return {
    bind() {
      if (!own.target) {
        own.target = resolveTarget(identifier);
        // The tokens' side awaits this too; a failed lookup must not also
        // surface as an unhandled rejection when no token waits for it.
        own.target.catch(() => {});
      }
      if (!done) {
        done = true;
        own.decided += 1;
      }
      settle(own);
      return own.target;
    },
    close() {
      if (done) return;
      done = true;
      own.decided += 1;
      settle(own);
    },
  };
}

/** The answer a token filed for `(identifier, expires)` goes under; null: as given. */
function takeAnswer(identifier: string, expires: Date): Promise<MagicLinkTarget> | null {
  const key = groupKey(identifier, expires);
  const group = groups.get(key);
  if (!group) return null;
  if (group.expiresAt <= Date.now()) {
    drop(key, group);
    return null;
  }
  group.filed += 1;
  if (group.filed >= group.members) groups.delete(key);
  return new Promise<MagicLinkTarget>((resolve, reject) => {
    group.waiters.push((answer) => (answer ? answer.then(resolve, reject) : resolve(null)));
    settle(group);
  });
}

/** `url` with its `email` parameter naming `identifier`; unchanged when it already does. */
export function magicLinkUrlFor(url: string, identifier: string): string {
  const link = new URL(url);
  if (link.searchParams.get("email") === identifier) return url;
  link.searchParams.set("email", identifier);
  return link.toString();
}

/**
 * The adapter, with `createVerificationToken` filing each token under the
 * spelling its link names. Every other method is the adapter's own.
 */
export function withMagicLinkAccountBinding(adapter: Adapter): Adapter {
  const create = adapter.createVerificationToken?.bind(adapter);
  if (!create) return adapter;
  return {
    ...adapter,
    async createVerificationToken(token: VerificationToken) {
      const pending = takeAnswer(token.identifier, token.expires);
      // A failed lookup sends no link (the send side throws with it): the
      // token then goes under the address as given.
      const target = pending ? await pending.catch(() => null) : null;
      return create(target ? { ...token, identifier: target.identifier } : token);
    },
  };
}

/** Test seam: forget every open group. */
export function resetMagicLinkBindings(): void {
  groups.clear();
}

/** Test seam: how many groups are waiting for a token. */
export function pendingMagicLinkBindings(): number {
  return groups.size;
}
