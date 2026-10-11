import { describe, expect, it } from "vitest";

import { isBlockedAddress, parseAndValidateUrl } from "@/lib/import/safe-fetch";

/** SSRF guard for images.import_from_url — pure URL/IP validation. No network. */

describe("isBlockedAddress", () => {
  it("blocks IPv4 private / loopback / link-local / CGNAT ranges", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254", // cloud metadata — the SSRF classic
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1", // CGNAT
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.128.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback / ULA / link-local / mapped-private", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("blocks the HEX shorthand of a mapped-private addr (the ::ffff:127.0.0.1 / ::ffff:7f00:1 bypass)", () => {
    // ::ffff:7f00:1 IS ::ffff:127.0.0.1 — the dotted-only unmapper missed it.
    expect(isBlockedAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedAddress("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254 metadata, hex form
    expect(isBlockedAddress("::ffff:c0a8:1")).toBe(true); // 192.168.0.1, hex form
    expect(isBlockedAddress("0:0:0:0:0:ffff:7f00:1")).toBe(true); // fully-expanded form
  });

  it("blocks IPv6 transition prefixes that embed a private IPv4 (NAT64 / 6to4)", () => {
    // NAT64 64:ff9b::/96 — real cloud SSRF vector (translates to the embedded v4).
    expect(isBlockedAddress("64:ff9b::a9fe:a9fe")).toBe(true); // → 169.254.169.254 metadata
    expect(isBlockedAddress("64:ff9b::7f00:1")).toBe(true); // → 127.0.0.1
    expect(isBlockedAddress("64:ff9b::a00:1")).toBe(true); // → 10.0.0.1
    // 6to4 2002::/16 — embedded v4 lives in the high hextets.
    expect(isBlockedAddress("2002:7f00:1::")).toBe(true); // → 127.0.0.1
    expect(isBlockedAddress("2002:a9fe:a9fe::")).toBe(true); // → 169.254.169.254
  });

  it("allows public IPv6 (and unmaps a public IPv4-mapped/transition addr)", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
    expect(isBlockedAddress("::ffff:808:808")).toBe(false); // 8.8.8.8 hex form
    expect(isBlockedAddress("64:ff9b::808:808")).toBe(false); // NAT64 → public 8.8.8.8
    expect(isBlockedAddress("2002:808:808::")).toBe(false); // 6to4 → public 8.8.8.8
  });

  it("blocks anything that is not a valid IP literal (defensive)", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
  });
});

describe("parseAndValidateUrl", () => {
  it("rejects non-http(s) schemes", () => {
    for (const u of ["ftp://x.com/a", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "gopher://x/"]) {
      expect(() => parseAndValidateUrl(u), u).toThrow();
    }
  });

  it("rejects internal hostnames by name", () => {
    for (const u of ["http://localhost/x", "http://foo.local/x", "http://svc.internal/x"]) {
      expect(() => parseAndValidateUrl(u), u).toThrow(/internal host/);
    }
  });

  it("rejects literal private / loopback / metadata IPs (v4 + v6)", () => {
    expect(() => parseAndValidateUrl("http://127.0.0.1/x")).toThrow(/private\/loopback/);
    expect(() => parseAndValidateUrl("http://169.254.169.254/latest/meta-data")).toThrow(/private\/loopback/);
    expect(() => parseAndValidateUrl("http://10.0.0.5/x")).toThrow(/private\/loopback/);
    expect(() => parseAndValidateUrl("http://[::1]/x")).toThrow(/private\/loopback/);
  });

  it("accepts a normal public https URL", () => {
    const url = parseAndValidateUrl("https://cdn.example.com/img/hero.jpg?w=800");
    expect(url.hostname).toBe("cdn.example.com");
  });

  it("rejects a malformed URL", () => {
    expect(() => parseAndValidateUrl("not a url")).toThrow(/Invalid URL/);
  });
});
