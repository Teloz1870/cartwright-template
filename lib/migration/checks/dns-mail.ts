import "server-only";

import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { brand } from "@/brand.config";
import type { AuditActor } from "@/lib/audit";
import type { CheckStatus } from "../catalog";
import { mailSenderKey, mailSenderOf, type MailSender } from "../mail-sender";
import { signOffState, withSignOff } from "../ready";
import { currentBindings, currentMigrationProject, recordFinishedRun, type CallMeta } from "../store";
import { norm, productionHostOf, read, systemDns, type DnsResolver, type DnsSeam, type Read } from "./dns";

/**
 * MIGD `dns.mail` — the new mail sender authenticates, and the domain keeps what it
 * had: a site move drops or replaces TXT and MX records without a sound. This is the
 * row's DNS half, pure over the injected `DnsSeam`; it sends no mail. The other half,
 * a test delivery and its spam score, is the owner's sign-off, and the row reads as
 * the worse of the two (ready.ts `withSignOff`).
 *
 * The sending domain is `brand.emails.from`'s, the address the mailer signs for
 * (lib/mailer/resend.ts). Unless the settings say otherwise the sender is Resend, as
 * measured on resend.com's own zone: SPF on the Return-Path host `send.<domain>`, not
 * the bare domain, and DKIM on `resend._domainkey`.
 *
 *   spf    the Return-Path host holds exactly one v=spf1 record, which authorises the
 *          sender's include. On any name read, two records, over 10 lookups, a dead
 *          include or a syntax error are permanent errors (RFC 7208) ⇒ fail. An include
 *          the frozen record had and this one lacks ⇒ warn; an old server's IP may go on purpose.
 *   dkim   each of `settings.dkimSelectors` has a key; an empty `p=` is revoked ⇒ fail.
 *   dmarc  a record at `_dmarc`, or the nearest parent's for a subdomain with none, which
 *          alone is read by its sp=: p=none ⇒ warn, none ⇒ fail.
 *   mx     present, and the frozen set intact: an added or re-prioritised host ⇒ warn.
 *
 * Each compares with the copy `freezeMailRecords` kept in the freeze's snapshot: a
 * record there then and gone now ⇒ fail, by name. No copy ⇒ inconclusive, never a pass.
 * A lookup that errors or times out is inconclusive; "no such record" is an answer.
 */

/** RFC 7208 §4.6.4: past this, SPF is a permanent error for every message. */
export const SPF_LOOKUP_LIMIT = 10;
/** DKIM selectors cannot be listed, so a freeze also asks for the common ones: one that answers may not be lost either. */
const COMMON_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "s1", "s2", "mail", "dkim"];

type RecordKind = "spf" | "dkim" | "dmarc" | "mx";
export type MailDnsRow = { record: RecordKind | "from" | "freeze"; name: string; status: CheckStatus; values: string[]; detail?: string };
export type MailDnsResult = { status: CheckStatus; domain: string; senderDomain: string; spfHost: string; frozenAt: string | null; rows: MailDnsRow[]; detail?: string };
/** Kept in the freeze's snapshot. A key is `"<kind> <dns name>"`; `records` holds the ones with an answer, `errors` the ones that could not be read. */
export type MailSnapshot = { domain: string; senderDomain: string; readAt: string; records: Record<string, string[]>; errors: Record<string, string> };

const IS_RECORD = { spf: /^v=spf1( |$)/i, dmarc: /^v=DMARC1\s*(;|$)/i, dkim: /(^|;)\s*p\s*=/ };
const HAS_KEY = /(^|;)\s*p\s*=\s*[^;\s]/;
const LOST = "it was there at the freeze (retired on purpose? freeze again)";
const unique = <T>(items: readonly T[]) => [...new Set(items)];

const fromDomainOf = (address: string) => {
  const domain = /@([^@\s>]+)>?\s*$/.exec(address)?.[1];
  return domain ? norm(domainToASCII(domain) || domain) : null;
};
const movedDomainOf = (project: { sourceUrl: string; settings: unknown }) => productionHostOf(project).replace(/^www\./, "");
const spfHostOf = (senderDomain: string, sender: MailSender) => (sender.spfSubdomain ? `${sender.spfSubdomain}.${senderDomain}` : senderDomain);
/** A name and its parents down to two labels: where a subdomain's DMARC policy is found. */
const upward = (name: string) => name.split(".").map((_, i, labels) => labels.slice(i).join(".")).filter((n, i) => i === 0 || n.includes("."));

/** What a name holds of one kind of record, as text: a TXT's chunks joined, an MX as "priority host", sorted. */
async function readRecord(kind: RecordKind, name: string, r: DnsResolver): Promise<Read<string[]>> {
  if (kind === "mx") {
    const mx = await read(r.resolveMx(name));
    return mx.ok ? { ok: true, value: mx.value.filter((m) => norm(m.exchange)).map((m) => `${m.priority} ${norm(m.exchange)}`).sort() } : mx;
  }
  const txt = await read(r.resolveTxt(name));
  return txt.ok ? { ok: true, value: txt.value.map((chunks) => chunks.join("").trimEnd()).filter((t) => IS_RECORD[kind].test(t)) } : txt;
}

const readAll = async (keys: readonly string[], r: DnsResolver) =>
  new Map(await Promise.all(keys.map(async (key) => [key, await readRecord(...(key.split(" ") as [RecordKind, string]), r)] as const)));

/** The old records for the freeze's snapshot: the domain that moves, the sending domain, the Return-Path host. What could not be read is noted in `errors`; a site at an IP address has none. */
export async function freezeMailRecords(project: { sourceUrl: string; settings: unknown }, seam: DnsSeam = systemDns(), from: string = brand.emails.from): Promise<MailSnapshot | null> {
  const domain = movedDomainOf(project);
  if (isIP(domain)) return null;
  const senderDomain = fromDomainOf(from) ?? domain;
  const sender = mailSenderOf(project.settings);
  const spfHost = spfHostOf(senderDomain, sender);
  const selectors = unique([...sender.dkimSelectors, ...COMMON_SELECTORS]);
  const keys = unique([domain, senderDomain].flatMap((n) => [`spf ${n}`, `mx ${n}`, `dmarc _dmarc.${n}`, ...selectors.map((s) => `dkim ${s}._domainkey.${n}`)]));
  const reads = await readAll(unique([...keys, `spf ${spfHost}`, `mx ${spfHost}`]), seam.system);
  const records: Record<string, string[]> = {};
  const errors: Record<string, string> = {};
  for (const [key, got] of reads) {
    if (!got.ok) errors[key] = got.error;
    else if (got.value.length > 0) records[key] = got.value;
  }
  return { domain, senderDomain, readAt: new Date().toISOString(), records, errors };
}

export function mailSnapshotOf(snapshot: unknown): MailSnapshot | null {
  const m = (snapshot as { mail?: MailSnapshot } | null)?.mail;
  return m && typeof m.domain === "string" && m.records ? { ...m, errors: m.errors ?? {} } : null;
}

type Verdict = { status: CheckStatus; detail?: string };

type SpfTerm = { passes: boolean; name: string; value: string };
/** RFC 7208 §12: `[qualifier] mechanism`, each taking what it takes (`include` a `:` and a target), or `redirect=target`, which takes no qualifier. */
const SPF_TERM = /^(?:([-+~?]?)(all(?=$)|(?:include|exists|ip4|ip6)(?=:.)|ptr(?=:.|$)|(?:a|mx)(?=:[^/]|\/.|$)):?|(redirect)=(?=.))(\S*)$/i;
/** Any other `name=value` does nothing here: `exp` is no lookup, and a modifier nobody knows is ignored (§6), `include=x` among them. */
const SPF_IDLE_MODIFIER = /^(?!redirect=)[a-z][a-z0-9_.-]*=\S*$/i;
const CIDR4 = String.raw`/(?:\d|[12]\d|3[0-2])`;
const CIDR6 = String.raw`/(?:\d|[1-9]\d|1[01]\d|12[0-8])`;
const DUAL_CIDR = new RegExp(`(?:${CIDR4})?(?:/${CIDR6})?$`);
const SPF_LENGTH: Record<string, RegExp | undefined> = { ip4: new RegExp(`${CIDR4}$`), ip6: new RegExp(`${CIDR6}$`), a: DUAL_CIDR, mx: DUAL_CIDR };
const SPF_MACRO = /%(?:\{[slodiphcrtv]\d*r?[-.+,/_=]*\}|[%_-])/gi;
/** §12's domain-spec, a space standing for each macro (a term holds none): visible text ending in a macro or `.toplabel`. §4.3 adds no label empty or over 63; a slash first is `a/24` with junk behind it. */
const SPF_DOMAIN = /^(?![./]|.*\.\.|.*[^.]{64})[ -$&-~]*(?: |\.(?!\d+\.?$)[a-z\d](?:[a-z\d-]*[a-z\d])?\.?)$/i;

/** A term's target by §12, read and never looked up. Empty is for SPF_TERM to refuse, where the term needs one. */
function isSpfTarget(name: string, value: string): boolean {
  const target = value.replace(SPF_LENGTH[name] ?? "", "");
  if (name === "ip4") return isIP(target) === 4;
  if (name === "ip6") return isIP(target) === 6 && !target.includes("%"); // isIP takes a zone (`fe80::1%eth0`); §12 does not.
  return !target || SPF_DOMAIN.test(target.replace(SPF_MACRO, " "));
}

/**
 * A record's terms, between spaces and nothing else. Anything else, a malformed target among it, is a syntax error, which voids the whole record, even past `all` (§4.6): `broken` names it, and the record has no terms.
 * `terms` are the ones ever reached: a mechanism after `all` is not, and `all` voids a `redirect` (§5.1, §6.1).
 */
function spfTerms(record: string): { terms: SpfTerm[]; broken: string | null } {
  const terms: SpfTerm[] = [];
  for (const raw of record.split(/ +/).slice(1)) {
    if (SPF_IDLE_MODIFIER.test(raw)) continue;
    const m = SPF_TERM.exec(raw);
    if (!m) return { terms: [], broken: raw };
    const term = { passes: !m[1] || m[1] === "+", name: (m[2] ?? m[3]).toLowerCase(), value: m[4] };
    if (!isSpfTarget(term.name, term.value)) return { terms: [], broken: raw };
    terms.push(term);
  }
  const all = terms.findIndex((t) => t.name === "all");
  return { terms: all < 0 ? terms : terms.slice(0, all).filter((t) => t.name !== "redirect"), broken: null };
}
const spfIncludes = (record: string) => spfTerms(record).terms.filter((t) => t.passes && (t.name === "include" || t.name === "redirect")).map((t) => norm(t.value));

/**
 * Walk a record through its includes, as a receiver would: every include, a, mx, ptr, exists and redirect is one
 * lookup, and the walk stops past the limit, so a loop ends. `includes` can authorise a sender: none at or below a `-`, `~` or `?` include.
 */
async function walkSpf(record: string, r: DnsResolver) {
  const walk = { lookups: 0, includes: new Set<string>(), permanent: null as string | null, error: null as string | null };
  const visit = async (text: string, authorising: boolean): Promise<void> => {
    const { terms, broken } = spfTerms(text);
    if (broken) { walk.permanent = `"${broken}" is not valid SPF: a permanent error (RFC 7208) for mail that reaches it`; return; }
    for (const term of terms) {
      if (!["include", "a", "mx", "ptr", "exists", "redirect"].includes(term.name)) continue;
      if (++walk.lookups > SPF_LOOKUP_LIMIT) return;
      if (term.name !== "include" && term.name !== "redirect") continue;
      const target = norm(term.value);
      // A macro needs the message to expand, so what lies below it is unknowable here.
      if (target.includes("%{")) { walk.error = `${term.name} ${target} cannot be followed without a message`; return; }
      const passes = authorising && term.passes;
      if (passes) walk.includes.add(target);
      const got = await readRecord("spf", target, r);
      if (!got.ok) { walk.error = `${target}: ${got.error}`; return; }
      if (got.value.length !== 1) { walk.permanent = `${term.name} ${target} has ${got.value.length} SPF records: a permanent error (RFC 7208) for mail that reaches it`; return; }
      await visit(got.value[0], passes);
      if (walk.lookups > SPF_LOOKUP_LIMIT || walk.permanent || walk.error) return;
    }
  };
  await visit(record, true);
  return walk;
}

async function judgeSpf(values: string[], was: string[] | null, mustInclude: string | null, r: DnsResolver): Promise<Verdict> {
  if (values.length === 0) {
    if (was?.length) return { status: "fail", detail: `no SPF record; ${LOST}` };
    return mustInclude ? { status: "fail", detail: `no SPF record: the new sender needs one with include:${mustInclude}` } : { status: "pass", detail: "no SPF record here, none at the freeze" };
  }
  if (values.length > 1) return { status: "fail", detail: `${values.length} v=spf1 records: a permanent error (RFC 7208), so SPF fails for all mail; merge them into one` };
  const walk = await walkSpf(values[0], r);
  if (walk.lookups > SPF_LOOKUP_LIMIT) return { status: "fail", detail: `over ${SPF_LOOKUP_LIMIT} DNS lookups: a permanent error (RFC 7208), so SPF fails for all mail` };
  if (walk.permanent) return { status: "fail", detail: walk.permanent };
  if (walk.error) return { status: "inconclusive", detail: `lookup failed (${walk.error})` };
  if (mustInclude && !walk.includes.has(mustInclude)) return { status: "fail", detail: `does not authorise the new sender: no include:${mustInclude}` };
  const gone = (was ?? []).flatMap(spfIncludes).filter((i) => !walk.includes.has(i));
  if (gone.length) return { status: "warn", detail: `no longer authorises ${gone.map((i) => `include:${i}`).join(", ")}, which it did at the freeze: mail sent through it now fails SPF (retired on purpose? freeze again)` };
  return { status: "pass", detail: `${walk.lookups} DNS lookup${walk.lookups === 1 ? "" : "s"}` };
}

function judgeDkim(values: string[], was: string[] | null, needed: boolean): Verdict {
  const keys = values.filter((v) => HAS_KEY.test(v));
  const had = (was ?? []).filter((v) => HAS_KEY.test(v));
  if (keys.length === 0) {
    if (had.length) return { status: "fail", detail: `no DKIM key; ${LOST}` };
    return needed ? { status: "fail", detail: values.length ? "the key is revoked (empty p=)" : "no DKIM record: the new sender needs this selector" } : { status: "pass" };
  }
  if (had.length && !had.some((k) => keys.includes(k))) return { status: "warn", detail: "the key differs from the freeze: a key cut short in a copy breaks every signature" };
  return { status: "pass" };
}

function judgeDmarc(values: string[], was: string[] | null, parent: boolean): Verdict {
  if (values.length === 0) return { status: "fail", detail: was?.length ? `no DMARC record; ${LOST}` : "no DMARC record" };
  if (values.length > 1) return { status: "fail", detail: `${values.length} DMARC records: receivers ignore them all (RFC 7489)` };
  const tags = new Map(values[0].split(";").map((t): [string, string] => { const [k, v = ""] = t.split("="); return [k.trim().toLowerCase(), v.trim().toLowerCase()]; }));
  const tag = parent && tags.has("sp") ? "sp" : "p";
  const policy = tags.get(tag);
  if (policy === "quarantine" || policy === "reject") return { status: "pass" };
  return { status: "warn", detail: policy === "none" ? `${tag}=none: receivers report failures but act on none of them` : `no valid ${tag}= tag: receivers act on none of its failures` };
}

function judgeMx(values: string[], was: string[] | null): Verdict {
  const hosts = (mx: readonly string[]) => mx.map((m) => m.split(" ")[1]);
  const gone = hosts(was ?? []).filter((h) => !hosts(values).includes(h));
  if (gone.length) return { status: "fail", detail: `${gone.join(", ")} is gone; ${LOST}` };
  if (values.length === 0) return { status: "fail", detail: "no MX records: mail to this domain bounces" };
  if (was && values.join() !== was.join()) return { status: "warn", detail: `changed since the freeze (was: ${was.join(", ") || "none"})` };
  return { status: "pass" };
}

const ORDER = ["fail", "inconclusive", "warn"] as const;

export async function checkMailDns(input: { domain: string; from: string; sender: MailSender; frozen: MailSnapshot | null }, seam: DnsSeam): Promise<MailDnsResult> {
  const { domain, from, sender } = input;
  const fromDomain = fromDomainOf(from);
  const senderDomain = fromDomain ?? domain;
  const spfHost = spfHostOf(senderDomain, sender);
  const frozen = input.frozen?.domain === domain && input.frozen.senderDomain === senderDomain ? input.frozen : null;
  const frozenKeys = Object.keys(frozen?.records ?? {});
  const chain = upward(senderDomain).map((n) => `_dmarc.${n}`);
  const needed = unique([`spf ${spfHost}`, `spf ${senderDomain}`, `spf ${domain}`, ...sender.dkimSelectors.map((s) => `dkim ${s}._domainkey.${senderDomain}`), `mx ${senderDomain}`]);
  const live = await readAll(unique([...needed, ...chain.map((n) => `dmarc ${n}`), ...frozenKeys]), seam.system);
  // The nearest name with a record; one that could not be read is not skipped over.
  const policy = chain.find((n) => { const got = live.get(`dmarc ${n}`); return !got?.ok || got.value.length > 0; }) ?? chain[0];
  const rows: MailDnsRow[] = await Promise.all(unique([...needed, `dmarc ${policy}`, ...frozenKeys]).map(async (key): Promise<MailDnsRow> => {
    const [kind, name] = key.split(" ") as [RecordKind, string];
    const got = live.get(key);
    if (!got?.ok) return { record: kind, name, status: "inconclusive", values: [], detail: `lookup failed (${got?.error})` };
    const was = !frozen || key in frozen.errors ? null : (frozen.records[key] ?? []);
    const verdict = kind === "spf" ? await judgeSpf(got.value, was, name === spfHost ? sender.spfInclude : null, seam.system)
      : kind === "dkim" ? judgeDkim(got.value, was, needed.includes(key))
      : kind === "dmarc" ? judgeDmarc(got.value, was, name === policy && name !== chain[0])
      : judgeMx(got.value, was);
    return { record: kind, name, values: got.value, ...verdict };
  }));
  const unread = Object.keys(frozen?.errors ?? {});
  const noCopy = !input.frozen ? "No frozen copy of the old mail records to compare with: freeze again (migration.freeze_sitemap), which reads them."
    : !frozen ? `The frozen mail records were read for ${input.frozen.domain} sending from ${input.frozen.senderDomain}, not ${domain} from ${senderDomain}: freeze again.`
    : unread.length ? `The freeze could not read ${unread.join(", ")}: freeze again.`
    : null;
  if (noCopy) rows.unshift({ record: "freeze", name: domain, status: "inconclusive", values: [], detail: noCopy });
  if (!fromDomain) rows.unshift({ record: "from", name: from, status: "inconclusive", values: [], detail: "the shop's from address (emails.from in brand.config.ts) has no domain" });
  else if (fromDomain !== domain && !fromDomain.endsWith(`.${domain}`) && !domain.endsWith(`.${fromDomain}`)) rows.unshift({ record: "from", name: fromDomain, status: "warn", values: [], detail: `the shop sends as ${from} (emails.from in brand.config.ts), not from the domain that moves (${domain})` });
  const status = ORDER.find((s) => rows.some((row) => row.status === s)) ?? "pass";
  const reasons = ORDER.flatMap((s) => rows.filter((row) => row.status === s)).map((row) => `${row.record} ${row.name}: ${row.detail}`);
  return { status, domain, senderDomain, spfHost, frozenAt: frozen?.readAt ?? null, rows, ...(reasons.length ? { detail: reasons.join(" · ") } : {}) };
}

/**
 * One dns.mail run, finished in one call, before or after the switch: after it is when a move's lost records show.
 * The run row holds the DNS half (`dnsStatus`) and the board reads it with the sign-off, so a sign-off made afterwards
 * counts without another run, and one that fails turns the row at once. `status` is the row.
 * The lookups take seconds, so the project is read again after them: what landed meanwhile is in the answer, and a change of
 * sender voids this run as it voids the ones before it (store.ts `setMailSender`). One landing after that read finds the run bound to the sender it read.
 */
export async function runMailDnsCheck(actor: AuditActor, opts: CallMeta & { seam?: DnsSeam }) {
  const { seam, ...meta } = opts;
  const startedAt = new Date();
  const project = await currentMigrationProject();
  const domain = movedDomainOf(project);
  if (isIP(domain)) throw new Error(`The site's address ${domain} is an IP address; there is no DNS to check.`);
  const frozen = mailSnapshotOf(project.snapshot);
  const result = await checkMailDns({ domain, from: brand.emails.from, sender: mailSenderOf(project.settings), frozen }, seam ?? systemDns());
  const latest = await currentMigrationProject();
  const mailSender = mailSenderKey(project.settings);
  if (mailSenderKey(latest.settings) !== mailSender) throw new Error("The mail sender changed while its records were read, so this run was not saved. Run it again.");
  const bindings = { ...currentBindings(project), mailSender };
  const runId = await recordFinishedRun(project, { checkId: "dns.mail", status: result.status, summary: result, bindings, startedAt }, actor, meta);
  const signOff = signOffState((latest.attestations as Record<string, unknown> | null)?.["dns.mail"], new Date(), currentBindings(latest));
  const row = withSignOff({ checkId: "dns.mail", status: result.status, finishedAt: new Date(), bindings, detail: result.detail }, signOff);
  return { ...result, runId, checkId: "dns.mail" as const, phase: project.switchedAt ? ("after" as const) : ("before" as const), finished: true as const, nextCursor: null, status: row.status as CheckStatus, dnsStatus: result.status, signOff, ...(row.detail ? { detail: row.detail } : {}) };
}
