import { describe, expect, it } from "vitest";
import {
  checkMailDns, freezeMailRecords, mailSnapshotOf,
  type MailDnsResult, type MailSnapshot,
} from "@/lib/migration/checks/dns-mail";
import { mailSenderOf, RESEND_SENDER, type MailSender } from "@/lib/migration/mail-sender";
import type { DnsResolver, DnsSeam } from "@/lib/migration/checks/dns";
import { readyForDns, READY_WINDOW_MS, signOffState, withSignOff, type LatestRun, type RunBindings } from "@/lib/migration/ready";

/**
 * MIGD-6: dns.mail's DNS half and how the row reads with the owner's sign-off, over
 * a fake resolver (no network). A zone is a table of names; a name missing from it
 * is NXDOMAIN, a record type it lacks is NODATA, and `err` makes every lookup of
 * that name fail with that code. The zones are shaped as Resend's own is (measured
 * on resend.com, 2026-10-31): the sender's SPF on `send.<domain>`, the bare domain's
 * SPF left to whoever handles its other mail.
 */

const D = "shop.example.test";
const FROM = `orders@${D}`;
const SEND = `send.${D}`;
const OLD_MX: [number, string][] = [[10, "mx1.oldmail.example.test."], [20, "mx2.oldmail.example.test."]];

type Name = { txt?: (string | string[])[]; mx?: [number, string][]; err?: string };
type Zone = Record<string, Name>;

function seamOf(zone: Zone, asked: string[] = []): DnsSeam {
  const look = <T>(host: string, pick: (n: Name) => T[] | undefined): Promise<T[]> => {
    asked.push(host);
    const n = zone[host];
    const fail = (code: string) => Promise.reject(Object.assign(new Error(code), { code }));
    if (!n) return fail("ENOTFOUND");
    if (n.err) return fail(n.err);
    const v = pick(n);
    return v?.length ? Promise.resolve(v) : fail("ENODATA");
  };
  const system: DnsResolver = {
    resolve4: (h) => look(h, () => undefined),
    resolve6: (h) => look(h, () => undefined),
    resolveCname: (h) => look(h, () => undefined),
    resolveNs: (h) => look(h, () => undefined),
    resolveTxt: (h) => look(h, (n) => n.txt?.map((t) => (Array.isArray(t) ? t : [t]))),
    resolveMx: (h) => look(h, (n) => n.mx?.map(([priority, exchange]) => ({ priority, exchange }))),
  };
  return { system, at: () => { throw new Error("dns.mail asks the system resolver only"); } };
}

/** What the domain holds before the move: another provider's mail, SPF, DKIM and DMARC. */
const OLD: Zone = {
  [D]: { txt: ["google-site-verification=abc", "v=spf1 include:_spf.oldmail.example.test ip4:203.0.113.7 ~all"], mx: OLD_MX },
  "_spf.oldmail.example.test": { txt: ["v=spf1 ip4:192.0.2.0/24 -all"] },
  [`_dmarc.${D}`]: { txt: ["v=DMARC1; p=quarantine; rua=mailto:dmarc@shop.example.test"] },
  [`google._domainkey.${D}`]: { txt: ["v=DKIM1; k=rsa; p=OLDKEY"] },
};
/** What the new sender adds. The key comes in two TXT chunks, as a long one does. */
const SENDER: Zone = {
  [SEND]: { txt: ["v=spf1 include:amazonses.com ~all"], mx: [[10, "feedback-smtp.eu-west-1.amazonses.com"]] },
  "amazonses.com": { txt: ["v=spf1 ip4:198.51.100.0/24 -all"] },
  [`resend._domainkey.${D}`]: { txt: [["p=MIGfMA0", "GCSqGSIb3"]] },
};
const VALID: Zone = { ...OLD, ...SENDER };

const project = (settings: unknown = null, host = D) => ({ sourceUrl: `https://${host}`, settings });
const freeze = async (zone: Zone = OLD, settings: unknown = null) => {
  const snapshot = await freezeMailRecords(project(settings), seamOf(zone), FROM);
  if (!snapshot) throw new Error("no snapshot");
  return snapshot;
};
type Over = { from?: string; sender?: MailSender; frozen?: MailSnapshot | null };
const check = async (zone: Zone, over: Over = {}) =>
  checkMailDns({ domain: D, from: over.from ?? FROM, sender: over.sender ?? RESEND_SENDER, frozen: over.frozen === undefined ? await freeze() : over.frozen }, seamOf(zone));
const row = (r: MailDnsResult, record: string, name: string) => {
  const found = r.rows.find((x) => x.record === record && x.name === name);
  if (!found) throw new Error(`no row ${record} ${name} in ${r.rows.map((x) => `${x.record} ${x.name}`).join(", ")}`);
  return found;
};

describe("dns.mail — a valid set passes the DNS part", () => {
  it("the new sender's records on top of everything the old domain had: pass, every row named", async () => {
    const r = await check(VALID);
    expect(r.status).toBe("pass");
    expect(r.detail).toBeUndefined();
    expect(r).toMatchObject({ domain: D, senderDomain: D, spfHost: SEND });
    expect(r.rows.map((x) => [x.record, x.name, x.status])).toEqual([
      ["spf", SEND, "pass"],
      ["spf", D, "pass"],
      ["dkim", `resend._domainkey.${D}`, "pass"],
      ["mx", D, "pass"],
      ["dmarc", `_dmarc.${D}`, "pass"],
      ["dkim", `google._domainkey.${D}`, "pass"],
    ]);
    expect(row(r, "spf", SEND).detail).toBe("1 DNS lookup");
    expect(row(r, "dkim", `resend._domainkey.${D}`).values).toEqual(["p=MIGfMA0GCSqGSIb3"]);
    expect(row(r, "mx", D).values).toEqual(["10 mx1.oldmail.example.test", "20 mx2.oldmail.example.test"]);
  });

  it("the include sits on the Return-Path host: the bare domain's SPF does not need it, and one on the bare domain alone does not count", async () => {
    const onApexOnly: Zone = { ...VALID, [SEND]: {}, [D]: { ...OLD[D], txt: ["v=spf1 include:amazonses.com ~all"] } };
    const r = await check(onApexOnly, { frozen: await freeze(onApexOnly) });
    expect(row(r, "spf", SEND)).toMatchObject({ status: "fail", detail: "no SPF record: the new sender needs one with include:amazonses.com" });
    expect(row(r, "spf", D).status).toBe("pass");
    expect(r.status).toBe("fail");
  });

  it("settings name another sender: its selector, its include, and spfSubdomain \"\" reads the domain itself", async () => {
    const sender = mailSenderOf({ dkimSelectors: ["s1"], spfInclude: "sendgrid.net", spfSubdomain: "" });
    expect(sender).toEqual({ dkimSelectors: ["s1"], spfInclude: "sendgrid.net", spfSubdomain: "" });
    const zone: Zone = {
      ...OLD,
      [D]: { ...OLD[D], txt: ["v=spf1 include:_spf.oldmail.example.test include:sendgrid.net ~all"] },
      "sendgrid.net": { txt: ["v=spf1 ip4:198.51.100.0/24 -all"] },
      [`s1._domainkey.${D}`]: { txt: ["k=rsa; p=SGKEY"] },
    };
    const r = await check(zone, { sender });
    expect(r).toMatchObject({ status: "pass", spfHost: D });
    expect(row(r, "dkim", `s1._domainkey.${D}`).status).toBe("pass");
    const without = await check({ ...zone, [`s1._domainkey.${D}`]: {} }, { sender });
    expect(row(without, "dkim", `s1._domainkey.${D}`).status).toBe("fail");
  });

  it("settings read defensively: anything unset or malformed stays Resend's", () => {
    expect(mailSenderOf(null)).toEqual(RESEND_SENDER);
    expect(RESEND_SENDER).toEqual({ dkimSelectors: ["resend"], spfInclude: "amazonses.com", spfSubdomain: "send" });
    expect(mailSenderOf({ dkimSelectors: "resend", spfInclude: 7, spfSubdomain: null })).toEqual(RESEND_SENDER);
    expect(mailSenderOf({ dkimSelectors: ["a b", "", 7], spfInclude: "not a name", spfSubdomain: "x y" })).toEqual(RESEND_SENDER);
    expect(mailSenderOf({ dkimSelectors: [" S1 ", "s2."], spfInclude: "Mail.Example." })).toEqual({ dkimSelectors: ["s1", "s2"], spfInclude: "mail.example", spfSubdomain: "send" });
    expect(mailSenderOf({ dkimSelectors: ["s2", "s1", " S1 ", "s2"] }).dkimSelectors).toEqual(["s1", "s2"]);
    const named = { dkimSelectors: ["a-b", "s_1", "x"], spfInclude: "_spf.mail-1.example.test", spfSubdomain: "b" };
    expect(mailSenderOf(named)).toEqual(named);
  });
});

describe("dns.mail — SPF", () => {
  it("two v=spf1 records fail, on the Return-Path host and on the bare domain alike: a permanent error", async () => {
    const onSend = await check({ ...VALID, [SEND]: { txt: ["v=spf1 include:amazonses.com ~all", "V=SPF1 -all"] } });
    expect(row(onSend, "spf", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^2 v=spf1 records: a permanent error/) });
    expect(onSend.status).toBe("fail");
    const onApex = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 -all", "v=spf1 include:_spf.oldmail.example.test ~all"] } });
    expect(row(onApex, "spf", D)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^2 v=spf1 records/) });
    const bare = await check({ ...VALID, [SEND]: { txt: ["v=spf1", "v=spf1 include:amazonses.com ~all"] } });
    expect(row(bare, "spf", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^2 v=spf1 records/) });
  });

  it("a text record a receiver discards is not an SPF record: it begins with exactly v=spf1, then a space or nothing (RFC 7208 §4.5)", async () => {
    const r = await check({ ...VALID, [SEND]: { txt: ["v=spf10 include:amazonses.com", "spf1 include:amazonses.com", " v=spf1 include:amazonses.com ~all", "v=spf1\tinclude:amazonses.com ~all"] } });
    expect(row(r, "spf", SEND)).toMatchObject({ status: "fail", values: [], detail: expect.stringMatching(/^no SPF record/) });
  });

  it.each([
    ["no include at all", "v=spf1 ip4:198.51.100.0/24 ~all"],
    ["another sender's include", "v=spf1 include:sendgrid.example.test ~all"],
    ["a lookalike", "v=spf1 include:amazonses.com.evil.example.test ~all"],
    ["a fail include", "v=spf1 -include:amazonses.com ~all"],
    ["a soft-fail include", "v=spf1 ~include:amazonses.com ~all"],
    ["a neutral include", "v=spf1 ?include:amazonses.com ~all"],
    ["an include after -all, which is never reached", "v=spf1 -all include:amazonses.com"],
    ["a redirect after all, which is ignored", "v=spf1 ~all redirect=amazonses.com"],
    ["a redirect before all, which is ignored just the same", "v=spf1 redirect=amazonses.com ~all"],
    ["the include below a neutral one", "v=spf1 ?include:_spf.shop.example.test ~all"],
    ["include= is a modifier nobody knows, which does nothing", "v=spf1 include=amazonses.com ~all"],
  ])("a missing include fails: %s", async (_why, spf) => {
    const zone: Zone = {
      ...VALID, [SEND]: { txt: [spf] },
      "sendgrid.example.test": { txt: ["v=spf1 -all"] },
      "amazonses.com.evil.example.test": { txt: ["v=spf1 -all"] },
      "_spf.shop.example.test": { txt: ["v=spf1 include:amazonses.com -all"] },
    };
    const r = await check(zone);
    expect(row(r, "spf", SEND)).toMatchObject({ status: "fail", detail: "does not authorise the new sender: no include:amazonses.com" });
    expect(r.status).toBe("fail");
  });

  it.each([
    ["a nested include", "v=spf1 include:_spf.shop.example.test ~all", 2],
    ["a redirect to the sender", "v=spf1 redirect=amazonses.com", 1],
    ["upper case, a + qualifier and a trailing dot", "V=SPF1 +INCLUDE:AmazonSES.com. ~ALL", 1],
    ["an upper-case redirect", "V=SPF1 REDIRECT=AmazonSES.com.", 1],
    ["more than one space between terms, and after the last", "v=spf1  include:amazonses.com   ~all ", 1],
  ])("the include counts through %s", async (_why, spf, lookups) => {
    const r = await check({ ...VALID, [SEND]: { txt: [spf] }, "_spf.shop.example.test": { txt: ["v=spf1 include:amazonses.com -all"] } });
    expect(row(r, "spf", SEND)).toMatchObject({ status: "pass", detail: lookups === 1 ? "1 DNS lookup" : `${lookups} DNS lookups` });
  });

  it.each([
    ["redirect takes =, not :", "redirect:amazonses.com", "v=spf1 redirect:amazonses.com"],
    ["a redirect takes no qualifier", "+redirect=amazonses.com", "v=spf1 +redirect=amazonses.com"],
    ["a redirect needs a target", "redirect=", "v=spf1 include:amazonses.com redirect="],
    ["a modifier takes no qualifier", "-include=amazonses.com", "v=spf1 -include=amazonses.com include:amazonses.com ~all"],
    ["a slash does not name a target", "include/amazonses.com", "v=spf1 include/amazonses.com ~all"],
    ["an include needs a target", "include", "v=spf1 include include:amazonses.com ~all"],
    ["an empty target is none", "include:", "v=spf1 include: include:amazonses.com ~all"],
    ["all takes no value", "all:amazonses.com", "v=spf1 include:amazonses.com all:amazonses.com"],
    ["exists needs a domain", "exists", "v=spf1 include:amazonses.com exists ~all"],
    ["ip4 needs a network", "ip4", "v=spf1 include:amazonses.com ip4 ~all"],
    ["ip6 needs a network", "ip6:", "v=spf1 include:amazonses.com ip6: ~all"],
    ["ptr takes no length", "ptr/24", "v=spf1 include:amazonses.com ptr/24 ~all"],
    ["ptr: needs a domain", "ptr:", "v=spf1 include:amazonses.com ptr: ~all"],
    ["a: needs a domain", "a:", "v=spf1 include:amazonses.com a: ~all"],
    ["a mechanism with a name of its own", "amx", "v=spf1 include:amazonses.com amx ~all"],
    ["a mechanism nobody knows", "foo:bar", "v=spf1 foo:bar include:amazonses.com ~all"],
    ["a modifier's name starts with a letter", "_x=1", "v=spf1 include:amazonses.com _x=1 ~all"],
    ["junk on all", "~all.", "v=spf1 include:amazonses.com ~all."],
    ["a tab is no separator", "include:amazonses.com\t~all", "v=spf1 include:amazonses.com\t~all"],
    ["a tab is no separator after a modifier either", "exp=why.example.test\t~all", "v=spf1 include:amazonses.com exp=why.example.test\t~all"],
    ["past all, where nothing is reached: the whole record is void", "foo:bar", "v=spf1 include:amazonses.com ~all foo:bar"],
  ])("a record that breaks the grammar fails, naming the term: %s", async (_why, term, spf) => {
    const r = await check({ ...VALID, [SEND]: { txt: [spf] } });
    expect(row(r, "spf", SEND)).toMatchObject({ status: "fail", detail: `"${term}" is not valid SPF: a permanent error (RFC 7208) for mail that reaches it` });
    expect(r.status).toBe("fail");
  });

  it("a broken record fails on the bare domain and below an include too, where no include is asked for", async () => {
    const apex = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 redirect:_spf.oldmail.example.test"] } });
    expect(row(apex, "spf", D)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^"redirect:_spf\.oldmail\.example\.test" is not valid SPF/) });
    const below = await check({ ...VALID, [SEND]: { txt: ["v=spf1 include:amazonses.com include:_spf.shop.example.test ~all"] }, "_spf.shop.example.test": { txt: ["v=spf1 foo:bar -all"] } });
    expect(row(below, "spf", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^"foo:bar" is not valid SPF/) });
  });

  it("every shape the grammar allows still reads, and is counted", async () => {
    const lookups = "a a/24 a//64 a:b.example.test/24//64 mx/24 mx:b.example.test ptr ptr:b.example.test exists:%{i}.x.example.test include:amazonses.com";
    const free = "ip4:192.0.2.1/24 -ip4:192.0.2.2 ip6:2001:db8::1/64 ?ip6:2001:db8::2 exp=why.example.test EXP=why.example.test x-note= x.y_z-1=%{d}";
    expect(row(await check({ ...VALID, [SEND]: { txt: [`v=spf1 ${free} ${lookups} ${free} ~all`] } }), "spf", SEND)).toMatchObject({ status: "pass", detail: "10 DNS lookups" });
  });

  describe("a term's target, by RFC 7208 §12", () => {
    const LONG = "x".repeat(64);
    /** What no domain-spec can be, on any of the six mechanisms that take one. */
    const BAD_DOMAINS = [
      // The finding's, a lone dot, one label, an empty label at either end or before a macro.
      "bad..name", "-", "..", "???", ".", "localhost", "localhost.", ".example.test", "example.test..", ".%{d}", "x..%{d}",
      // An end that is no toplabel: all digits, a hyphen at either end, an underscore, a slash.
      "192.0.2.1", "example.123.", "x.-test", "x.test-", "x.te_st", "x.te/st",
      // A label over 63, wherever it stands (§4.3).
      `${LONG}.example.test`, `mail.${LONG}.test`, `x.${LONG}`, `${LONG}%{d}`,
      // A slash at the start: a length with no domain before it.
      "/x.example.test",
      // A % that opens no macro, and macros the grammar has no room for.
      "%", "%foo.example.test", "100%.example.test", "%{d", "%{d.example.test", "%{}.example.test", "%{z}.example.test", "%{dr2}.example.test", "%{drr}.example.test", "%{d!}.example.test", "%{d}.",
    ];
    /** A length a and mx take, read wrong: past each range, a leading zero, nothing, the halves swapped, one slash for the ip6 half. */
    const BAD_LENGTHS = [":example.test/33", ":example.test/02", ":example.test/024", ":example.test/", ":example.test//", ":example.test//129", ":example.test//130", ":example.test//06", ":example.test//064", ":example.test/24/64", ":example.test//64/24", ":x/24", "/33", "/x", "//129", "/24//129", "/33//64", "/24.example.test", "//64.example.test", "/24//64.example.test"];
    const BROKEN = [
      // ip4.
      "ip4:not-an-ip", "ip4:999.1.1.1/99", "ip4:999.1.1.1", "ip4:192.0.2", "ip4:192.0.2.01", "ip4:example.test", "ip4:2001:db8::1", "ip4:/24", "ip4:192.0.2.0/33", "ip4:192.0.2.0/64", "ip4:192.0.2.0/02", "ip4:192.0.2.0/024", "ip4:192.0.2.0/", "ip4:192.0.2.0/x", "ip4:192.0.2.0/-1", "ip4:192.0.2.0/24/24", "ip4:192.0.2.0//24", "ip4:192.0.2.0/255.255.255.0",
      // ip6, with a zone, which isIP takes and §12 does not.
      "ip6:zzz", "ip6:192.0.2.1", "ip6:example.test", "ip6:1:2:3:4:5:6:7:8:9", "ip6:[::1]", "ip6:/64", "ip6:fe80::1%eth0", "ip6:fe80::1%eth0/64", "ip6:2001:db8::/129", "ip6:2001:db8::/130", "ip6:2001:db8::/06", "ip6:2001:db8::/064", "ip6:2001:db8::/", "ip6:2001:db8::/x", "ip6:2001:db8:://64", "ip6:2001:db8::/64/64",
      // Every mechanism that takes a domain, with every way to get one wrong.
      ...["a:", "mx:", "exists:", "ptr:", "include:", "redirect="].flatMap((mechanism) => BAD_DOMAINS.map((spec) => `${mechanism}${spec}`)),
      ...["a", "mx"].flatMap((mechanism) => BAD_LENGTHS.map((length) => `${mechanism}${length}`)),
      // A length on a mechanism that has none.
      "exists:example.test/24", "ptr:example.test/24", "include:example.test/24", "redirect=example.test/24", "ptr/24.example.test",
      // A qualifier and upper case change nothing.
      "-ip4:not-an-ip", "?ip6:zzz", "~a:bad..name", "+mx:-", "IP4:not-an-ip", "IP6:zzz", "A:bad..name", "MX:-", "EXISTS:..", "PTR:???", "INCLUDE:bad..name", "REDIRECT=bad..name", "A/33", "MX//129",
    ];

    const voids = async (term: string) => {
      const places: Zone[] = [
        { [SEND]: { txt: [`v=spf1 include:amazonses.com ${term} ~all`] } },
        { [SEND]: { txt: [`v=spf1 include:amazonses.com ~all ${term}`] } },
        { "amazonses.com": { txt: [`v=spf1 ${term} -all`] } },
      ];
      for (const place of places) {
        const r = await check({ ...VALID, ...place });
        expect(row(r, "spf", SEND), JSON.stringify(place)).toMatchObject({ status: "fail", detail: `"${term}" is not valid SPF: a permanent error (RFC 7208) for mail that reaches it` });
        expect(r.status).toBe("fail");
      }
    };

    it.each(BROKEN)("%s voids the record: before all, past all and inside the include", voids);

    it.each([
      ["a letter outside ASCII", "a:bücher.example.test"],
      ["a control character", "a:x\u0001y.example.test"],
      ["a NUL, which node:dns would throw on", "include:x\u0000y.example.test"],
      ["DEL", "exists:x\u007fy.example.test"],
    ])("a domain target holds visible ASCII alone, so %s voids the record", async (_what, term) => voids(term));

    it.each([
      // ip4, each range of the prefix at its ends.
      "ip4:192.0.2.1", "ip4:0.0.0.0/0", "ip4:192.0.2.0/9", "ip4:192.0.2.0/10", "ip4:192.0.2.0/19", "ip4:192.0.2.0/20", "ip4:192.0.2.0/29", "ip4:192.0.2.0/30", "ip4:192.0.2.1/32", "IP4:192.0.2.1/24", "-ip4:192.0.2.1",
      // ip6 the same.
      "ip6:::1", "ip6:::/0", "ip6:2001:db8::/9", "ip6:2001:db8::/10", "ip6:2001:db8::/64", "ip6:2001:db8::/99", "ip6:2001:db8::/100", "ip6:2001:db8::/119", "ip6:2001:db8::/120", "ip6:2001:db8::/128", "ip6:::ffff:192.0.2.1/96", "IP6:2001:DB8::CD30/60", "?ip6:2001:db8::2",
      // A domain, on each mechanism: one letter or digits before the end, an underscore in a label, a trailing dot, upper case, 63 in a label.
      "a:mail.example.test", "mx:mail.example.test.", "exists:mail.example.test", "ptr:mail.example.test", "A:MAIL.EXAMPLE.TEST", "MX:Mail.Example.Test", "EXISTS:Mail.Example.Test", "PTR:Mail.Example.Test", "a:_spf.example.test", "a:1.example.test", `a:${"x".repeat(63)}.example.test`, `a:x.${"y".repeat(63)}`,
      // Each kind of end the grammar has: letters, digits and a letter, a hyphen inside, digits around a hyphen, an A-label.
      "a:x.a", "a:x.a1", "a:x.1a", "a:x.1-2", "a:x.a--b", "a:x.xn--p1ai", "a:x.1a.",
      // Visible text the grammar lets stand in a label: only the end is held to letters, digits and hyphens.
      "a:foo/bar.example.test", "ptr:x?y.example.test", "exists:x_y-z=1+2,3.example.test",
      // a and mx, with each half of a length, or both, and a bare mechanism.
      "a", "mx", "ptr", "a/0", "a/32", "a//0", "a//128", "a/24//64", "mx/0", "mx/32", "mx//0", "mx//128", "mx/32//128", "A/24", "MX/24//64", "a:mail.example.test/0", "a:mail.example.test/32", "a:mail.example.test//128", "a:mail.example.test/24//64", "mx:mail.example.test/24", "mx:mail.example.test//64", "mx:mail.example.test/24//64", "a:mail.example.test./24",
      // Macros: every letter, in either case, with digits, a reverse and every delimiter, and the three short ones.
      "exists:%{s}%{l}%{o}%{d}%{i}%{p}%{h}%{c}%{r}%{t}%{v}.example.test", "exists:%{S}%{L}%{O}%{D}%{I}%{P}%{H}%{C}%{R}%{T}%{V}.example.test", "exists:%{d2}.example.test", "exists:%{d12r}.example.test", "exists:%{ir}.example.test", "exists:%{l-.+,/_=}.example.test", "exists:%{l1r-}.example.test", "exists:%%.example.test", "exists:%_.example.test", "exists:%-.example.test",
      // A macro as the end, or anywhere: one alone, after a label, after text, two together, before a length.
      "a:%{d}", "ptr:%{d}", "exists:%{d}", "mx:%{d}", "a:foo.%{d}", "a:foo%{d}", "a:%{d}%{i}", "a:%%", "a:%{d}/24", "mx:%{d}/24//64", "a:%{i}.x.%{d}",
    ])("%s is a target the grammar allows: the record reads", async (term) => {
      const r = await check({ ...VALID, [SEND]: { txt: [`v=spf1 include:amazonses.com ${term} ~all`] } });
      expect(row(r, "spf", SEND).status).toBe("pass");
      expect(r.status).toBe("pass");
    });

    it.each(["include:%{d}", "include:x.%{d}", "include:%{ir}.%{v}.%{d}.spf.example.test", "redirect=%{d}", "redirect=%{d}._spf.example.test", "INCLUDE:%{D}"])("%s is valid, and needs a message to follow: inconclusive, no syntax error", async (term) => {
      expect(row(await check({ ...VALID, [SEND]: { txt: [`v=spf1 include:amazonses.com ${term}`] } }), "spf", SEND)).toMatchObject({ status: "inconclusive", detail: expect.stringMatching(/cannot be followed without a message/) });
    });

    it("a target is read, not looked up: a, mx, ptr and exists ask DNS for nothing", async () => {
      const asked: string[] = [];
      const spf = "v=spf1 a:a.example.test mx:m.example.test ptr:p.example.test exists:e.example.test include:amazonses.com ~all";
      const r = await checkMailDns({ domain: D, from: FROM, sender: RESEND_SENDER, frozen: await freeze() }, seamOf({ ...VALID, [SEND]: { txt: [spf] } }, asked));
      expect(row(r, "spf", SEND)).toMatchObject({ status: "pass", detail: "5 DNS lookups" });
      expect(asked.filter((h) => /^[ampe]\.example\.test$/.test(h))).toEqual([]);
    });

    it("a bad target fails on the bare domain too, where no include is asked for", async () => {
      const r = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 include:_spf.oldmail.example.test ip4:not-an-ip ~all"] } });
      expect(row(r, "spf", D)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^"ip4:not-an-ip" is not valid SPF/) });
    });

    it.each(["ip4:not-an-ip", "ip6:zzz", "a:bad..name", "mx:-", "exists:..", "ptr:???"])("a frozen record with %s was void, so what it named is not missed", async (term) => {
      const frozen = await freeze({ ...OLD, [D]: { ...OLD[D], txt: [`v=spf1 include:_spf.oldmail.example.test ${term} ~all`] } });
      expect(row(await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 ip4:203.0.113.7 ~all"] } }, { frozen }), "spf", D).status).toBe("pass");
    });
  });

  it("a modifier named like a mechanism is neither a lookup nor all: it does nothing", async () => {
    const spf = "v=spf1 include=x.example.test a=1 mx=2 ptr=3 exists=4 all=5 ip4=6 include:amazonses.com ~all";
    expect(row(await check({ ...VALID, [SEND]: { txt: [spf] } }), "spf", SEND)).toMatchObject({ status: "pass", detail: "1 DNS lookup" });
  });

  it("a frozen record is read by the same grammar: what it never authorised is not missed", async () => {
    const live: Zone = { ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 ip4:203.0.113.7 ~all"] } };
    for (const txt of ["v=spf1 include=_spf.oldmail.example.test ip4:203.0.113.7 ~all", "v=spf1 include:_spf.oldmail.example.test foo:bar ~all", "v=spf1 redirect=_spf.oldmail.example.test ip4:203.0.113.7 ~all", "v=spf1 ?include:_spf.oldmail.example.test ip4:203.0.113.7 ~all"]) {
      const frozen = await freeze({ ...OLD, [D]: { ...OLD[D], txt: [txt] } });
      expect(row(await check(live, { frozen }), "spf", D).status, txt).toBe("pass");
    }
  });

  /** n lookups: the sender's include, then a/mx/ptr/exists to fill up. */
  const spfWith = (n: number) => {
    const fill = ["a", "mx", "ptr", "exists:%{i}.x.example.test", "a:b.example.test", "mx:b.example.test", "a:c.example.test", "mx:c.example.test", "a:d.example.test", "mx:d.example.test"];
    return `v=spf1 include:amazonses.com ${fill.slice(0, n - 1).join(" ")} ~all`;
  };

  it("10 lookups pass and 11 fail: over 10 is a permanent error, on any name it reads", async () => {
    expect(row(await check({ ...VALID, [SEND]: { txt: [spfWith(10)] } }), "spf", SEND)).toMatchObject({ status: "pass", detail: "10 DNS lookups" });
    const over = await check({ ...VALID, [SEND]: { txt: [spfWith(11)] } });
    expect(row(over, "spf", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^over 10 DNS lookups: a permanent error/) });
    expect(over.status).toBe("fail");
    const apex = await check({ ...VALID, [D]: { ...VALID[D], txt: [`${spfWith(11).replace("include:amazonses.com", "include:_spf.oldmail.example.test")}`] } });
    expect(row(apex, "spf", D).status).toBe("fail");
  });

  it("the count follows includes and redirects down, and only lookups count: ip4, ip6, all, exp and unknown modifiers do not", async () => {
    const zone: Zone = {
      ...VALID,
      [SEND]: { txt: ["v=spf1 ip4:192.0.2.1 ip6:2001:db8::1 exp=why.example.test x-note=1 include:amazonses.com include:n.example.test ~all"] },
      "n.example.test": { txt: ["v=spf1 a mx include:m.example.test ~all"] },
      "m.example.test": { txt: ["v=spf1 redirect=l.example.test"] },
      "l.example.test": { txt: ["v=spf1 mx -all"] },
    };
    // amazonses, n, a, mx, m, redirect, mx
    expect(row(await check(zone), "spf", SEND)).toMatchObject({ status: "pass", detail: "7 DNS lookups" });
    const deep = await check({ ...zone, "l.example.test": { txt: [`v=spf1 a:1.example.test a:2.example.test a:3.example.test a:4.example.test -all`] } });
    expect(row(deep, "spf", SEND)).toMatchObject({ status: "pass", detail: "10 DNS lookups" });
    const over = await check({ ...zone, "l.example.test": { txt: [`v=spf1 a:1.example.test a:2.example.test a:3.example.test a:4.example.test a:5.example.test -all`] } });
    expect(row(over, "spf", SEND).status).toBe("fail");
  });

  it("an include loop ends past the limit and fails, reading a bounded number of records", async () => {
    const asked: string[] = [];
    const zone: Zone = { ...VALID, [SEND]: { txt: ["v=spf1 include:amazonses.com include:loop.example.test ~all"] }, "loop.example.test": { txt: ["v=spf1 include:loop.example.test -all"] } };
    const r = await checkMailDns({ domain: D, from: FROM, sender: RESEND_SENDER, frozen: await freeze() }, seamOf(zone, asked));
    expect(row(r, "spf", SEND).status).toBe("fail");
    expect(asked.filter((h) => h === "loop.example.test").length).toBeLessThanOrEqual(10);
  });

  it("an include with no record, or with two, is a permanent error too, named", async () => {
    const dead = await check({ ...VALID, [SEND]: { txt: ["v=spf1 include:amazonses.com include:gone.example.test ~all"] } });
    expect(row(dead, "spf", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^include gone\.example\.test has 0 SPF records: a permanent error/) });
    const two = await check({ ...VALID, [SEND]: { txt: ["v=spf1 include:amazonses.com redirect=two.example.test"] }, "two.example.test": { txt: ["v=spf1 -all", "v=spf1 ~all"] } });
    expect(row(two, "spf", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^redirect two\.example\.test has 2 SPF records/) });
  });

  it("an include that needs a macro expanded is unknowable here: inconclusive, never a pass", async () => {
    const r = await check({ ...VALID, [SEND]: { txt: ["v=spf1 include:amazonses.com include:%{d}.spf.example.test ~all"] } });
    expect(row(r, "spf", SEND)).toMatchObject({ status: "inconclusive", detail: expect.stringMatching(/cannot be followed without a message/) });
    expect(r.status).toBe("inconclusive");
  });

  it.each([
    ["before", "v=spf1 include:amazonses.com redirect=gone.example.test ~all"],
    ["after", "v=spf1 include:amazonses.com ~all redirect=gone.example.test"],
  ])("a redirect %s all is neither followed nor a lookup: a dead one breaks nothing", async (_where, spf) => {
    expect(row(await check({ ...VALID, [SEND]: { txt: [spf] } }), "spf", SEND)).toMatchObject({ status: "pass", detail: "1 DNS lookup" });
  });

  it("the bare domain's SPF gone is a named fail; never having had one is no finding", async () => {
    const r = await check({ ...VALID, [D]: { mx: OLD_MX } });
    expect(row(r, "spf", D)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^no SPF record; it was there at the freeze/) });
    const never: Zone = { ...VALID, [D]: { mx: OLD_MX } };
    expect(row(await check(never, { frozen: await freeze(never) }), "spf", D)).toMatchObject({ status: "pass", detail: "no SPF record here, none at the freeze" });
  });

  it("an include the frozen record had is gone: warn, named. An old server's IP gone is expected, and no finding", async () => {
    const replaced = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 ip4:203.0.113.7 ~all"] } });
    expect(row(replaced, "spf", D)).toMatchObject({ status: "warn", detail: expect.stringMatching(/^no longer authorises include:_spf\.oldmail\.example\.test, which it did at the freeze/) });
    expect(replaced.status).toBe("warn");
    const ipGone = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 include:_spf.oldmail.example.test ~all"] } });
    expect(row(ipGone, "spf", D).status).toBe("pass");
    expect(ipGone.status).toBe("pass");
    const nested = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 include:_spf.shop.example.test ~all"] }, "_spf.shop.example.test": { txt: ["v=spf1 include:_spf.oldmail.example.test -all"] } });
    expect(row(nested, "spf", D).status).toBe("pass");
  });

  it("a redirect the frozen record had is held like an include: it authorises too", async () => {
    const frozen = await freeze({ ...OLD, [D]: { ...OLD[D], txt: ["v=spf1 redirect=_spf.oldmail.example.test"] } });
    const gone = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 ip4:203.0.113.7 ~all"] } }, { frozen });
    expect(row(gone, "spf", D)).toMatchObject({ status: "warn", detail: expect.stringMatching(/^no longer authorises include:_spf\.oldmail\.example\.test/) });
    const kept = await check({ ...VALID, [D]: { ...VALID[D], txt: ["v=spf1 include:_spf.oldmail.example.test ~all"] } }, { frozen });
    expect(row(kept, "spf", D).status).toBe("pass");
  });

  it("a frozen include is read in one spelling: case and a trailing dot are no difference", async () => {
    const frozen = await freeze({ ...OLD, [D]: { ...OLD[D], txt: ["v=spf1 INCLUDE:_SPF.OldMail.Example.Test. ~all"] } });
    expect(row(await check(VALID, { frozen }), "spf", D).status).toBe("pass");
  });

  it("the Return-Path host's SPF is kept too, once the freeze saw it: gone reads as lost, not as never set up", async () => {
    const frozen = await freeze(VALID);
    expect(frozen.records[`spf ${SEND}`]).toEqual(VALID[SEND].txt);
    const r = await check({ ...VALID, [SEND]: { mx: VALID[SEND].mx } }, { frozen });
    expect(row(r, "spf", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^no SPF record; it was there at the freeze/) });
  });
});

describe("dns.mail — DKIM", () => {
  it("a selector the sender needs that was never there fails; Resend's is the default, and settings replace it", async () => {
    const noResend = { ...VALID };
    delete noResend[`resend._domainkey.${D}`];
    const r = await check(noResend);
    expect(row(r, "dkim", `resend._domainkey.${D}`)).toMatchObject({ status: "fail", detail: "no DKIM record: the new sender needs this selector" });
    expect(r.status).toBe("fail");
    expect((await check(noResend, { sender: { ...RESEND_SENDER, dkimSelectors: ["google"] } })).status).toBe("pass");
  });

  it.each([
    ["at the end", "v=DKIM1; k=rsa; p="],
    ["with a space before its ;", "v=DKIM1; p= ;"],
    ["with a tab, and a tag after it", "v=DKIM1; p=\t; k=rsa"],
    ["spaced on both sides", "v=DKIM1; p = ;"],
    ["beside a tag that only ends in p", "v=DKIM1; up=KEY; p="],
    ["first in the record", "p=; k=rsa"],
  ])("an empty p= is a revoked key, not a key: %s", async (_how, txt) => {
    const r = await check({ ...VALID, [`resend._domainkey.${D}`]: { txt: [txt] } });
    expect(row(r, "dkim", `resend._domainkey.${D}`)).toMatchObject({ status: "fail", detail: "the key is revoked (empty p=)" });
  });

  it.each([
    "v=DKIM1; p = KEY",
    "v=DKIM1;p= KEY",
    "p=KEY; k=rsa",
    "  v=DKIM1 ;\tp\t=KEY",
  ])("a key spelled with spaces, or first in the record, is a key: %s", async (txt) => {
    expect(row(await check({ ...VALID, [`resend._domainkey.${D}`]: { txt: [txt] } }), "dkim", `resend._domainkey.${D}`).status).toBe("pass");
  });

  it.each([
    ["still revoked", { txt: ["v=DKIM1; p= ;"] }],
    ["gone", {}],
    ["with a key again", { txt: ["p=NEWKEY"] }],
  ])("a selector the freeze found already revoked is no loss, and the sender does not need it: %s now is no finding", async (_now, live) => {
    const frozen = await freeze({ ...OLD, [`google._domainkey.${D}`]: { txt: ["v=DKIM1; p= ;"] } });
    expect(row(await check({ ...VALID, [`google._domainkey.${D}`]: live }, { frozen }), "dkim", `google._domainkey.${D}`).status).toBe("pass");
  });

  it("a text record with no p= tag is no key either", async () => {
    const r = await check({ ...VALID, [`resend._domainkey.${D}`]: { txt: ["v=DKIM1; k=rsa", "up=x"] } });
    expect(row(r, "dkim", `resend._domainkey.${D}`)).toMatchObject({ status: "fail", detail: "no DKIM record: the new sender needs this selector" });
  });

  it("a lost selector fails, by name: one the freeze found without being told, and one settings listed", async () => {
    const zone = { ...VALID };
    delete zone[`google._domainkey.${D}`];
    const r = await check(zone);
    expect(row(r, "dkim", `google._domainkey.${D}`)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^no DKIM key; it was there at the freeze/) });
    expect(r.status).toBe("fail");
    expect(r.detail).toContain(`dkim google._domainkey.${D}: no DKIM key`);

    const before: Zone = { ...OLD, [`legacy2._domainkey.${D}`]: { txt: ["p=LEGACY"] } };
    const frozen = await freeze(before, { dkimSelectors: ["legacy2"] });
    expect(frozen.records[`dkim legacy2._domainkey.${D}`]).toEqual(["p=LEGACY"]);
    expect(row(await check(VALID, { frozen }), "dkim", `legacy2._domainkey.${D}`).status).toBe("fail");
    // A selector neither listed nor common is not read at all: DKIM cannot be enumerated.
    const unlisted = await freeze(before);
    expect(unlisted.records[`dkim legacy2._domainkey.${D}`]).toBeUndefined();
  });

  it("a key revoked since the freeze is lost; a key that differs is a warn; the frozen key still there passes", async () => {
    for (const txt of ["v=DKIM1; p=", "v=DKIM1; p= ;"]) {
      const revoked = await check({ ...VALID, [`google._domainkey.${D}`]: { txt: [txt] } });
      expect(row(revoked, "dkim", `google._domainkey.${D}`), txt).toMatchObject({ status: "fail", detail: expect.stringMatching(/^no DKIM key; it was there at the freeze/) });
    }
    const cut = await check({ ...VALID, [`google._domainkey.${D}`]: { txt: ["v=DKIM1; k=rsa; p=OLDK"] } });
    expect(row(cut, "dkim", `google._domainkey.${D}`)).toMatchObject({ status: "warn", detail: expect.stringMatching(/differs from the freeze/) });
    expect(cut.status).toBe("warn");
    const two = await check({ ...VALID, [`google._domainkey.${D}`]: { txt: ["v=DKIM1; k=rsa; p=OLDKEY", "p=NEXTKEY"] } });
    expect(row(two, "dkim", `google._domainkey.${D}`).status).toBe("pass");
  });
});

describe("dns.mail — DMARC", () => {
  const dmarc = (txt: string[]): Zone => ({ ...VALID, [`_dmarc.${D}`]: { txt } });
  const never = async (zone: Zone) => check(zone, { frozen: await freeze({ ...OLD, [`_dmarc.${D}`]: {} }) });
  /** Sending from a subdomain of the domain that moves, with the sender's records there and `apex` as the domain's DMARC. */
  const from = `orders@mail.${D}`;
  const zone = (apex: string): Zone => ({
    ...OLD, [`_dmarc.${D}`]: { txt: [apex] },
    [`send.mail.${D}`]: SENDER[SEND], "amazonses.com": SENDER["amazonses.com"],
    [`resend._domainkey.mail.${D}`]: { txt: ["p=KEY"] }, [`mail.${D}`]: { mx: [[10, "mx.example.test"]] },
  });
  const frozenFor = (apex: string) => freezeMailRecords(project(), seamOf(zone(apex)), from);
  const run = async (apex: string) => check(zone(apex), { from, frozen: await frozenFor(apex) });

  it("none at all fails", async () => {
    const r = await never({ ...VALID, [`_dmarc.${D}`]: {} });
    expect(row(r, "dmarc", `_dmarc.${D}`)).toMatchObject({ status: "fail", detail: "no DMARC record" });
    expect(r.status).toBe("fail");
    expect((await check(dmarc(["v=spf1 -all"]))).status).toBe("fail");
  });

  it("a text record that only starts like DMARC, or only contains it, is not a DMARC record", async () => {
    const r = await never(dmarc(["v=DMARC10; p=reject", "x v=DMARC1; p=reject", " v=DMARC1; p=reject"]));
    expect(row(r, "dmarc", `_dmarc.${D}`)).toMatchObject({ status: "fail", values: [], detail: "no DMARC record" });
  });

  it("gone since the freeze fails, saying so", async () => {
    const r = await check({ ...VALID, [`_dmarc.${D}`]: {} });
    expect(row(r, "dmarc", `_dmarc.${D}`)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^no DMARC record; it was there at the freeze/) });
  });

  it("p=none reads warn: receivers act on none of its failures", async () => {
    const r = await check(dmarc(["v=DMARC1; p=none; rua=mailto:x@shop.example.test"]));
    expect(row(r, "dmarc", `_dmarc.${D}`)).toMatchObject({ status: "warn", detail: expect.stringMatching(/^p=none/) });
    expect(r.status).toBe("warn");
  });

  it("quarantine and reject pass, in any case and with spaces; a record with no valid p= warns", async () => {
    for (const txt of ["v=DMARC1; p=quarantine", "v=DMARC1;p=reject;", "V=DMARC1 ; P = REJECT"]) expect((await check(dmarc([txt]))).status, txt).toBe("pass");
    for (const txt of ["v=DMARC1; rua=mailto:x@shop.example.test", "v=DMARC1; p=whatever", "v=DMARC1"]) {
      expect(row(await check(dmarc([txt])), "dmarc", `_dmarc.${D}`), txt).toMatchObject({ status: "warn", detail: expect.stringMatching(/^no valid p= tag/) });
    }
  });

  it("two records fail: receivers ignore them all", async () => {
    const r = await check(dmarc(["v=DMARC1; p=reject", "v=DMARC1; p=none"]));
    expect(row(r, "dmarc", `_dmarc.${D}`)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^2 DMARC records/) });
  });

  it("a parent stops at two labels: a record on a bare top-level domain is nobody's policy", async () => {
    const r = await never({ ...VALID, [`_dmarc.${D}`]: {}, "_dmarc.test": { txt: ["v=DMARC1; p=reject"] } });
    expect(row(r, "dmarc", `_dmarc.${D}`).status).toBe("fail");
    expect(r.rows.some((x) => x.name === "_dmarc.test")).toBe(false);
  });

  it("a sending subdomain with no record of its own lives under its parent's, whose sp= wins over p=", async () => {
    expect((await run("v=DMARC1; p=reject")).status).toBe("pass");
    expect((await run("v=DMARC1; p=reject; sp=none")).status).toBe("warn");
    expect((await run("v=DMARC1; p=none; sp=reject")).status).toBe("pass");
    // On the domain itself p= is what counts, whatever sp= says.
    expect((await check(dmarc(["v=DMARC1; p=none; sp=reject"]))).status).toBe("warn");
    // The subdomain's own record wins, and a parent is not read past a lookup that failed.
    const own = await check({ ...zone("v=DMARC1; p=reject"), [`_dmarc.mail.${D}`]: { txt: ["v=DMARC1; p=none"] } }, { from, frozen: await frozenFor("v=DMARC1; p=reject") });
    expect(row(own, "dmarc", `_dmarc.mail.${D}`).status).toBe("warn");
    const failed = await check({ ...zone("v=DMARC1; p=reject"), [`_dmarc.mail.${D}`]: { err: "ESERVFAIL" } }, { from, frozen: await frozenFor("v=DMARC1; p=reject") });
    expect(row(failed, "dmarc", `_dmarc.mail.${D}`)).toMatchObject({ status: "inconclusive", detail: "lookup failed (ESERVFAIL)" });
    expect(failed.status).toBe("inconclusive");
  });

  it("with a record of its own, the sender is not its parent's to judge: the parent's row reads the parent's own p=", async () => {
    const withOwn = async (apex: string) => check({ ...zone(apex), [`_dmarc.mail.${D}`]: { txt: ["v=DMARC1; p=reject"] } }, { from, frozen: await frozenFor(apex) });
    const spNone = await withOwn("v=DMARC1; p=reject; sp=none");
    expect(row(spNone, "dmarc", `_dmarc.${D}`).status).toBe("pass");
    expect(row(spNone, "dmarc", `_dmarc.mail.${D}`).status).toBe("pass");
    expect(spNone.status).toBe("pass");
    expect(spNone.detail).toBeUndefined();
    const spReject = await withOwn("v=DMARC1; p=none; sp=reject");
    expect(row(spReject, "dmarc", `_dmarc.${D}`)).toMatchObject({ status: "warn", detail: expect.stringMatching(/^p=none/) });
  });

  it("the reason quotes the tag it read", async () => {
    const parent = async (apex: string) => row(await run(apex), "dmarc", `_dmarc.${D}`);
    expect(await parent("v=DMARC1; p=reject; sp=none")).toMatchObject({ status: "warn", detail: expect.stringMatching(/^sp=none:/) });
    expect(await parent("v=DMARC1; p=none")).toMatchObject({ status: "warn", detail: expect.stringMatching(/^p=none:/) });
    expect(await parent("v=DMARC1; p=reject; sp=whatever")).toMatchObject({ status: "warn", detail: expect.stringMatching(/^no valid sp= tag/) });
    expect(await parent("v=DMARC1; sp=reject")).toMatchObject({ status: "pass" });
    expect(row(await check(dmarc(["v=DMARC1; sp=reject"])), "dmarc", `_dmarc.${D}`)).toMatchObject({ status: "warn", detail: expect.stringMatching(/^no valid p= tag/) });
  });
});

describe("dns.mail — MX", () => {
  const mx = (records: [number, string][] | undefined): Zone => ({ ...VALID, [D]: { ...VALID[D], mx: records } });

  it("a lost MX fails, by name, even with another one left", async () => {
    const r = await check(mx([OLD_MX[0]]));
    expect(row(r, "mx", D)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^mx2\.oldmail\.example\.test is gone; it was there at the freeze/) });
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("mx2.oldmail.example.test");
  });

  it("every MX replaced fails, naming each that went", async () => {
    const r = await check(mx([[10, "mx.newhost.example.test"]]));
    expect(row(r, "mx", D).detail).toMatch(/^mx1\.oldmail\.example\.test, mx2\.oldmail\.example\.test is gone/);
  });

  it("none at all fails, whether or not there were any at the freeze", async () => {
    expect(row(await check(mx(undefined)), "mx", D).status).toBe("fail");
    const never = mx(undefined);
    const r = await check(never, { frozen: await freeze(never) });
    expect(row(r, "mx", D)).toMatchObject({ status: "fail", detail: "no MX records: mail to this domain bounces" });
  });

  it("a null MX (\"accepts no mail\") is no MX", async () => {
    const r = await check(mx([[0, "."]]));
    expect(row(r, "mx", D).values).toEqual([]);
    expect(row(r, "mx", D).status).toBe("fail");
  });

  it("an added host or a new priority loses nothing but is not unchanged: warn, showing what it was", async () => {
    const added = await check(mx([...OLD_MX, [30, "mx3.oldmail.example.test"]]));
    expect(row(added, "mx", D)).toMatchObject({ status: "warn", detail: "changed since the freeze (was: 10 mx1.oldmail.example.test, 20 mx2.oldmail.example.test)" });
    expect(added.status).toBe("warn");
    expect(row(await check(mx([[5, OLD_MX[0][1]], OLD_MX[1]])), "mx", D).status).toBe("warn");
    expect(row(await check(mx([[...OLD_MX[1]], [...OLD_MX[0]]])), "mx", D).status).toBe("pass");
    expect(row(await check(mx([[10, "MX1.OldMail.Example.Test"], [20, "mx2.oldmail.example.test"]])), "mx", D).status).toBe("pass");
    const none: Zone = { ...OLD, [D]: { txt: OLD[D].txt } };
    expect(row(await check(mx(OLD_MX), { frozen: await freeze(none) }), "mx", D)).toMatchObject({ status: "warn", detail: "changed since the freeze (was: none)" });
  });

  it("the sender's feedback MX on the Return-Path host is kept too, once the freeze saw it", async () => {
    const frozen = await freeze(VALID);
    expect(frozen.records[`mx ${SEND}`]).toEqual(["10 feedback-smtp.eu-west-1.amazonses.com"]);
    const r = await check({ ...VALID, [SEND]: { txt: VALID[SEND].txt } }, { frozen });
    expect(row(r, "mx", SEND)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^feedback-smtp\.eu-west-1\.amazonses\.com is gone/) });
  });
});

describe("dns.mail — an answer is not an error, and an error is not a fail", () => {
  it.each([
    ["spf", SEND],
    ["spf", D],
    ["dkim", `resend._domainkey.${D}`],
    ["dkim", `google._domainkey.${D}`],
    ["dmarc", `_dmarc.${D}`],
    ["mx", D],
  ])("a %s lookup of %s that times out is inconclusive, never fail and never pass", async (record, name) => {
    const r = await check({ ...VALID, [name]: { err: "ETIMEOUT" } });
    expect(row(r, record, name)).toMatchObject({ status: "inconclusive", values: [], detail: "lookup failed (ETIMEOUT)" });
    expect(r.status).toBe("inconclusive");
  });

  it("an include that times out is inconclusive: it may hold what is missing", async () => {
    const r = await check({ ...VALID, [SEND]: { txt: ["v=spf1 include:_spf.shop.example.test ~all"] }, "_spf.shop.example.test": { err: "ETIMEOUT" } });
    expect(row(r, "spf", SEND)).toMatchObject({ status: "inconclusive", detail: "lookup failed (_spf.shop.example.test: ETIMEOUT)" });
  });

  it("NXDOMAIN and no records are answers: the record is missing, not unknown", async () => {
    const zone = { ...VALID };
    delete zone[SEND]; // NXDOMAIN
    expect(row(await check(zone), "spf", SEND).status).toBe("fail");
    expect(row(await check({ ...VALID, [SEND]: {} }), "spf", SEND).status).toBe("fail"); // NODATA
  });

  it("a definite fail still reads fail beside a lookup that failed", async () => {
    const r = await check({ ...VALID, [`resend._domainkey.${D}`]: { err: "ESERVFAIL" }, [`_dmarc.${D}`]: {} });
    expect(r.status).toBe("fail");
    expect(r.detail?.indexOf("dmarc _dmarc")).toBeLessThan(r.detail?.indexOf("dkim resend") ?? -1);
  });

  it("a lookup that failed outranks a warn, and its reason comes first: what could not be read may be worse", async () => {
    const r = await check({ ...VALID, [`resend._domainkey.${D}`]: { err: "ESERVFAIL" }, [`_dmarc.${D}`]: { txt: ["v=DMARC1; p=none"] } });
    expect(row(r, "dmarc", `_dmarc.${D}`).status).toBe("warn");
    expect(r.status).toBe("inconclusive");
    expect(r.detail?.indexOf("dkim resend")).toBeLessThan(r.detail?.indexOf("dmarc _dmarc") ?? -1);
  });
});

describe("dns.mail — the frozen copy", () => {
  it("no snapshot reads inconclusive with every record valid, never a pass", async () => {
    const r = await check(VALID, { frozen: null });
    expect(r.status).toBe("inconclusive");
    expect(row(r, "freeze", D)).toMatchObject({ status: "inconclusive", detail: expect.stringMatching(/^No frozen copy of the old mail records/) });
    expect(r.detail).toMatch(/No frozen copy/);
    expect(r.frozenAt).toBeNull();
  });

  it("no snapshot, and what is wrong now is still a fail", async () => {
    expect((await check({ ...VALID, [`_dmarc.${D}`]: {} }, { frozen: null })).status).toBe("fail");
  });

  it("a freeze that could not read a record is no copy of it: inconclusive, naming it, even with the record there now", async () => {
    const frozen = await freeze({ ...OLD, [`_dmarc.${D}`]: { err: "ETIMEOUT" } });
    expect(frozen.errors).toEqual({ [`dmarc _dmarc.${D}`]: "ETIMEOUT" });
    const r = await check(VALID, { frozen });
    expect(r.status).toBe("inconclusive");
    expect(row(r, "freeze", D).detail).toBe(`The freeze could not read dmarc _dmarc.${D}: freeze again.`);
    expect(row(r, "dmarc", `_dmarc.${D}`).status).toBe("pass");
  });

  it("a read failing at the freeze does not read as an added MX", async () => {
    const frozen = await freeze({ ...OLD, [D]: { err: "ETIMEOUT" } });
    const r = await check(VALID, { frozen });
    expect(row(r, "mx", D).status).toBe("pass");
    expect(r.status).toBe("inconclusive");
  });

  it("a copy of another domain, or of another sending domain, is no copy", async () => {
    const other = await check(VALID, { frozen: { ...(await freeze()), domain: "other.example.test" } });
    expect(other.status).toBe("inconclusive");
    expect(row(other, "freeze", D).detail).toMatch(/were read for other\.example\.test/);
    const sender = await check(VALID, { frozen: { ...(await freeze()), senderDomain: "other.example.test" } });
    expect(sender.status).toBe("inconclusive");
    expect(row(sender, "mx", D).detail).toBeUndefined();
  });

  it("the result says when the copy it compared with was read; a copy it did not use gives no date", async () => {
    const frozen = await freeze();
    expect((await check(VALID, { frozen })).frozenAt).toBe(frozen.readAt);
    expect((await check(VALID, { frozen: { ...frozen, domain: "other.example.test" } })).frozenAt).toBeNull();
  });

  it("the copy keeps only mail records, under the domain that moves (www or not) and with no key that did not answer", async () => {
    const snapshot = await freezeMailRecords({ sourceUrl: `https://www.${D}`, settings: null }, seamOf(OLD), FROM);
    expect(snapshot).toMatchObject({ domain: D, senderDomain: D, errors: {} });
    expect(snapshot?.records).toEqual({
      [`spf ${D}`]: ["v=spf1 include:_spf.oldmail.example.test ip4:203.0.113.7 ~all"],
      [`mx ${D}`]: ["10 mx1.oldmail.example.test", "20 mx2.oldmail.example.test"],
      [`dmarc _dmarc.${D}`]: ["v=DMARC1; p=quarantine; rua=mailto:dmarc@shop.example.test"],
      [`dkim google._domainkey.${D}`]: ["v=DKIM1; k=rsa; p=OLDKEY"],
    });
    expect(new Date(snapshot?.readAt ?? "").getTime()).toBeGreaterThan(0);
  });

  it("a site at an IP address has no DNS to freeze", async () => {
    expect(await freezeMailRecords({ sourceUrl: "http://192.0.2.10", settings: null }, seamOf(OLD), FROM)).toBeNull();
  });

  it("settings.expectedHost names the domain that moves", async () => {
    const snapshot = await freezeMailRecords({ sourceUrl: "https://staging.example.test", settings: { expectedHost: D } }, seamOf(OLD), FROM);
    expect(snapshot?.domain).toBe(D);
  });

  it("the copy survives the snapshot's JSON, and a snapshot without one (frozen before this check) has none", async () => {
    const frozen = await freeze();
    const read = mailSnapshotOf(JSON.parse(JSON.stringify({ id: "s", mail: frozen })));
    expect(read).toEqual(frozen);
    expect(mailSnapshotOf({ id: "s" })).toBeNull();
    expect(mailSnapshotOf(null)).toBeNull();
    expect(mailSnapshotOf({ mail: { domain: 7 } })).toBeNull();
    expect(mailSnapshotOf({ mail: { domain: 7, records: {} } })).toBeNull();
    expect(mailSnapshotOf({ mail: { domain: D, records: {} } })?.errors).toEqual({});
  });
});

describe("dns.mail — what a freeze asks for", () => {
  /** Selectors cannot be listed, so these are asked for by name. Spelled out here, so one dropped from the code goes red. */
  const COMMON = ["default", "google", "selector1", "selector2", "k1", "s1", "s2", "mail", "dkim"];
  /** One name's lookups: a TXT for its SPF and its MX, then a TXT each for its DMARC and every selector. */
  const readsOf = (name: string, selectors: readonly string[]) => [name, name, `_dmarc.${name}`, ...selectors.map((s) => `${s}._domainkey.${name}`)];
  const lookups = async (settings: unknown = null, from = FROM) => {
    const asked: string[] = [];
    await freezeMailRecords(project(settings), seamOf(OLD, asked), from);
    return asked.sort();
  };

  it("the domain, with the sender's selector and the nine common ones, and the Return-Path host: each lookup once", async () => {
    expect(await lookups()).toEqual([...readsOf(D, ["resend", ...COMMON]), SEND, SEND].sort());
  });

  it("settings replace the sender's selector; a common one is not asked twice, nor the domain when it is its own Return-Path host", async () => {
    expect(await lookups({ dkimSelectors: ["legacy2", "s1"], spfSubdomain: "" })).toEqual(readsOf(D, ["legacy2", ...COMMON]).sort());
  });

  it("a from address on another domain adds that domain's, with the Return-Path host under it", async () => {
    const other = "other-brand.example.test";
    const selectors = ["resend", ...COMMON];
    expect(await lookups(null, `noreply@${other}`)).toEqual([...readsOf(D, selectors), ...readsOf(other, selectors), `send.${other}`, `send.${other}`].sort());
  });

  it.each(COMMON)("a key on the common selector %s is kept without settings naming it, so losing it fails by name", async (selector) => {
    const name = `${selector}._domainkey.${D}`;
    const frozen = await freeze({ ...OLD, [name]: { txt: ["p=COMMONKEY"] } });
    expect(frozen.records[`dkim ${name}`]).toEqual(["p=COMMONKEY"]);
    const zone = { ...VALID };
    delete zone[name];
    expect(row(await check(zone, { frozen }), "dkim", name)).toMatchObject({ status: "fail", detail: expect.stringMatching(/^no DKIM key; it was there at the freeze/) });
  });
});

describe("dns.mail — the sending domain", () => {
  it("a from address on another domain is a warn: the row must not go green on the wrong domain's records", async () => {
    const from = "noreply@other-brand.example.test";
    const zone: Zone = {
      ...OLD,
      "other-brand.example.test": { mx: [[10, "mx.example.test"]] },
      "send.other-brand.example.test": SENDER[SEND], "amazonses.com": SENDER["amazonses.com"],
      "resend._domainkey.other-brand.example.test": { txt: ["p=KEY"] }, "_dmarc.other-brand.example.test": { txt: ["v=DMARC1; p=reject"] },
    };
    const r = await check(zone, { from, frozen: await freezeMailRecords(project(), seamOf(zone), from) });
    expect(r.status).toBe("warn");
    expect(row(r, "from", "other-brand.example.test").detail).toContain(`the shop sends as ${from}`);
    expect(row(r, "spf", "send.other-brand.example.test").status).toBe("pass");
    // The domain that moves is still held to its frozen records.
    expect(row(r, "mx", D).status).toBe("pass");
    const lost = await check({ ...zone, [D]: { txt: OLD[D].txt } }, { from, frozen: await freezeMailRecords(project(), seamOf(zone), from) });
    expect(row(lost, "mx", D).status).toBe("fail");
  });

  it("each bare domain's SPF is read whatever the freeze saw: two records that came since fail, by name", async () => {
    const other = "other-brand.example.test";
    const from = `noreply@${other}`;
    const zone: Zone = {
      ...OLD,
      [D]: { mx: OLD_MX }, [other]: { mx: [[10, "mx.example.test"]] },
      [`send.${other}`]: SENDER[SEND], "amazonses.com": SENDER["amazonses.com"],
      [`resend._domainkey.${other}`]: { txt: ["p=KEY"] }, [`_dmarc.${other}`]: { txt: ["v=DMARC1; p=reject"] },
    };
    const frozen = await freezeMailRecords(project(), seamOf(zone), from);
    const two = ["v=spf1 -all", "v=spf1 ~all"];
    const r = await check({ ...zone, [D]: { ...zone[D], txt: two }, [other]: { ...zone[other], txt: two } }, { from, frozen });
    for (const name of [D, other]) expect(row(r, "spf", name), name).toMatchObject({ status: "fail", detail: expect.stringMatching(/^2 v=spf1 records/) });
  });

  it("a from address on a subdomain or a parent of the domain that moves is the same domain", async () => {
    const zone: Zone = { ...VALID, [`send.mail.${D}`]: SENDER[SEND], [`resend._domainkey.mail.${D}`]: { txt: ["p=KEY"] }, [`mail.${D}`]: { mx: [[10, "mx.example.test"]] } };
    const from = `orders@mail.${D}`;
    const r = await check(zone, { from, frozen: await freezeMailRecords(project(), seamOf(zone), from) });
    expect(r.rows.some((x) => x.record === "from")).toBe(false);
    expect(r).toMatchObject({ senderDomain: `mail.${D}`, spfHost: `send.mail.${D}`, status: "pass" });
    const parent = await checkMailDns({ domain: `butik.${D}`, from: FROM, sender: RESEND_SENDER, frozen: await freezeMailRecords(project(null, `butik.${D}`), seamOf(VALID), FROM) }, seamOf(VALID));
    expect(parent.rows.some((x) => x.record === "from")).toBe(false);
    expect(parent.status).toBe("pass");
  });

  it("a display name, a case difference and a non-ASCII domain read as the address they are", async () => {
    const named = await check(VALID, { from: `Orders <ORDERS@Shop.Example.Test>`, frozen: await freeze() });
    expect(named).toMatchObject({ senderDomain: D, status: "pass" });
    const ascii = new URL("https://bücher.example.test").hostname;
    const idn = await checkMailDns({ domain: ascii, from: "orders@bücher.example.test", sender: RESEND_SENDER, frozen: null }, seamOf({}));
    expect(idn.senderDomain).toBe(ascii);
    expect(idn.rows.some((x) => x.record === "from")).toBe(false);
  });

  it("a space after the address changes nothing, and a name node:url refuses is still the domain the address names", async () => {
    expect(await check(VALID, { from: `${FROM} `, frozen: await freeze() })).toMatchObject({ senderDomain: D, status: "pass" });
    const refused = await checkMailDns({ domain: D, from: "orders@xn--iñvalid.example.test", sender: RESEND_SENDER, frozen: null }, seamOf(VALID));
    expect(refused.senderDomain).toBe("xn--iñvalid.example.test");
    expect(row(refused, "from", "xn--iñvalid.example.test").status).toBe("warn");
  });

  it("a from address with no domain is inconclusive, and the domain that moves is read instead", async () => {
    const r = await check(VALID, { from: "not-an-address" });
    expect(r.senderDomain).toBe(D);
    expect(row(r, "from", "not-an-address").status).toBe("inconclusive");
    expect(r.status).toBe("inconclusive");
    // A freeze reads it the same way, so its copy is of the domain that moves.
    expect(await freezeMailRecords(project(), seamOf(OLD), "not-an-address")).toMatchObject({ domain: D, senderDomain: D });
  });
});

describe("dns.mail — the row reads with the owner's sign-off", () => {
  const NOW = new Date("2026-10-31T12:00:00Z");
  const CURRENT: RunBindings = { snapshotId: "snap-1", configHash: "site-a", buildSha: "build-a" };
  const SIGNED = { snapshotId: "snap-1", configHash: "site-a" };
  const entry = (over: Record<string, unknown> = {}) => ({ status: "pass", note: "Inbox at Gmail, score 9.5/10", actor: "user:owner", at: new Date(NOW.getTime() - 60_000).toISOString(), bindings: SIGNED, ...over });
  const run = (status: string, over: Partial<LatestRun> = {}): LatestRun => ({ checkId: "dns.mail", status, finishedAt: new Date(NOW.getTime() - 60_000), bindings: CURRENT, ...over });

  it.each([
    ["pass", "pass", "pass"],
    ["pass", "missing", "inconclusive"],
    ["pass", "stale", "inconclusive"],
    ["pass", "warn", "warn"],
    ["pass", "fail", "fail"],
    ["fail", "pass", "fail"],
    ["fail", "missing", "fail"],
    ["warn", "pass", "warn"],
    ["warn", "missing", "inconclusive"],
    ["warn", "fail", "fail"],
    ["inconclusive", "pass", "inconclusive"],
    ["inconclusive", "fail", "fail"],
    ["skip", "pass", "skip"],
    ["something-new", "pass", "inconclusive"],
  ] as const)("DNS %s + sign-off %s reads %s", (machine, state, reads) => {
    expect(withSignOff(run(machine), state).status).toBe(reads);
  });

  it("says why, after what the run said; two passes need no reason", () => {
    expect(withSignOff(run("pass"), "missing").detail).toBe("Waiting for the owner's sign-off (migration.attest).");
    expect(withSignOff(run("fail", { detail: "mx x: gone" }), "stale").detail).toMatch(/^mx x: gone The owner's sign-off is over 24 hours old/);
    expect(withSignOff(run("pass"), "fail").detail).toBe("The owner signed this off as a fail.");
    expect(withSignOff(run("pass"), "pass").detail).toBeUndefined();
    expect(withSignOff(run("pass", { detail: "x" }), "pass").detail).toBe("x");
  });

  it("a sign-off counts under 24 hours old, on the current snapshot and new site; a deploy does not void it", () => {
    expect(signOffState(entry(), NOW, CURRENT)).toBe("pass");
    expect(signOffState(entry({ status: "warn" }), NOW, CURRENT)).toBe("warn");
    expect(signOffState(entry({ status: "fail" }), NOW, CURRENT)).toBe("fail");
    expect(signOffState(entry(), NOW, { ...CURRENT, buildSha: "build-b" })).toBe("pass");
    expect(signOffState(entry({ at: new Date(NOW.getTime() - READY_WINDOW_MS + 1).toISOString() }), NOW, CURRENT)).toBe("pass");
    expect(signOffState(entry({ at: new Date(NOW.getTime() - READY_WINDOW_MS).toISOString() }), NOW, CURRENT)).toBe("stale");
    expect(signOffState(entry(), NOW, { ...CURRENT, snapshotId: "snap-2" })).toBe("stale");
    expect(signOffState(entry(), NOW, { ...CURRENT, configHash: "site-b" })).toBe("stale");
    expect(signOffState(entry({ bindings: undefined }), NOW, CURRENT)).toBe("stale");
  });

  it("only a pass goes out of date: a warn or a fail stays what it said until the owner signs again, as a sign-off-only row's failed run does", () => {
    const old = { at: new Date(NOW.getTime() - READY_WINDOW_MS).toISOString() };
    for (const status of ["warn", "fail"] as const) {
      expect(signOffState(entry({ status, ...old }), NOW, CURRENT), status).toBe(status);
      expect(signOffState(entry({ status }), NOW, { ...CURRENT, snapshotId: "snap-2" }), status).toBe(status);
      expect(signOffState(entry({ status }), NOW, { ...CURRENT, configHash: "site-b" }), status).toBe(status);
      expect(signOffState(entry({ status, bindings: undefined }), NOW, CURRENT), status).toBe(status);
    }
    expect(withSignOff(run("pass"), signOffState(entry({ status: "fail", ...old }), NOW, CURRENT))).toMatchObject({ status: "fail", detail: "The owner signed this off as a fail." });
    expect(signOffState(entry(old), NOW, CURRENT)).toBe("stale");
  });

  it("nothing usable is missing, not a pass", () => {
    for (const bad of [undefined, null, {}, "pass", entry({ status: "skip" }), entry({ at: 7 }), entry({ at: "not a date" }), entry({ status: "fail", at: 7 }), entry({ status: "warn", at: "not a date" })]) {
      expect(signOffState(bad, NOW, CURRENT), JSON.stringify(bad)).toBe("missing");
    }
  });

  it("the counter: a DNS pass without a sign-off keeps the required row out of n; with both it counts", () => {
    const counted = (state: Parameters<typeof withSignOff>[1], machine = "pass") =>
      readyForDns(new Map([["dns.mail", withSignOff(run(machine), state)]]), { now: NOW, current: CURRENT }).missing.includes("dns.mail");
    expect(counted("missing")).toBe(true);
    expect(counted("stale")).toBe(true);
    expect(counted("warn")).toBe(true);
    expect(counted("pass", "warn")).toBe(true);
    expect(counted("pass")).toBe(false);
  });
});
