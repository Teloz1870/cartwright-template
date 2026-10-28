import "server-only";

import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Resolver } from "node:dns/promises";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { isBlockedAddress } from "@/lib/import/safe-fetch";
import type { CheckStatus } from "../catalog";
import { currentBindings, currentMigrationProject, type CallMeta } from "../store";

/**
 * MIGD `dns.web` and `dns.ttl` — the domain that moves, read through DNS.
 * The checks are pure over an injected `DnsSeam` (tests pass a fake; the
 * board's runs get `systemDns()`, node:dns with every lookup bounded).
 *
 * The domain is `settings.expectedHost`, else the source's host; its hosts are
 * the bare name and its www twin. The host the project names must resolve; the
 * twin may have no records at all (`absent`, not judged).
 *
 *   dns.web  each host's CNAME names the new site's host, or every A/AAAA
 *            address it resolves to is one of the new site's (its host's
 *            addresses, plus `settings.targetResolve.ip` when set; an IP-literal
 *            new site is its own address) ⇒ pass. A new-site host that resolves
 *            to no address is no destination ⇒ inconclusive.
 *            A new site on a platform alias (`*.vercel.app`) is a special case:
 *            the platform answers a custom domain from other addresses than the
 *            alias, so a CNAME to its edge (`cname.vercel-dns.com`, any
 *            `vercel-dns-NNN.com`) or its documented apex A is a pass (DNS
 *            cannot tell which project answers), and any other mismatch after
 *            the switch is `inconclusive`, not `fail` — `targetResolve.ip` clears it.
 *            Anything else: before the signed-off switch it is what the domain
 *            serves today — `skip`, information, never a failure; after it,
 *            `fail`. Read through the system resolver: what visitors get.
 *   dns.ttl  each host's own zone nameservers (found by NS lookup from that
 *            host upward, public addresses only) are asked for its A/AAAA
 *            records, so the TTL is the one the zone sets — a recursive cache
 *            only shows what is left of it. Above `DNS_TTL_MAX_S` ⇒ warn, at or below ⇒ pass. A CNAME's
 *            own TTL is not readable with node:dns ⇒ inconclusive.
 *
 * A lookup that errors or times out is `inconclusive` (not ready, never a
 * fail); "no such record" is an answer.
 */

export const DNS_CHECKS = ["dns.web", "dns.ttl"] as const;
export type DnsCheckId = (typeof DNS_CHECKS)[number];
export const DNS_TTL_MAX_S = 300;
/** Per lookup, on top of the resolver's own timeout × tries. */
export const DNS_LOOKUP_TIMEOUT_MS = 3_000;

export type DnsAddress = { address: string; ttl: number };
export type DnsResolver = {
  resolve4(host: string): Promise<DnsAddress[]>;
  resolve6(host: string): Promise<DnsAddress[]>;
  resolveCname(host: string): Promise<string[]>;
  resolveNs(host: string): Promise<string[]>;
};
/** `system` = the resolver visitors' lookups go through; `at(servers)` = one that asks only those servers. */
export type DnsSeam = { system: DnsResolver; at(servers: string[]): DnsResolver };

export type DnsHostRow = {
  host: string;
  status: CheckStatus | "absent";
  cname: string[];
  addresses: string[];
  ttl: number | null;
  detail?: string;
};
export type DnsCheckResult = {
  status: CheckStatus;
  domain: string;
  hosts: DnsHostRow[];
  /** dns.web: what the domain must point at. */
  target?: { hosts: string[]; addresses: string[] };
  /** dns.ttl: the zone's nameservers asked. */
  nameservers?: string[];
  detail?: string;
};

function bounded<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("DNS lookup timed out"), { code: "ETIMEOUT" })), DNS_LOOKUP_TIMEOUT_MS);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

function nodeResolver(servers?: string[]): DnsResolver {
  const r = new Resolver({ timeout: 1_500, tries: 2 });
  if (servers) r.setServers(servers);
  return {
    resolve4: (h) => bounded(r.resolve4(h, { ttl: true })),
    resolve6: (h) => bounded(r.resolve6(h, { ttl: true })),
    resolveCname: (h) => bounded(r.resolveCname(h)),
    resolveNs: (h) => bounded(r.resolveNs(h)),
  };
}

/** node:dns, built per call (never at import). */
export function systemDns(): DnsSeam {
  return { system: nodeResolver(), at: (servers) => nodeResolver(servers) };
}

/** Lower case, no trailing dot, no IPv6 brackets (`new URL("http://[::1]").hostname` keeps them). */
const norm = (h: string) => h.toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
/**
 * One spelling per address, so a configured `2001:0db8:0:0::7` and the `2001:db8::7` DNS returns
 * compare equal: IPv6 goes through the URL serializer (RFC 5952 compression); anything it cannot
 * parse (a zone id) keeps its normalised spelling.
 */
const addr = (ip: string) => {
  const n = norm(ip.trim());
  if (isIP(n) !== 6) return n;
  try {
    return new URL(`http://[${n}]`).hostname.slice(1, -1);
  } catch {
    return n;
  }
};
type Read<T> = { ok: true; value: T } | { ok: false; error: string };
/** "No such name / no such record" is an answer (empty); anything else is an error. */
async function read<T>(p: Promise<T[]>): Promise<Read<T[]>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    if (code === "ENODATA" || code === "ENOTFOUND") return { ok: true, value: [] };
    return { ok: false, error: typeof code === "string" ? code : e instanceof Error ? e.message : String(e) };
  }
}

type HostRead = { host: string; cname: string[]; addresses: DnsAddress[]; error: string | null };
async function readHost(r: DnsResolver, host: string): Promise<HostRead> {
  const [cname, v4, v6] = await Promise.all([read(r.resolveCname(host)), read(r.resolve4(host)), read(r.resolve6(host))]);
  const failed = [cname, v4, v6].find((x) => !x.ok);
  return {
    host,
    cname: cname.ok ? cname.value.map(norm) : [],
    addresses: [...(v4.ok ? v4.value : []), ...(v6.ok ? v6.value : [])],
    error: failed && !failed.ok ? failed.error : null,
  };
}

/** The bare name and its www twin; `host` (the one the project names) first. */
export function domainHosts(host: string): string[] {
  const h = norm(host);
  const bare = h.replace(/^www\./, "");
  return h === bare ? [bare, `www.${bare}`] : [h, bare];
}

/** The domain that moves: `settings.expectedHost`, else the source's host. */
export function productionHostOf(project: { sourceUrl: string; settings: unknown }): string {
  const set = (project.settings as { expectedHost?: unknown } | null)?.expectedHost;
  return norm(typeof set === "string" && set.trim() ? set.trim() : new URL(project.sourceUrl).hostname);
}

/** `settings.targetResolve = { host?, ip? }` (spec MIGD) — read defensively, nothing else writes it yet. */
export function targetResolveOf(settings: unknown): { host: string | null; ips: string[] } {
  const tr = (settings as { targetResolve?: { host?: unknown; ip?: unknown } } | null)?.targetResolve;
  const host = typeof tr?.host === "string" && tr.host.trim() ? norm(tr.host.trim()) : null;
  // A host given as an IP literal is an address, not a name to look up.
  const ips = [tr?.ip, host].flat().filter((ip): ip is string => typeof ip === "string" && isIP(norm(ip.trim())) !== 0).map(addr);
  return { host: host && isIP(host) === 0 ? host : null, ips: [...new Set(ips)] };
}

const ORDER = ["fail", "inconclusive", "warn", "skip"] as const;
const overall = (rows: readonly DnsHostRow[]): CheckStatus => {
  const judged = rows.filter((r) => r.status !== "absent").map((r) => r.status);
  return judged.length === 0 ? "inconclusive" : (ORDER.find((s) => judged.includes(s)) ?? "pass");
};
/**
 * Hosting platforms whose alias host serves from other addresses than a custom domain attached to
 * the same project (measured 2026-10-25: demo-cartwright.vercel.app 216.198.79.3, its domain
 * demo.cartwright.app 216.150.1.193), so an address mismatch proves nothing. `edge` = the CNAME
 * target the platform tells owners to set, `apex` = the A record it documents for a bare domain.
 */
const PLATFORMS = [
  { name: "Vercel", alias: /\.vercel\.app$/, edge: /(^|\.)vercel-dns(-\d+)?\.com$/, apex: ["76.76.21.21"] },
] as const;
const listed = (r: HostRead) => [...r.cname.map((c) => `CNAME ${c}`), ...r.addresses.map((a) => a.address)].join(", ");

export async function checkWebDns(
  input: { domain: string; targetUrl: string; targetResolve?: { host: string | null; ips: string[] }; switched: boolean },
  seam: DnsSeam,
): Promise<DnsCheckResult> {
  const { domain, switched } = input;
  const hosts = domainHosts(domain);
  const tr = input.targetResolve ?? { host: null, ips: [] };
  // An IP-literal target is an address, not a name to look up; the domain's own records are no evidence of where it should point.
  const named = [norm(new URL(input.targetUrl).hostname), ...(tr.host ? [tr.host] : [])];
  const literal = named.filter((h) => isIP(h) !== 0).map(addr);
  const targetHosts = [...new Set(named.filter((h) => isIP(h) === 0))].filter((h) => !hosts.includes(h));
  const [targets, reads] = await Promise.all([
    Promise.all(targetHosts.map((h) => readHost(seam.system, h))),
    Promise.all(hosts.map((h) => readHost(seam.system, h))),
  ]);
  const addresses = [...new Set([...tr.ips, ...literal, ...targets.flatMap((t) => t.addresses.map((a) => addr(a.address)))])];
  const target = { hosts: targetHosts, addresses };
  const broken = targets.find((t) => t.error);
  // A new-site host with no address (NXDOMAIN, or a CNAME that dangles) is no destination: a CNAME to it proves nothing.
  const empty = targets.find((t) => t.addresses.length === 0);
  if (broken || empty || (targetHosts.length === 0 && addresses.length === 0)) {
    const detail = broken
      ? `The new site's host ${broken.host} could not be resolved (${broken.error}).`
      : empty
        ? `The new site's host ${empty.host} resolves to no address${empty.cname.length ? ` (CNAME ${empty.cname.join(", ")})` : ""}.`
        : "The new site's address is the domain itself, so there is nothing to compare it with; set settings.targetResolve.";
    return { status: "inconclusive", domain, hosts: [], target, detail };
  }
  const platform = PLATFORMS.find((p) => targetHosts.some((h) => p.alias.test(h)));
  const rows = reads.map((r, i): DnsHostRow => {
    const base = { host: r.host, cname: r.cname, addresses: r.addresses.map((a) => a.address), ttl: null };
    if (r.error) return { ...base, status: "inconclusive", detail: `lookup failed (${r.error})` };
    if (r.cname.length === 0 && r.addresses.length === 0) {
      return i === 0 ? { ...base, status: switched ? "fail" : "skip", detail: "resolves to nothing" } : { ...base, status: "absent", detail: "no records" };
    }
    const viaCname = r.cname.find((c) => targetHosts.includes(c));
    if (viaCname && r.addresses.length === 0) return { ...base, status: "inconclusive", detail: `CNAME to ${viaCname}, but it resolves to no address here` };
    const ours = r.addresses.length > 0 && r.addresses.every((a) => addresses.includes(addr(a.address)));
    if (viaCname || ours) return { ...base, status: "pass", detail: viaCname ? `CNAME to ${viaCname}` : "every address is the new site's" };
    if (platform) {
      const edgeCname = r.cname.find((c) => platform.edge.test(c));
      const apex: readonly string[] = platform.apex;
      if (edgeCname && r.addresses.length === 0) return { ...base, status: "inconclusive", detail: `CNAME to ${edgeCname}, but it resolves to no address here` };
      if (edgeCname || (r.addresses.length > 0 && r.addresses.every((a) => apex.includes(addr(a.address))))) {
        const via = edgeCname ? `CNAME ${edgeCname}` : listed(r);
        return { ...base, status: "pass", detail: `points at ${platform.name}'s edge (${via}), the new site's platform; DNS cannot tell which project answers` };
      }
    }
    if (platform && switched) {
      return { ...base, status: "inconclusive", detail: `resolves to ${listed(r)}, not the alias's addresses; ${platform.name} answers a custom domain from other addresses than its alias, so set settings.targetResolve.ip to the ones it gave the domain` };
    }
    return { ...base, status: switched ? "fail" : "skip", detail: `${switched ? "still resolves" : "resolves today"} to ${listed(r)}, not the new site` };
  });
  return { status: overall(rows), domain, hosts: rows, target };
}

/**
 * A host's zone nameservers: an NS lookup from the host itself upward (a www
 * delegated to its own zone is asked there), their public IPv4 addresses. A
 * name that is a CNAME is skipped: a recursive NS answer for it follows the
 * alias to the target's zone, while the alias record lives in the parent's.
 */
async function zoneServers(host: string, r: DnsResolver): Promise<Read<{ names: string[]; ips: string[] }>> {
  const labels = norm(host).split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const name = labels.slice(i).join(".");
    const ns = await read(r.resolveNs(name));
    if (!ns.ok) return ns;
    if (ns.value.length === 0) continue;
    const alias = await read(r.resolveCname(name));
    if (!alias.ok) return alias;
    if (alias.value.length > 0) continue;
    const names = ns.value.map(norm).slice(0, 3);
    const found = await Promise.all(names.map((n) => read(r.resolve4(n))));
    const ips = [...new Set(found.flatMap((f) => (f.ok ? f.value.map((a) => a.address) : [])))].filter((ip) => !isBlockedAddress(ip));
    if (ips.length) return { ok: true, value: { names, ips } };
    const failed = found.find((f) => !f.ok);
    return { ok: false, error: failed && !failed.ok ? `${failed.error} looking up ${names.join(", ")}` : `no public address for ${names.join(", ")}` };
  }
  return { ok: false, error: "no NS records found" };
}

export async function checkDnsTtl(input: { domain: string }, seam: DnsSeam): Promise<DnsCheckResult> {
  const { domain } = input;
  const hosts = domainHosts(domain);
  const zones = await Promise.all(hosts.map((h) => zoneServers(h, seam.system)));
  const first = zones[0];
  if (!first.ok) return { status: "inconclusive", domain, hosts: [], detail: `The domain's nameservers could not be read (${first.error}).` };
  const resolvers = new Map<string, DnsResolver>();
  const atZone = (ips: string[]) => resolvers.get(ips.join(",")) ?? resolvers.set(ips.join(","), seam.at(ips)).get(ips.join(","))!;
  const reads = await Promise.all(hosts.map((h, i) => {
    const z = zones[i];
    return z.ok ? readHost(atZone(z.value.ips), h) : Promise.resolve<HostRead>({ host: h, cname: [], addresses: [], error: `its nameservers could not be read: ${z.error}` });
  }));
  const rows = reads.map((r, i): DnsHostRow => {
    const base = { host: r.host, cname: r.cname, addresses: r.addresses.map((a) => a.address), ttl: null };
    if (r.error) return { ...base, status: "inconclusive", detail: zones[i].ok ? `lookup failed (${r.error})` : r.error };
    if (r.cname.length > 0) return { ...base, status: "inconclusive", detail: "a CNAME: its TTL cannot be read here; check it at the DNS host" };
    if (r.addresses.length === 0) return { ...base, status: i === 0 ? "inconclusive" : "absent", detail: "no A/AAAA records" };
    const ttl = Math.max(...r.addresses.map((a) => a.ttl));
    return ttl > DNS_TTL_MAX_S
      ? { ...base, ttl, status: "warn", detail: `TTL ${ttl} s: lower it to ${DNS_TTL_MAX_S} s or less a day before the switch` }
      : { ...base, ttl, status: "pass" };
  });
  return { status: overall(rows), domain, hosts: rows, nameservers: [...new Set(zones.flatMap((z) => (z.ok ? z.value.names : [])))] };
}

export type DnsRunOutcome = DnsCheckResult & {
  runId: string; checkId: DnsCheckId; phase: "before" | "after"; finished: true; nextCursor: null;
};

/**
 * One DNS check, finished in one call: the run row bound like any other
 * (`currentBindings`) under ONE audit entry. Needs no frozen map; dns.web
 * needs the new site's address. dns.ttl is a before-the-switch check.
 */
export async function runDnsCheck(checkId: DnsCheckId, actor: AuditActor, opts: CallMeta & { seam?: DnsSeam }): Promise<DnsRunOutcome> {
  const { seam, ...meta } = opts;
  const project = await currentMigrationProject();
  const switched = !!project.switchedAt;
  const domain = productionHostOf(project);
  if (isIP(domain)) throw new Error(`The site's address ${domain} is an IP address; there is no DNS to check.`);
  if (checkId === "dns.ttl" && switched) throw new Error("dns.ttl runs before the DNS switch only; the switch is already signed off.");
  if (checkId === "dns.web" && !project.targetUrl) throw new Error("Set the new site's address first (migration.project_set with targetUrl).");
  const dns = seam ?? systemDns();
  const result = checkId === "dns.web"
    ? await checkWebDns({ domain, targetUrl: project.targetUrl!, targetResolve: targetResolveOf(project.settings), switched }, dns)
    : await checkDnsTtl({ domain }, dns);
  const runId = randomUUID();
  const phase = switched ? "after" : "before";
  await withAudit({ actor, tool: "migration.run_checks", args: { projectId: project.id, checkIds: [checkId], runId }, ...meta }, async () => {
    await prisma.migrationCheckRun.create({
      data: {
        id: runId, projectId: project.id, checkId, phase, status: result.status,
        summary: result as unknown as Prisma.InputJsonObject, bindings: currentBindings(project), actor, finishedAt: new Date(),
      },
    });
    return { runId, status: result.status };
  });
  return { runId, checkId, phase, finished: true, nextCursor: null, ...result };
}
