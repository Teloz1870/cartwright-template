import type { BadgeTone } from "@/components/admin/ui";

/**
 * The badge an audit row's actor gets in /admin/audit. Its own module (not the
 * page) so a test can call it: a page file may export only what Next allows.
 *
 * One entry per actor prefix the engine writes — the `AuditActor` union in
 * `lib/audit.ts`, plus the two writers that put rows straight in the table:
 * the Stripe webhook and the admin upload route (`admin:<email>`). A prefix
 * missing here renders as "Unknown", which is how the refund, dispute and
 * payment_not_applied rows (`stripe-webhook:system`) looked until this list
 * named them.
 */
export function actorLabel(raw: string): { label: string; tone: BadgeTone } {
  if (raw.startsWith("apikey:")) return { label: "AI (API-key)", tone: "info" };
  // Known gap: `user:<id>` is not only the admin. A signed-in customer's own
  // subscription cancel/pause/resume (app/[locale]/account/subscriptions/
  // actions.ts) writes the same prefix with the customer's id, so those rows
  // are badged "Admin (web)" too. The actor string carries an id, not a role,
  // so this function cannot tell them apart; that needs a distinct prefix
  // where the row is written, not a guess here.
  if (raw.startsWith("user:") || raw.startsWith("admin:")) return { label: "Admin (web)", tone: "neutral" };
  if (raw.startsWith("operator-chat:")) return { label: "Admin (chat)", tone: "info" };
  if (raw.startsWith("annotation:")) return { label: "Admin (in-place edit)", tone: "info" };
  if (raw.startsWith("storefront-chat:")) return { label: "Customer chat", tone: "attention" };
  if (raw.startsWith("storefront-voice:")) return { label: "Customer voice", tone: "attention" };
  // Unauthenticated by protocol (RFC 7591), so it gets its own badge rather
  // than falling through to "Unknown" — an open registration endpoint is the
  // one actor an operator most needs to be able to pick out of this list.
  // `warning`: `attention` is already the customer-chat tone, and `critical`
  // is the red this same row uses for the failure badge — a SUCCESSFUL
  // registration must not render as an error.
  if (raw.startsWith("oauth-register:"))
    return { label: "Client registration", tone: "warning" };
  if (raw.startsWith("stripe-webhook:")) return { label: "Stripe webhook", tone: "neutral" };
  if (raw.startsWith("system:")) return { label: "System", tone: "neutral" };
  return { label: "Unknown", tone: "neutral" };
}
