import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAddresses, _clearCacheForTest } from "@/lib/address";

const mockDawaResponse = [
  {
    tekst: "Vesterbrogade 12, 1620 København V",
    adresse: { vejnavn: "Vesterbrogade", husnr: "12", postnr: "1620", postnrnavn: "København V" },
  },
  {
    tekst: "Vesterbrogade 14, 1620 København V",
    adresse: { vejnavn: "Vesterbrogade", husnr: "14", postnr: "1620", postnrnavn: "København V" },
  },
];

describe("searchAddresses (DAWA-klient)", () => {
  beforeEach(() => {
    _clearCacheForTest();
    vi.restoreAllMocks();
  });

  it("returnerer normaliserede matches for happy-path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDawaResponse,
    }));

    const matches = await searchAddresses("Vesterbrogade 12");
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      display: "Vesterbrogade 12, 1620 København V",
      address: "Vesterbrogade 12",
      zip: "1620",
      city: "København V",
    });
  });

  it("returnerer tom array for query < 2 tegn", async () => {
    const matches = await searchAddresses("V");
    expect(matches).toEqual([]);
  });

  it("returnerer tom array når DAWA returnerer ingen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }));
    const matches = await searchAddresses("Nørrebrogade 999999");
    expect(matches).toEqual([]);
  });

  it("kaster fejl ved netværksfejl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));
    await expect(searchAddresses("Vesterbrogade 12")).rejects.toThrow(/503/);
  });

  it("cacher resultater (samme query → kun 1 fetch)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDawaResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchAddresses("Vesterbrogade 12");
    await searchAddresses("Vesterbrogade 12");
    await searchAddresses("VESTERBROGADE 12");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
