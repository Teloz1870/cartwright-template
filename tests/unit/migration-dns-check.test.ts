import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDnsTtl, checkWebDns, domainHosts, productionHostOf, systemDns, targetResolveOf,
  DNS_LOOKUP_TIMEOUT_MS, type DnsResolver, type DnsSeam,
} from "@/lib/migration/checks/dns";

/**
 * MIGD-6a — dns.web and dns.ttl over a fake resolver (no network). A zone is a
 * table of names; a name missing from it is NXDOMAIN, a record type it lacks is
 * NODATA, and `err` makes every lookup of that name fail with that code.
 */

const hoisted = vi.hoisted(() => ({ calls: [] as { servers: string[] | null; method: string; host: string; opts?: unknown }[], hang: false }));
vi.mock("node:dns/promises", () => {
  class Resolver {
    servers: string[] | null = null;
    constructor(public opts: unknown) {}
    setServers(s: string[]) { this.servers = s; }
    private call(method: string, host: string, opts?: unknown) {
      hoisted.calls.push({ servers: this.servers, method, host, opts });
      return hoisted.hang ? new Promise(() => {}) : Promise.resolve(method === "resolveCname" || method === "resolveNs" ? [] : [{ address: "203.0.113.9", ttl: 60 }]);
    }
    resolve4(h: string, o?: unknown) { return this.call("resolve4", h, o); }
    resolve6(h: string, o?: unknown) { return this.call("resolve6", h, o); }
    resolveCname(h: string) { return this.call("resolveCname", h); }
    resolveNs(h: string) { return this.call("resolveNs", h); }
  }
  return { Resolver };
});

type Name = { a?: [string, number][]; aaaa?: [string, number][]; cname?: string[]; ns?: string[]; err?: string };
type Zone = Record<string, Name>;

const fail = (code: string) => Promise.reject(Object.assign(new Error(code), { code }));
function resolverOf(zone: Zone): DnsResolver {
  const look = <T>(host: string, pick: (n: Name) => T[] | undefined): Promise<T[]> => {
    const n = zone[host];
    if (!n) return fail("ENOTFOUND");
    if (n.err) return fail(n.err);
    const v = pick(n);
    return v && v.length ? Promise.resolve(v) : fail("ENODATA");
  };
  return {
    resolve4: (h) => look(h, (n) => n.a?.map(([address, ttl]) => ({ address, ttl }))),
    resolve6: (h) => look(h, (n) => n.aaaa?.map(([address, ttl]) => ({ address, ttl }))),
    resolveCname: (h) => look(h, (n) => n.cname),
    resolveNs: (h) => look(h, (n) => n.ns),
  };
}
/** `auth` answers only when asked through `at(servers)`; `asked` records who was asked. */
function seamOf(pub: Zone, auth: Zone = {}): DnsSeam & { asked: string[][] } {
  const asked: string[][] = [];
  return { system: resolverOf(pub), at: (servers) => (asked.push(servers), resolverOf(auth)), asked };
}

const OLD = "198.51.100.10";
const NEW_A = "76.76.21.21";
const NEW_HOST = "new-shop.example.net";
const TARGET = `https://${NEW_HOST}`;
const newSite: Zone = { [NEW_HOST]: { a: [[NEW_A, 60]] } };

describe("dns.web — before the switch it informs, after it proves", () => {
  const today: Zone = { ...newSite, "old-shop.example": { a: [[OLD, 3600]] }, "www.old-shop.example": { cname: ["old-shop.example"], a: [[OLD, 3600]] } };

  it("before the switch, a domain still on the old host is information (skip), never a fail", async () => {
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: false }, seamOf(today));
    expect(r.status).toBe("skip");
    expect(r.hosts.map((h) => [h.host, h.status])).toEqual([["old-shop.example", "skip"], ["www.old-shop.example", "skip"]]);
    expect(r.hosts[0].detail).toBe(`resolves today to ${OLD}, not the new site`);
    expect(r.target).toEqual({ hosts: [NEW_HOST], addresses: [NEW_A] });
  });

  it("after the switch, the same records are a fail", async () => {
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf(today));
    expect(r.status).toBe("fail");
    expect(r.hosts[0].detail).toMatch(/^still resolves to/);
  });

  it("passes when the apex holds the new site's address and www CNAMEs to the new host", async () => {
    const moved: Zone = { ...newSite, "old-shop.example": { a: [[NEW_A, 300]] }, "www.old-shop.example": { cname: [`${NEW_HOST}.`], a: [[NEW_A, 60]] } };
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf(moved));
    expect(r.status).toBe("pass");
    expect(r.hosts.map((h) => h.detail)).toEqual(["every address is the new site's", `CNAME to ${NEW_HOST}`]);
  });

  it("a left-over old AAAA beside the new A is not a pass: half the visitors still reach the old host", async () => {
    const half: Zone = { ...newSite, "old-shop.example": { a: [[NEW_A, 300]], aaaa: [["2001:db8::10", 300]] }, "www.old-shop.example": { cname: [NEW_HOST] } };
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf(half));
    expect(r.hosts[0]).toMatchObject({ status: "fail", addresses: [NEW_A, "2001:db8::10"] });
    expect(r.status).toBe("fail");
  });

  it("settings.targetResolve.ip counts as the new site's address (a host whose apex IP is not its *.app name's)", async () => {
    const apex: Zone = { ...newSite, "old-shop.example": { a: [["76.76.21.99", 300]] } };
    const tr = targetResolveOf({ targetResolve: { ip: " 76.76.21.99 " } });
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, targetResolve: tr, switched: true }, seamOf(apex));
    expect(r.status).toBe("pass");
    expect(r.target?.addresses).toEqual(["76.76.21.99", NEW_A]);
  });

  it("a www twin with no records is absent, not judged; the host the project names must resolve", async () => {
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf({ ...newSite, "old-shop.example": { a: [[NEW_A, 60]] } }));
    expect(r.hosts.map((h) => h.status)).toEqual(["pass", "absent"]);
    expect(r.status).toBe("pass");
    const none = await checkWebDns({ domain: "www.old-shop.example", targetUrl: TARGET, switched: true }, seamOf({ ...newSite, "old-shop.example": { a: [[NEW_A, 60]] } }));
    expect(none.hosts.map((h) => [h.host, h.status, h.detail])).toEqual([["www.old-shop.example", "fail", "resolves to nothing"], ["old-shop.example", "pass", "every address is the new site's"]]);
  });

  it("a lookup that fails is inconclusive, never a pass", async () => {
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: false }, seamOf({ ...today, "www.old-shop.example": { err: "ESERVFAIL" } }));
    expect(r.hosts[1]).toMatchObject({ status: "inconclusive", detail: "lookup failed (ESERVFAIL)" });
    expect(r.status).toBe("inconclusive");
    const t = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf({ ...today, [NEW_HOST]: { err: "ETIMEOUT" } }));
    expect(t).toMatchObject({ status: "inconclusive", hosts: [], detail: `The new site's host ${NEW_HOST} could not be resolved (ETIMEOUT).` });
  });

  it("a new-site host that resolves to no address is no destination: a CNAME to it is not a pass, old records are not a fail", async () => {
    const dangling: Zone = { "www.old-shop.example": { cname: [NEW_HOST] } }; // NEW_HOST is NXDOMAIN
    const r = await checkWebDns({ domain: "www.old-shop.example", targetUrl: TARGET, switched: true }, seamOf(dangling));
    expect(r).toMatchObject({ status: "inconclusive", hosts: [], detail: `The new site's host ${NEW_HOST} resolves to no address.` });
    const gone = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf({ ...today, [NEW_HOST]: { cname: ["edge.gone.example"] } }));
    expect(gone).toMatchObject({ status: "inconclusive", detail: `The new site's host ${NEW_HOST} resolves to no address (CNAME edge.gone.example).` });
  });

  it("a CNAME to the new host that itself resolves to no address here is inconclusive, not a pass", async () => {
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf({ ...newSite, "old-shop.example": { a: [[NEW_A, 60]] }, "www.old-shop.example": { cname: [NEW_HOST] } }));
    expect(r.hosts[1]).toMatchObject({ status: "inconclusive", detail: `CNAME to ${NEW_HOST}, but it resolves to no address here` });
    expect(r.status).toBe("inconclusive");
  });

  it("an IP-literal new site (IPv4, bracketed IPv6, or targetResolve.host) is the address itself, never looked up as a name", async () => {
    const v4 = await checkWebDns({ domain: "old-shop.example", targetUrl: "http://93.184.216.34", switched: true }, seamOf({ "old-shop.example": { a: [["93.184.216.34", 60]] } }));
    expect(v4).toMatchObject({ status: "pass", target: { hosts: [], addresses: ["93.184.216.34"] } });
    const v6 = await checkWebDns({ domain: "old-shop.example", targetUrl: "http://[2001:DB8::5]", switched: true }, seamOf({ "old-shop.example": { aaaa: [["2001:db8::5", 60]] } }));
    expect(v6).toMatchObject({ status: "pass", target: { hosts: [], addresses: ["2001:db8::5"] } });
    const tr = targetResolveOf({ targetResolve: { host: "[2001:db8::7]" } });
    expect(tr).toEqual({ host: null, ips: ["2001:db8::7"] });
    const viaTr = await checkWebDns({ domain: "old-shop.example", targetUrl: "https://old-shop.example", targetResolve: tr, switched: true }, seamOf({ "old-shop.example": { aaaa: [["2001:db8::7", 60]] } }));
    expect(viaTr.status).toBe("pass");
  });

  it("an IPv6 address matches in any spelling: expanded config vs compressed DNS, and the other way round", async () => {
    const tr = targetResolveOf({ targetResolve: { ip: "2001:0DB8:0000:0000:0000:0000:0000:0007" } });
    expect(tr).toEqual({ host: null, ips: ["2001:db8::7"] });
    const zone = (aaaa: string): Zone => ({ "old-shop.example": { aaaa: [[aaaa, 60]] } });
    const compressed = await checkWebDns({ domain: "old-shop.example", targetUrl: "https://old-shop.example", targetResolve: tr, switched: true }, seamOf(zone("2001:db8::7")));
    expect(compressed.status).toBe("pass");
    const expanded = await checkWebDns({ domain: "old-shop.example", targetUrl: "https://old-shop.example", targetResolve: tr, switched: true }, seamOf(zone("2001:db8:0:0:0:0:0:7")));
    expect(expanded.status).toBe("pass");
    const viaHost = await checkWebDns(
      { domain: "old-shop.example", targetUrl: "https://new.example.app", switched: true },
      seamOf({ "new.example.app": { aaaa: [["2001:DB8:0:0::9", 60]] }, "old-shop.example": { aaaa: [["2001:db8::9", 60]] } }),
    );
    expect(viaHost.status).toBe("pass");
    // A different address in a matching spelling is still not the new site.
    const other = await checkWebDns({ domain: "old-shop.example", targetUrl: "https://old-shop.example", targetResolve: tr, switched: true }, seamOf(zone("2001:db8::8")));
    expect(other.status).toBe("fail");
  });

  it("a new-site address that is the domain itself proves nothing: inconclusive", async () => {
    const r = await checkWebDns({ domain: "old-shop.example", targetUrl: "https://www.old-shop.example", switched: true }, seamOf(today));
    expect(r.status).toBe("inconclusive");
    expect(r.detail).toMatch(/nothing to compare/);
  });

  describe("a new site on a *.vercel.app alias (measured: the alias and its custom domain never share addresses)", () => {
    const ALIAS = "shop-new.vercel.app";
    const alias: Zone = { [ALIAS]: { a: [["216.198.79.3", 60], ["64.29.17.3", 60]] } };
    const run = (zone: Zone, switched: boolean) => checkWebDns({ domain: "old-shop.example", targetUrl: `https://${ALIAS}`, switched }, seamOf({ ...alias, ...zone }));

    it("a domain moved correctly — apex on Vercel's edge addresses, www CNAME to cname.vercel-dns.com — passes, never fails", async () => {
      const moved: Zone = {
        "old-shop.example": { a: [["216.150.1.193", 60], ["216.150.16.65", 60]] },
        "www.old-shop.example": { cname: ["cname.vercel-dns.com."], a: [["66.33.60.193", 60]] },
      };
      const r = await run(moved, true);
      expect(r.hosts.map((h) => [h.host, h.status])).toEqual([["old-shop.example", "inconclusive"], ["www.old-shop.example", "pass"]]);
      expect(r.hosts[0].detail).toBe("resolves to 216.150.1.193, 216.150.16.65, not the alias's addresses; Vercel answers a custom domain from other addresses than its alias, so set settings.targetResolve.ip to the ones it gave the domain");
      expect(r.hosts[1].detail).toBe("points at Vercel's edge (CNAME cname.vercel-dns.com), the new site's platform; DNS cannot tell which project answers");
      expect(r.status).toBe("inconclusive");
    });

    it("a per-project vercel-dns-NNN.com CNAME and the documented apex A 76.76.21.21 are Vercel's edge", async () => {
      const moved: Zone = {
        "old-shop.example": { a: [["76.76.21.21", 60]] },
        "www.old-shop.example": { cname: ["d1f0a2b3c4.vercel-dns-017.com"], a: [["216.198.79.65", 60]] },
      };
      const r = await run(moved, true);
      expect(r.status).toBe("pass");
      expect(r.hosts[0].detail).toMatch(/^points at Vercel's edge \(76\.76\.21\.21\)/);
    });

    it("a domain still on the old host is skip before the switch and inconclusive (never pass) after it", async () => {
      const today: Zone = { "old-shop.example": { a: [[OLD, 3600]] }, "www.old-shop.example": { a: [[OLD, 3600], ["76.76.21.21", 60]] } };
      expect((await run(today, false)).hosts.map((h) => h.status)).toEqual(["skip", "skip"]);
      const after = await run(today, true);
      expect(after.status).toBe("inconclusive");
      expect(after.hosts.map((h) => h.status)).toEqual(["inconclusive", "inconclusive"]);
    });

    it("a CNAME to a lookalike or a dangling edge CNAME is not a pass", async () => {
      const r = await run({
        "old-shop.example": { cname: ["cname.vercel-dns.com.evil.example"], a: [[OLD, 60]] },
        "www.old-shop.example": { cname: ["cname.vercel-dns.com"] },
      }, true);
      expect(r.hosts.map((h) => h.status)).toEqual(["inconclusive", "inconclusive"]);
      expect(r.hosts[1].detail).toBe("CNAME to cname.vercel-dns.com, but it resolves to no address here");
      // A CNAME elsewhere that resolves to nothing has no addresses to be "all Vercel's".
      const dangling = await run({ "old-shop.example": { cname: ["old-host.example"] } }, true);
      expect(dangling.hosts[0].status).toBe("inconclusive");
    });

    it("targetResolve.ip clears it: the addresses Vercel gave the domain count as the new site's", async () => {
      const moved: Zone = { "old-shop.example": { a: [["216.150.1.193", 60]] }, "www.old-shop.example": { a: [["216.150.1.65", 60]] } };
      const r = await checkWebDns({ domain: "old-shop.example", targetUrl: `https://${ALIAS}`, targetResolve: { host: null, ips: ["216.150.1.193", "216.150.1.65"] }, switched: true }, seamOf({ ...alias, ...moved }));
      expect(r.status).toBe("pass");
    });

    it("a new site that is not a platform alias still fails on the same edge records after the switch", async () => {
      const r = await checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: true }, seamOf({ ...newSite, "old-shop.example": { cname: ["cname.vercel-dns.com"], a: [["66.33.60.193", 60]] } }));
      expect(r.hosts[0].status).toBe("fail");
    });
  });
});

describe("dns.ttl — the zone's own TTL, warn above 300 s", () => {
  const pub: Zone = {
    "old-shop.example": { ns: ["ns1.dns-host.example", "ns2.dns-host.example"], a: [[OLD, 42]] },
    "ns1.dns-host.example": { a: [["192.0.2.53", 3600]] },
    "ns2.dns-host.example": { a: [["10.0.0.53", 3600]] },
  };

  it("asks the zone's public nameservers, not a cache: 3600 s there is a warn even when a cache shows 42 s left", async () => {
    const seam = seamOf(pub, { "old-shop.example": { a: [[OLD, 3600]] }, "www.old-shop.example": { a: [[OLD, 300]] } });
    const r = await checkDnsTtl({ domain: "old-shop.example" }, seam);
    expect(seam.asked).toEqual([["192.0.2.53"]]); // the private 10.0.0.53 is never asked
    expect(r.nameservers).toEqual(["ns1.dns-host.example", "ns2.dns-host.example"]);
    expect(r.hosts.map((h) => [h.host, h.ttl, h.status])).toEqual([["old-shop.example", 3600, "warn"], ["www.old-shop.example", 300, "pass"]]);
    expect(r.status).toBe("warn");
  });

  it("300 s exactly passes; the highest TTL of a host's records is the one that counts", async () => {
    const r = await checkDnsTtl({ domain: "old-shop.example" }, seamOf(pub, { "old-shop.example": { a: [[OLD, 300]], aaaa: [["2001:db8::1", 120]] } }));
    expect(r.hosts.map((h) => [h.ttl, h.status])).toEqual([[300, "pass"], [null, "absent"]]);
    expect(r.status).toBe("pass");
    const high = await checkDnsTtl({ domain: "old-shop.example" }, seamOf(pub, { "old-shop.example": { a: [[OLD, 60]], aaaa: [["2001:db8::1", 301]] } }));
    expect(high.hosts[0]).toMatchObject({ ttl: 301, status: "warn" });
  });

  it("walks up from a subdomain to the zone that has NS records", async () => {
    const seam = seamOf({ ...pub, "shop.old-shop.example": { a: [[OLD, 60]] } }, { "shop.old-shop.example": { a: [[OLD, 120]] } });
    const r = await checkDnsTtl({ domain: "shop.old-shop.example" }, seam);
    expect(seam.asked).toEqual([["192.0.2.53"]]);
    expect(r.hosts[0]).toMatchObject({ host: "shop.old-shop.example", ttl: 120, status: "pass" });
  });

  it("a www delegated to its own zone is asked at that zone's nameservers, not the apex's", async () => {
    const pubDel: Zone = { ...pub, "www.old-shop.example": { ns: ["ns.cdn.example"] }, "ns.cdn.example": { a: [["192.0.2.80", 60]] } };
    const apexZone: Zone = { "old-shop.example": { a: [[OLD, 300]] } }; // a referral for www: no records here
    const cdnZone: Zone = { "www.old-shop.example": { a: [["203.0.113.80", 3600]] } };
    const asked: string[][] = [];
    const seam: DnsSeam = { system: resolverOf(pubDel), at: (s) => (asked.push(s), resolverOf(s.includes("192.0.2.80") ? cdnZone : apexZone)) };
    const r = await checkDnsTtl({ domain: "old-shop.example" }, seam);
    expect(asked).toEqual([["192.0.2.53"], ["192.0.2.80"]]);
    expect(r.hosts.map((h) => [h.host, h.ttl, h.status])).toEqual([["old-shop.example", 300, "pass"], ["www.old-shop.example", 3600, "warn"]]);
    expect(r.nameservers).toEqual(["ns1.dns-host.example", "ns2.dns-host.example", "ns.cdn.example"]);
    expect(r.status).toBe("warn");
  });

  it("a name that is a CNAME is not its own zone: a recursive NS answer through the alias is skipped for the parent's", async () => {
    // A recursive resolver follows the alias and answers the target's NS for shop.old-shop.example.
    const seam = seamOf(
      { ...pub, "shop.old-shop.example": { cname: [NEW_HOST], ns: ["ns.target-host.example"] }, "ns.target-host.example": { a: [["192.0.2.99", 60]] } },
      { "shop.old-shop.example": { cname: [NEW_HOST] } },
    );
    const r = await checkDnsTtl({ domain: "shop.old-shop.example" }, seam);
    expect(seam.asked).toEqual([["192.0.2.53"]]);
    expect(r.hosts[0]).toMatchObject({ host: "shop.old-shop.example", status: "inconclusive", detail: expect.stringMatching(/CNAME/) });
  });

  it("an unregistered name under a two-label suffix walks to the suffix's servers but still reads inconclusive, never a pass", async () => {
    const r = await checkDnsTtl({ domain: "old-shop.co.uk" }, seamOf({ "co.uk": { ns: ["dns1.nic.uk"] }, "dns1.nic.uk": { a: [["192.0.2.1", 60]] } }));
    expect(r.hosts.map((h) => h.status)).toEqual(["inconclusive", "absent"]);
    expect(r.status).toBe("inconclusive");
  });

  it("a www whose own nameservers cannot be read is inconclusive, not absent", async () => {
    const r = await checkDnsTtl({ domain: "old-shop.example" }, seamOf({ ...pub, "www.old-shop.example": { err: "ESERVFAIL" } }, { "old-shop.example": { a: [[OLD, 60]] } }));
    expect(r.hosts[1]).toMatchObject({ status: "inconclusive", detail: "its nameservers could not be read: ESERVFAIL" });
    expect(r.status).toBe("inconclusive");
  });

  it.each<[string, Zone, Zone, RegExp]>([
    ["the NS lookup fails", { ...pub, "old-shop.example": { err: "ETIMEOUT" } }, {}, /nameservers could not be read \(ETIMEOUT\)/],
    ["only private nameserver addresses", { ...pub, "ns1.dns-host.example": { a: [["127.0.0.1", 60]] } }, {}, /no public address/],
    ["the nameservers' own addresses fail", { ...pub, "ns1.dns-host.example": { err: "ETIMEOUT" }, "ns2.dns-host.example": { err: "ETIMEOUT" } }, {}, /ETIMEOUT looking up ns1\.dns-host\.example/],
    ["no NS anywhere up the name", { "old-shop.example": { a: [[OLD, 60]] } }, {}, /no NS records found/],
  ])("inconclusive when %s", async (_why, p, auth, detail) => {
    const r = await checkDnsTtl({ domain: "old-shop.example" }, seamOf(p, auth));
    expect(r.status).toBe("inconclusive");
    expect(r.detail).toMatch(detail);
  });

  it("a CNAME or a failed lookup at the zone is inconclusive (counts as not ready)", async () => {
    const r = await checkDnsTtl({ domain: "old-shop.example" }, seamOf(pub, { "old-shop.example": { a: [[OLD, 60]] }, "www.old-shop.example": { cname: ["elsewhere.example"] } }));
    expect(r.hosts[1]).toMatchObject({ status: "inconclusive", detail: expect.stringMatching(/CNAME/) });
    expect(r.status).toBe("inconclusive");
    const e = await checkDnsTtl({ domain: "old-shop.example" }, seamOf(pub, { "old-shop.example": { err: "EREFUSED" } }));
    expect(e.hosts[0]).toMatchObject({ status: "inconclusive", detail: "lookup failed (EREFUSED)" });
  });
});

describe("the domain and the system resolver", () => {
  afterEach(() => {
    hoisted.calls.length = 0;
    hoisted.hang = false;
    vi.useRealTimers();
  });

  it("the domain is settings.expectedHost, else the source's host; its hosts are the bare name and the www twin", () => {
    expect(productionHostOf({ sourceUrl: "https://WWW.Old-Shop.example", settings: null })).toBe("www.old-shop.example");
    expect(productionHostOf({ sourceUrl: "https://staging.example", settings: { expectedHost: " Old-Shop.example " } })).toBe("old-shop.example");
    expect(domainHosts("www.old-shop.example")).toEqual(["www.old-shop.example", "old-shop.example"]);
    expect(domainHosts("old-shop.example.")).toEqual(["old-shop.example", "www.old-shop.example"]);
    expect(targetResolveOf({ targetResolve: { host: "Edge.Example.", ip: ["76.76.21.21", "not-an-ip"] } })).toEqual({ host: "edge.example", ips: ["76.76.21.21"] });
    expect(targetResolveOf(null)).toEqual({ host: null, ips: [] });
    expect(productionHostOf({ sourceUrl: "http://[2001:DB8::1]", settings: null })).toBe("2001:db8::1"); // brackets dropped, so the IP guard sees it
  });

  it("asks node:dns for TTLs, and `at` sets the servers it asks", async () => {
    const dns = systemDns();
    await dns.system.resolve4("old-shop.example");
    await dns.at(["192.0.2.53"]).resolve6("old-shop.example");
    expect(hoisted.calls).toEqual([
      { servers: null, method: "resolve4", host: "old-shop.example", opts: { ttl: true } },
      { servers: ["192.0.2.53"], method: "resolve6", host: "old-shop.example", opts: { ttl: true } },
    ]);
  });

  it("a lookup that never answers is cut off after DNS_LOOKUP_TIMEOUT_MS and reads inconclusive", async () => {
    vi.useFakeTimers();
    hoisted.hang = true;
    const pending = checkWebDns({ domain: "old-shop.example", targetUrl: TARGET, switched: false }, systemDns());
    await vi.advanceTimersByTimeAsync(DNS_LOOKUP_TIMEOUT_MS);
    const r = await pending;
    expect(r).toMatchObject({ status: "inconclusive", detail: `The new site's host ${NEW_HOST} could not be resolved (ETIMEOUT).` });
  });
});
