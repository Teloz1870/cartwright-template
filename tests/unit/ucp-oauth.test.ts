import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { createHash } from "node:crypto";

/**
 * UCP identity-linking OAuth core (Hul D). Tester de pure crypto/scope-dele
 * direkte og DB-stierne med en mocket prisma. Sikkerheds-kritisk modul → bred
 * dækning (PKCE, single-use codes, scope-eskalering, revoke-cascade).
 */

const mocks = vi.hoisted(() => ({
  authCodeFindUnique: vi.fn(),
  authCodeUpdateMany: vi.fn(),
  authCodeCreate: vi.fn(),
  tokenFindUnique: vi.fn(),
  tokenUpdateMany: vi.fn(),
  tokenCreate: vi.fn(),
  clientFindUnique: vi.fn(),
  clientCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    oAuthAuthCode: {
      findUnique: mocks.authCodeFindUnique,
      updateMany: mocks.authCodeUpdateMany,
      create: mocks.authCodeCreate,
    },
    oAuthToken: {
      findUnique: mocks.tokenFindUnique,
      updateMany: mocks.tokenUpdateMany,
      create: mocks.tokenCreate,
    },
    oAuthClient: {
      findUnique: mocks.clientFindUnique,
      create: mocks.clientCreate,
    },
  },
}));

import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  isHttpsOrLoopback,
  OAuthError,
  parseScopeString,
  redeemAuthCode,
  redirectUriAllowed,
  refreshTokenGrant,
  registerPublicClient,
  revokeToken,
  validateAccessToken,
  validateRequestedScopes,
  verifyPkceS256,
} from "@/lib/ucp/oauth";

const challengeFor = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

const codeFor = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p;
    return undefined;
  } catch (e) {
    return (e as OAuthError).code;
  }
};

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-pepper";
});
beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe("PKCE S256", () => {
  it("accepterer en korrekt verifier", () => {
    const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(verifyPkceS256(v, challengeFor(v))).toBe(true);
  });
  it("afviser en forkert verifier", () => {
    expect(verifyPkceS256("wrong", challengeFor("right"))).toBe(false);
  });
  it("afviser ved længde-mismatch uden at kaste", () => {
    expect(verifyPkceS256("x", "short")).toBe(false);
  });
});

describe("scope-validering", () => {
  it("accepterer et subset af supported ∩ client-allowed", () => {
    expect(
      validateRequestedScopes(
        ["dev.ucp.shopping.order:read"],
        ["dev.ucp.shopping.order:read", "dev.ucp.shopping.order:manage"],
      ),
    ).toEqual(["dev.ucp.shopping.order:read"]);
  });
  it("afviser ikke-supporterede scopes", () => {
    expect(() => validateRequestedScopes(["evil:all"], ["evil:all"])).toThrow(OAuthError);
  });
  it("afviser scopes klienten ikke har fået", () => {
    expect(() =>
      validateRequestedScopes(["dev.ucp.shopping.order:manage"], ["dev.ucp.shopping.order:read"]),
    ).toThrow(/not granted/);
  });
  it("afviser tomt scope-sæt", () => {
    expect(() => validateRequestedScopes([], ["dev.ucp.shopping.order:read"])).toThrow(OAuthError);
  });
  it("parseScopeString splitter på whitespace", () => {
    expect(parseScopeString(" a  b\tc ")).toEqual(["a", "b", "c"]);
  });
});

describe("redirect_uri + registrering", () => {
  it("redirectUriAllowed kræver eksakt match", () => {
    const reg = ["https://x.com/cb"];
    expect(redirectUriAllowed("https://x.com/cb", reg)).toBe(true);
    expect(redirectUriAllowed("https://x.com/cb/", reg)).toBe(false);
    expect(redirectUriAllowed("https://x.com/cb?a=1", reg)).toBe(false);
  });
  it("isHttpsOrLoopback: https ok, http-loopback ok, http-andet nej", () => {
    expect(isHttpsOrLoopback("https://x.com/cb")).toBe(true);
    expect(isHttpsOrLoopback("http://127.0.0.1:9000/cb")).toBe(true);
    expect(isHttpsOrLoopback("http://evil.com/cb")).toBe(false);
    expect(isHttpsOrLoopback("not-a-url")).toBe(false);
  });
});

describe("metadata", () => {
  it("authorization-server-metadata har påkrævede felter (S256 only, iss true)", () => {
    const m = buildAuthorizationServerMetadata("https://shop.example");
    expect(m.issuer).toBe("https://shop.example");
    expect(m.authorization_endpoint).toBe("https://shop.example/oauth/authorize");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.grant_types_supported).toContain("refresh_token");
    expect(m.authorization_response_iss_parameter_supported).toBe(true);
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
  it("protected-resource-metadata peger på sig selv", () => {
    const m = buildProtectedResourceMetadata("https://shop.example");
    expect(m.resource).toBe("https://shop.example");
    expect(m.authorization_servers).toEqual(["https://shop.example"]);
  });
});

describe("redeemAuthCode", () => {
  const base = {
    code: "the-code",
    clientId: "client_1",
    redirectUri: "https://x.com/cb",
    codeVerifier: "verifier-123",
  };
  const validRow = () => ({
    clientId: "client_1",
    userId: "user_1",
    redirectUri: "https://x.com/cb",
    scope: "dev.ucp.shopping.order:read",
    codeChallenge: challengeFor("verifier-123"),
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  });

  it("ukendt code → invalid_grant", async () => {
    mocks.authCodeFindUnique.mockResolvedValue(null);
    expect(await codeFor(redeemAuthCode(base))).toBe("invalid_grant");
  });
  it("allerede consumed → invalid_grant", async () => {
    mocks.authCodeFindUnique.mockResolvedValue({ ...validRow(), consumedAt: new Date() });
    expect(await codeFor(redeemAuthCode(base))).toBe("invalid_grant");
  });
  it("udløbet → invalid_grant", async () => {
    mocks.authCodeFindUnique.mockResolvedValue({ ...validRow(), expiresAt: new Date(Date.now() - 1) });
    expect(await codeFor(redeemAuthCode(base))).toBe("invalid_grant");
  });
  it("client-mismatch → invalid_grant", async () => {
    mocks.authCodeFindUnique.mockResolvedValue({ ...validRow(), clientId: "other" });
    expect(await codeFor(redeemAuthCode(base))).toBe("invalid_grant");
  });
  it("redirect_uri-mismatch → invalid_grant", async () => {
    mocks.authCodeFindUnique.mockResolvedValue({ ...validRow(), redirectUri: "https://evil.com" });
    expect(await codeFor(redeemAuthCode(base))).toBe("invalid_grant");
  });
  it("forkert PKCE-verifier → invalid_grant", async () => {
    mocks.authCodeFindUnique.mockResolvedValue(validRow());
    expect(await codeFor(redeemAuthCode({ ...base, codeVerifier: "wrong" }))).toBe("invalid_grant");
  });
  it("happy path → consumer single-use + returnerer userId/scope", async () => {
    mocks.authCodeFindUnique.mockResolvedValue(validRow());
    mocks.authCodeUpdateMany.mockResolvedValue({ count: 1 });
    const res = await redeemAuthCode(base);
    expect(res).toEqual({ userId: "user_1", scope: "dev.ucp.shopping.order:read" });
    expect(mocks.authCodeUpdateMany).toHaveBeenCalledTimes(1);
  });
  it("tabt single-use-race (updateMany count 0) → invalid_grant", async () => {
    mocks.authCodeFindUnique.mockResolvedValue(validRow());
    mocks.authCodeUpdateMany.mockResolvedValue({ count: 0 });
    expect(await codeFor(redeemAuthCode(base))).toBe("invalid_grant");
  });
});

describe("validateAccessToken", () => {
  const good = () => ({
    kind: "access",
    userId: "user_1",
    clientId: "client_1",
    scope: "dev.ucp.shopping.order:read dev.ucp.shopping.order:manage",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  it("ukendt/forkert-kind/revoked/expired → invalid_token (401)", async () => {
    for (const row of [
      null,
      { ...good(), kind: "refresh" },
      { ...good(), revokedAt: new Date() },
      { ...good(), expiresAt: new Date(Date.now() - 1) },
    ]) {
      mocks.tokenFindUnique.mockResolvedValue(row);
      expect(await codeFor(validateAccessToken("t", []))).toBe("invalid_token");
    }
  });
  it("manglende scope → insufficient_scope (403)", async () => {
    mocks.tokenFindUnique.mockResolvedValue({ ...good(), scope: "dev.ucp.shopping.order:read" });
    expect(await codeFor(validateAccessToken("t", ["dev.ucp.shopping.order:manage"]))).toBe(
      "insufficient_scope",
    );
  });
  it("gyldigt + tilstrækkelig scope → identitet", async () => {
    mocks.tokenFindUnique.mockResolvedValue(good());
    const res = await validateAccessToken("t", ["dev.ucp.shopping.order:read"]);
    expect(res.userId).toBe("user_1");
    expect(res.scope).toContain("dev.ucp.shopping.order:manage");
  });
});

describe("refreshTokenGrant", () => {
  const refreshRow = () => ({
    id: "rt_1",
    kind: "refresh",
    clientId: "client_1",
    userId: "user_1",
    scope: "dev.ucp.shopping.order:read",
    familyId: "fam_1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  it("ukendt refresh → invalid_grant", async () => {
    mocks.tokenFindUnique.mockResolvedValue(null);
    expect(await codeFor(refreshTokenGrant({ refreshToken: "r", clientId: "client_1" }))).toBe(
      "invalid_grant",
    );
  });
  it("genbrug af allerede-revoked refresh → dræber familien + invalid_grant (reuse-detection)", async () => {
    mocks.tokenFindUnique.mockResolvedValue({ ...refreshRow(), revokedAt: new Date() });
    mocks.tokenUpdateMany.mockResolvedValue({ count: 3 });
    expect(await codeFor(refreshTokenGrant({ refreshToken: "r", clientId: "client_1" }))).toBe(
      "invalid_grant",
    );
    expect(mocks.tokenUpdateMany).toHaveBeenCalledWith({
      where: { familyId: "fam_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
  it("scope-eskalering → invalid_scope", async () => {
    mocks.tokenFindUnique.mockResolvedValue(refreshRow());
    expect(
      await codeFor(
        refreshTokenGrant({
          refreshToken: "r",
          clientId: "client_1",
          requestedScope: ["dev.ucp.shopping.order:manage"],
        }),
      ),
    ).toBe("invalid_scope");
  });
  it("happy path roterer (revoke gammel + udsteder nyt par)", async () => {
    mocks.tokenFindUnique.mockResolvedValue(refreshRow());
    mocks.tokenUpdateMany.mockResolvedValue({ count: 1 });
    mocks.tokenCreate
      .mockResolvedValueOnce({ id: "rt_2" }) // ny refresh
      .mockResolvedValueOnce({ id: "at_2" }); // ny access
    const pair = await refreshTokenGrant({ refreshToken: "r", clientId: "client_1" });
    expect(pair.token_type).toBe("Bearer");
    expect(pair.access_token).toBeTruthy();
    expect(pair.refresh_token).toBeTruthy();
    // gammel refresh + dens access-tokens revokeret før ny udstedelse
    expect(mocks.tokenUpdateMany).toHaveBeenCalled();
  });
});

describe("revokeToken (RFC 7009, client-bundet)", () => {
  it("ukendt token → no-op (ingen updateMany)", async () => {
    mocks.tokenFindUnique.mockResolvedValue(null);
    await revokeToken("nope", "client_1");
    expect(mocks.tokenUpdateMany).not.toHaveBeenCalled();
  });
  it("forkert klient → no-op (kan ikke revokere en andens token)", async () => {
    mocks.tokenFindUnique.mockResolvedValue({ id: "rt_1", kind: "refresh", clientId: "other", familyId: "f" });
    await revokeToken("r", "client_1");
    expect(mocks.tokenUpdateMany).not.toHaveBeenCalled();
  });
  it("refresh → dræber familien (én familyId-updateMany)", async () => {
    mocks.tokenFindUnique.mockResolvedValue({ id: "rt_1", kind: "refresh", clientId: "client_1", familyId: "fam_1" });
    mocks.tokenUpdateMany.mockResolvedValue({ count: 2 });
    await revokeToken("r", "client_1");
    expect(mocks.tokenUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tokenUpdateMany).toHaveBeenCalledWith({
      where: { familyId: "fam_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
  it("access → revoke kun den selv", async () => {
    mocks.tokenFindUnique.mockResolvedValue({ id: "at_1", kind: "access", clientId: "client_1" });
    mocks.tokenUpdateMany.mockResolvedValue({ count: 1 });
    await revokeToken("a", "client_1");
    expect(mocks.tokenUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe("registerPublicClient — least-privilege default", () => {
  it("defaulter til kun order:read når scope udelades (ingen order:manage)", async () => {
    mocks.clientCreate.mockResolvedValue({ id: "c1" });
    const reg = await registerPublicClient({ name: "X", redirectUris: ["https://x.com/cb"] });
    expect(reg.scopes).toEqual(["dev.ucp.shopping.order:read"]);
  });
  it("honorerer eksplicit order:manage når anmodet", async () => {
    mocks.clientCreate.mockResolvedValue({ id: "c2" });
    const reg = await registerPublicClient({
      name: "X",
      redirectUris: ["https://x.com/cb"],
      scopes: ["dev.ucp.shopping.order:read", "dev.ucp.shopping.order:manage"],
    });
    expect(reg.scopes).toContain("dev.ucp.shopping.order:manage");
  });
  it("afviser når ingen gyldig https/loopback redirect_uri", async () => {
    await expect(
      registerPublicClient({ name: "X", redirectUris: ["http://evil.com/cb"] }),
    ).rejects.toThrow();
  });
});
