/**
 * The bot guard on customer sign-up (AUTH-REG1), shared by the form and the
 * server action so the two can never disagree on a field name.
 *
 * Three layers, cheapest first, all invisible to a person filling in the form:
 *  1. a honeypot field a person never sees, so only a bot fills it — answered
 *     with the same success a real sign-up gets, and no account is created;
 *  2. a minimum fill time, measured by the form from mount to submit;
 *  3. a per-IP rate limit (`registerPerIpLimiter` in lib/rate-limit.ts), keyed
 *     by `trustedClientIp`, after validation so a typo costs nothing.
 *
 * Deliberately free of `server-only`: the client form imports the names.
 */

/**
 * Hidden field a person never sees or tabs to. Deliberately NOT a name browser
 * or password-manager autofill recognises (`website`, `url`, `company` …):
 * autofill ignores `autocomplete="off"`, and a filled honeypot silently drops
 * the sign-up. Bots that fill every input still fill it.
 */
export const REGISTER_HONEYPOT_FIELD = "cw_hp";

/** Milliseconds between the form mounting and the submit, sent by the form. */
export const REGISTER_ELAPSED_FIELD = "elapsedMs";

/** A sign-up submitted faster than this is refused (a person can resubmit). */
export const REGISTER_MIN_FILL_MS = 3000;

/** True when the form says it was filled in at least `REGISTER_MIN_FILL_MS`. */
export function filledSlowlyEnough(raw: FormDataEntryValue | null): boolean {
  if (typeof raw !== "string" || !/^\d{1,12}$/.test(raw)) return false;
  return Number(raw) >= REGISTER_MIN_FILL_MS;
}

/**
 * True when the honeypot carries a value. Whitespace alone counts as empty, so
 * a stray space from an assistive tool never costs a person their account.
 */
export function honeypotFilled(raw: FormDataEntryValue | null): boolean {
  return typeof raw === "string" ? raw.trim().length > 0 : raw !== null;
}
