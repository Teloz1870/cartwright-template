/**
 * Why a magic link was not sent, as the login form is told it.
 *
 * Auth.js answers every error thrown from `sendVerificationRequest` with
 * `?error=Configuration` — the same answer a database outage, a malformed
 * address or a bug gets — so the form could not tell "you asked too often"
 * from "the mail provider refused the link". A `CredentialsSignin` is the one
 * error Auth.js passes to the client with a code of our choosing: it sets
 * `?code=` from `error.code` (@auth/core index.js), and next-auth/react's
 * `signIn` returns it as `result.code`. The provider in lib/auth.ts throws one
 * carrying a code below; this module holds only the codes and the mapping, so
 * the client form can import it without pulling in the server.
 *
 * Neither code says anything about an account: the per-address limit runs
 * before the account is looked up, and a refused send fails for whoever it
 * was sent to.
 */
export const MAGIC_LINK_ERROR_CODE = {
  /** The per-address limit stopped the request; nothing was sent. */
  rateLimited: "magic_link_rate_limited",
  /** The link was made but the mail provider refused it. */
  sendFailed: "magic_link_send_failed",
} as const;

/** The `Login` message the form shows for a `signIn("email")` result with an error. */
export function magicLinkErrorMessageKey(result: {
  error?: string | null;
  code?: string | null;
}): "magicTooManyRequests" | "magicSendFailed" | "magicGenericError" {
  if (result.code === MAGIC_LINK_ERROR_CODE.rateLimited) return "magicTooManyRequests";
  if (result.code === MAGIC_LINK_ERROR_CODE.sendFailed) return "magicSendFailed";
  return "magicGenericError";
}
