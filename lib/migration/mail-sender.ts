/**
 * dns.mail's sender inputs, as the migration project keeps them in `settings`: the DKIM
 * selectors, the SPF include and the Return-Path host's label. Unless they say otherwise
 * the sender is Resend, as measured on resend.com's own zone. It lives here and not in
 * ./checks/dns-mail because the store has to tell a change from a call that changes
 * nothing, and that check imports the store.
 */

export type MailSender = { dkimSelectors: string[]; spfInclude: string; spfSubdomain: string };
export const RESEND_SENDER: MailSender = { dkimSelectors: ["resend"], spfInclude: "amazonses.com", spfSubdomain: "send" };
export const DNS_NAME = /^[a-z0-9_]([a-z0-9_.-]*[a-z0-9])?$/;

/** The sender in effect, in one spelling: what is unset or malformed stays Resend's, and the selectors are a set. */
export function mailSenderOf(settings: unknown): MailSender {
  const s = (settings ?? {}) as Record<string, unknown>;
  const name = (v: unknown) => {
    const n = typeof v === "string" ? v.trim().toLowerCase().replace(/\.$/, "") : "";
    return DNS_NAME.test(n) ? n : null;
  };
  const selectors = (Array.isArray(s.dkimSelectors) ? s.dkimSelectors : []).map(name).filter((x): x is string => !!x);
  return { dkimSelectors: selectors.length ? [...new Set(selectors)].sort() : RESEND_SENDER.dkimSelectors, spfInclude: name(s.spfInclude) ?? RESEND_SENDER.spfInclude, spfSubdomain: s.spfSubdomain === "" ? "" : (name(s.spfSubdomain) ?? RESEND_SENDER.spfSubdomain) };
}

/** The sender in effect as one comparable string: a change of sender is a change of this, and a dns.mail run is bound to it. */
export const mailSenderKey = (settings: unknown) => JSON.stringify(mailSenderOf(settings));
