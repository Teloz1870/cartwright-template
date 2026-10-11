import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * authenticateApiKey — DB-koblede afgørelser (find/revoked/EXPIRED/scopes).
 * Udvider den rene helper-suite i api-auth.test.ts med den hidtil utestede
 * kerne: expiresAt-håndhævelsen (skemafeltet fandtes altid, men blev aldrig
 * håndhævet — en udløbet key var funktionelt evig) + afvisnings-rækkefølgen.
 *
 * Opskrift: mock KUN @/lib/db; kør den RIGTIGE authenticateApiKey så
 * assertions pinner faktisk wiring, ikke en re-implementering.
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  authenticateApiKey,
  generateApiKey,
  requireApiScope,
} from "@/lib/api-auth";

function reqWithKey(plaintext: string): Request {
  return new Request("http://localhost/api/v1/tools/products.search", {
    headers: { Authorization: `Bearer ${plaintext}` },
  });
}

/** En gyldig nøgle + den DB-række authenticateApiKey vil slå op. */
function mintKeyRow(overrides: Record<string, unknown> = {}) {
  const { plaintext, hash } = generateApiKey();
  const row = {
    id: "key_1",
    userId: "user_1",
    keyHash: hash,
    scopes: JSON.stringify(["products:read"]),
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  };
  return { plaintext, row };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.apiKey.update.mockResolvedValue({});
});

describe("authenticateApiKey — kerneafgørelser", () => {
  it("gyldig key uden expiry → actor med parsede scopes", async () => {
    const { plaintext, row } = mintKeyRow();
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect(result).toEqual({
      actor: {
        type: "apikey",
        apiKeyId: "key_1",
        userId: "user_1",
        scopes: ["products:read"],
      },
    });
  });

  it("manglende Authorization-header → 401 uden DB-opslag", async () => {
    const result = await authenticateApiKey(new Request("http://localhost/x"));
    expect("error" in result && result.error.status).toBe(401);
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("forkert prefix → 401 uden DB-opslag", async () => {
    const result = await authenticateApiKey(reqWithKey("not_a_real_key"));
    expect("error" in result && result.error.status).toBe(401);
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("ukendt key → 401 Invalid API key", async () => {
    const { plaintext } = mintKeyRow();
    prismaMock.apiKey.findUnique.mockResolvedValue(null);

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect("error" in result && result.error.body.error).toBe("Invalid API key");
  });

  it("revoked key → 401 API key revoked", async () => {
    const { plaintext, row } = mintKeyRow({ revokedAt: new Date("2026-01-01") });
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect("error" in result && result.error.body.error).toBe("API key revoked");
  });

  it("UDLØBET key (expiresAt i fortiden) → 401 API key expired", async () => {
    const { plaintext, row } = mintKeyRow({
      expiresAt: new Date(Date.now() - 60_000),
    });
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect("error" in result && result.error.status).toBe(401);
    expect("error" in result && result.error.body.error).toBe("API key expired");
  });

  it("expiresAt i fremtiden → stadig gyldig", async () => {
    const { plaintext, row } = mintKeyRow({
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect("actor" in result).toBe(true);
  });

  it("revoked OG udløbet → revoked-fejlen vinder (rækkefølge)", async () => {
    const { plaintext, row } = mintKeyRow({
      revokedAt: new Date("2026-01-01"),
      expiresAt: new Date(Date.now() - 60_000),
    });
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect("error" in result && result.error.body.error).toBe("API key revoked");
  });

  it("malformede scopes i DB → 401 integrity-fejl", async () => {
    const { plaintext, row } = mintKeyRow({ scopes: "{not-an-array" });
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect("error" in result && result.error.body.error).toMatch(/malformed scopes/);
  });

  it("lastUsedAt-update der fejler vælter ikke requesten (fire-and-forget)", async () => {
    const { plaintext, row } = mintKeyRow();
    prismaMock.apiKey.findUnique.mockResolvedValue(row);
    prismaMock.apiKey.update.mockRejectedValue(new Error("sqlite busy"));

    const result = await authenticateApiKey(reqWithKey(plaintext));
    expect("actor" in result).toBe(true);
  });
});

describe("requireApiScope — expiry propagerer gennem scope-vejen", () => {
  it("udløbet key → 401 expired FØR scope-tjekket", async () => {
    const { plaintext, row } = mintKeyRow({
      expiresAt: new Date(Date.now() - 1),
      scopes: JSON.stringify(["products:read"]),
    });
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    const result = await requireApiScope(reqWithKey(plaintext), "products:read");
    expect("error" in result && result.error.body.error).toBe("API key expired");
  });
});
