import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * SSRF-guarded fetch for pulling REMOTE, user/agent-supplied asset URLs (the
 * site-import pipeline hands us image/video URLs scraped from an arbitrary
 * site). Fetching an attacker-influenced URL server-side is a classic SSRF
 * vector — without guards a caller could make the server hit cloud-metadata
 * (169.254.169.254), localhost admin ports, or internal services.
 *
 * Defenses, layered:
 *   1. scheme allowlist — only http/https (no file:, gopher:, data:, …)
 *   2. host allowlist — reject localhost / *.local / *.internal by name
 *   3. address block — reject loopback / private / link-local / CGNAT / ULA,
 *      checked on BOTH a literal-IP host AND every DNS-resolved address
 *   4. redirect re-validation — each hop is re-checked (a public URL can 302
 *      to a private one), capped at maxHops
 *   5. size cap — streamed, so an oversized body is aborted mid-read (never
 *      fully buffered) — and a Content-Length over the cap is rejected early
 *   6. timeout — AbortController so a slow/hanging host can't pin the request
 *
 * KNOWN RESIDUAL — DNS rebinding (TOCTOU): assertResolvedAddressesPublic()
 * resolves the host and validates the IPs, but fetch() then does its OWN
 * resolution to connect, so a hostile domain with a short TTL could return a
 * public IP at check-time and a private one at connect-time. Fully closing this
 * means pinning the socket to the validated IP (an undici Agent with a custom
 * connect.lookup) — a version-coupled change deferred as a follow-up. Accepted
 * for now because the tool is admin-scoped (settings:write, never in any
 * customer/voice tool allowlist), so reaching it already requires a privileged
 * key. The literal-IP + resolved-IP + per-redirect-hop checks below close the
 * far more common SSRF vectors.
 *
 * Also out of scope (exotic, and only reachable by passing a raw IPv6-LITERAL
 * URL — a normal import passes a hostname, whose real resolved IP we DO check):
 * Teredo (2001:0::/32, XOR-obfuscated embedded v4) and network-specific NAT64
 * prefixes (only the well-known 64:ff9b::/96 is decoded). The standard mapped /
 * compatible / NAT64-well-known / 6to4 encodings ARE decoded below.
 */

/** Is this IP literal one we must never fetch (private / loopback / link-local)? */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) return isBlockedIpv6(ip.toLowerCase());
  return true; // not a valid IP literal → block defensively
}

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-host / private / loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

/** Expand an IPv6 string to its 8 hextets (numbers), or null if unparseable. */
function expandIpv6(input: string): number[] | null {
  let ip = input.split("%")[0]; // drop a zone id (fe80::1%eth0)
  // An embedded dotted-IPv4 tail (::ffff:127.0.0.1) → two hextets, so the rest
  // of the expansion is uniform.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = tail.split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    ip = ip.slice(0, lastColon + 1) + (((v4[0] << 8) | v4[1]).toString(16) + ":" + (((v4[2] << 8) | v4[3]) >>> 0).toString(16));
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const back = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const fill = 8 - head.length - back.length;
    if (fill < 0) return null;
    groups = [...head, ...Array<string>(fill).fill("0"), ...back];
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (g === "" ? 0 : parseInt(g, 16)));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/** Two hextets → an IPv4 dotted string (the embedded v4 of a transition addr). */
function v4From(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isBlockedIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  if (!h) return true; // unparseable → block defensively
  if (h.every((x) => x === 0)) return true; // :: unspecified
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[6] === 0 && h[7] === 1 && (h[5] === 0 || h[5] === 0xffff)) {
    return true; // ::1 loopback (and ::ffff:0:1 mapped-loopback shorthand)
  }
  // Any encoding that EMBEDS an IPv4 → extract it and apply the v4 ranges, so a
  // private/metadata v4 can't be smuggled through an IPv6 wrapper. Covers:
  //   ::ffff:a.b.c.d / ::ffff:7f00:1 (mapped, incl. hex shorthand)
  //   ::a.b.c.d                      (IPv4-compatible, deprecated)
  //   64:ff9b::a.b.c.d               (NAT64 well-known prefix — cloud SSRF vector)
  //   2002:V4HI:V4LO::               (6to4)
  const topZero = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0;
  if (topZero && (h[5] === 0xffff || h[5] === 0)) {
    return isBlockedIpv4(v4From(h[6], h[7]));
  }
  if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return isBlockedIpv4(v4From(h[6], h[7])); // NAT64 64:ff9b::/96
  }
  if (h[0] === 0x2002) {
    return isBlockedIpv4(v4From(h[1], h[2])); // 6to4 2002::/16
  }
  if (h[0] >= 0xfc00 && h[0] <= 0xfdff) return true; // ULA fc00::/7
  if (h[0] >= 0xfe80 && h[0] <= 0xfebf) return true; // link-local fe80::/10
  return false;
}

/** Validate scheme + hostname shape synchronously. Throws on anything unsafe. */
export function parseAndValidateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Refusing to fetch an internal host.");
  }
  // URL.hostname wraps IPv6 literals in brackets ("[::1]"), which isIP rejects —
  // strip them so the literal-IP block actually fires. A name is checked after
  // DNS resolution.
  const ipHost = host.replace(/^\[|\]$/g, "");
  if (isIP(ipHost) && isBlockedAddress(ipHost)) {
    throw new Error("Refusing to fetch a private/loopback address.");
  }
  return url;
}

/** Resolve a hostname and block if ANY returned address is private. */
async function assertResolvedAddressesPublic(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return; // already checked as a literal in parseAndValidateUrl
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }
  if (addrs.length === 0) throw new Error(`Could not resolve host: ${hostname}`);
  for (const a of addrs) {
    if (isBlockedAddress(a.address)) {
      throw new Error("Refusing to fetch a host that resolves to a private address.");
    }
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error("Remote file exceeds the size limit.");
    return Buffer.from(ab);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Remote file exceeds the size limit.");
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

export type RemoteAsset = { buffer: Buffer; contentType: string; finalUrl: string };

/**
 * Fetch a remote asset with the full SSRF guard. Follows up to `maxHops`
 * redirects, re-validating each hop. Throws on any guard violation, a non-2xx
 * response, an over-cap body, or a timeout.
 */
export async function fetchRemoteAsset(
  raw: string,
  opts: { maxBytes: number; timeoutMs?: number; maxHops?: number } = { maxBytes: 10_000_000 },
): Promise<RemoteAsset> {
  const maxBytes = opts.maxBytes;
  const maxHops = opts.maxHops ?? 3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    let current = raw;
    for (let hop = 0; ; hop++) {
      const url = parseAndValidateUrl(current);
      await assertResolvedAddressesPublic(url.hostname);
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "image/*,video/mp4" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`Redirect with no Location (${res.status}).`);
        if (hop >= maxHops) throw new Error("Too many redirects.");
        current = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}.`);
      const lenHeader = res.headers.get("content-length");
      if (lenHeader && Number(lenHeader) > maxBytes) {
        throw new Error("Remote file exceeds the size limit.");
      }
      const buffer = await readCapped(res, maxBytes);
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      return { buffer, contentType, finalUrl: url.toString() };
    }
  } finally {
    clearTimeout(timer);
  }
}
