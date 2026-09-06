import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign as edSign, type KeyObject } from "node:crypto";

import {
  PLUS_KEY_PREFIX,
  getPlusStatus,
  maskPlusKey,
  resolvePlusKey,
  verifyPlusKeyOffline,
  verifyPlusKeyOnline,
  type PlusKeyPayload,
} from "@/lib/cartwright-plus";

/* ── Test key minting (mirrors what cartwright.app will do) ─────────────── */

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const PUBLIC_KEY_B64_DER = publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");
const PUBLIC_KEY_PEM = publicKey.export({ format: "pem", type: "spki" }).toString();

const PAYLOAD: PlusKeyPayload = {
  v: 1,
  plan: "plus",
  customer: "cus_test123",
  subscription: "sub_test456",
  issuedAt: 1784050000,
  kid: "2026-01",
};

function mintKey(
  payload: object = PAYLOAD,
  opts: { signer?: KeyObject; prefix?: string; sigBytes?: Buffer } = {},
): string {
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const sig =
    opts.sigBytes ?? edSign(null, payloadBytes, opts.signer ?? privateKey);
  return [
    opts.prefix ?? PLUS_KEY_PREFIX,
    payloadBytes.toString("base64url"),
    Buffer.from(sig).toString("base64url"),
  ].join(".");
}

beforeEach(() => {
  vi.stubEnv("CARTWRIGHT_PLUS_PUBLIC_KEY", PUBLIC_KEY_B64_DER);
  vi.stubEnv("CARTWRIGHT_PLUS_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/* ── Offline verification ───────────────────────────────────────────────── */

describe("verifyPlusKeyOffline", () => {
  it("verifies a correctly signed key (base64 DER public key)", () => {
    const res = verifyPlusKeyOffline(mintKey());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload).toEqual(PAYLOAD);
  });

  it("verifies with a PEM public key too", () => {
    vi.stubEnv("CARTWRIGHT_PLUS_PUBLIC_KEY", PUBLIC_KEY_PEM);
    expect(verifyPlusKeyOffline(mintKey()).ok).toBe(true);
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const key = mintKey();
    const [prefix, , sig] = key.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ ...PAYLOAD, plan: "enterprise" }),
      "utf8",
    ).toString("base64url");
    const res = verifyPlusKeyOffline([prefix, tampered, sig].join("."));
    expect(res).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered signature", () => {
    const res = verifyPlusKeyOffline(
      mintKey(PAYLOAD, { sigBytes: Buffer.alloc(64, 7) }),
    );
    expect(res).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a key signed by a different keypair", () => {
    const other = generateKeyPairSync("ed25519");
    const res = verifyPlusKeyOffline(mintKey(PAYLOAD, { signer: other.privateKey }));
    expect(res).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a wrong prefix", () => {
    const res = verifyPlusKeyOffline(mintKey(PAYLOAD, { prefix: "cw_plus_v2" }));
    expect(res).toEqual({ ok: false, reason: "bad-format" });
  });

  it("rejects garbage / missing segments", () => {
    expect(verifyPlusKeyOffline("not-a-key")).toEqual({ ok: false, reason: "bad-format" });
    expect(verifyPlusKeyOffline("cw_plus_v1.onlyone")).toEqual({
      ok: false,
      reason: "bad-format",
    });
    expect(verifyPlusKeyOffline("cw_plus_v1.$$$.###")).toEqual({
      ok: false,
      reason: "bad-format",
    });
  });

  it("rejects a structurally invalid payload", () => {
    const res = verifyPlusKeyOffline(mintKey({ v: 1, plan: "plus" }));
    expect(res).toEqual({ ok: false, reason: "bad-payload" });
  });

  it("returns no-public-key while only the placeholder is active", () => {
    vi.stubEnv("CARTWRIGHT_PLUS_PUBLIC_KEY", "");
    const res = verifyPlusKeyOffline(mintKey());
    expect(res).toEqual({ ok: false, reason: "no-public-key" });
  });
});

/* ── Key resolution & masking ───────────────────────────────────────────── */

describe("resolvePlusKey / maskPlusKey", () => {
  it("resolves from CARTWRIGHT_PLUS_KEY (trimmed), null when unset/blank", () => {
    vi.stubEnv("CARTWRIGHT_PLUS_KEY", "  cw_plus_v1.abc.def  ");
    expect(resolvePlusKey()).toBe("cw_plus_v1.abc.def");
    vi.stubEnv("CARTWRIGHT_PLUS_KEY", "   ");
    expect(resolvePlusKey()).toBeNull();
    vi.stubEnv("CARTWRIGHT_PLUS_KEY", "");
    expect(resolvePlusKey()).toBeNull();
  });

  it("masks the key, keeping only the edges", () => {
    const masked = maskPlusKey("cw_plus_v1.aaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbb");
    expect(masked).toBe("cw_plus_v1.a…bbbb");
    expect(masked).not.toContain("aaaaaaaaaa");
    expect(maskPlusKey("short")).toBe("shor…");
  });
});

/* ── Online verification (fetch mocked) ─────────────────────────────────── */

describe("verifyPlusKeyOnline", () => {
  it.each(["active", "grace", "inactive"] as const)(
    "maps an explicit '%s' response through",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status }) }),
      );
      await expect(verifyPlusKeyOnline("k")).resolves.toEqual({ status });
    },
  );

  it("fails soft to 'offline' on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(verifyPlusKeyOnline("k")).resolves.toEqual({ status: "offline" });
  });

  it("fails soft to 'offline' on non-2xx and on malformed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    await expect(verifyPlusKeyOnline("k")).resolves.toEqual({ status: "offline" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "banana" }) }),
    );
    await expect(verifyPlusKeyOnline("k")).resolves.toEqual({ status: "offline" });
  });
});

/* ── End-to-end status resolution ───────────────────────────────────────── */

describe("getPlusStatus", () => {
  it("is 'unconfigured' with no env key", async () => {
    const res = await getPlusStatus();
    expect(res).toEqual({ status: "unconfigured", keyPreview: null, payload: null });
  });

  it("is 'invalid' with reason for a bad key (no network call made)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CARTWRIGHT_PLUS_KEY", "cw_plus_v1.corrupt");
    const res = await getPlusStatus();
    expect(res.status).toBe("invalid");
    expect(res.offlineReason).toBe("bad-format");
    expect(res.keyPreview).toContain("…");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is 'active' when offline-valid and cartwright.app confirms", async () => {
    vi.stubEnv("CARTWRIGHT_PLUS_KEY", mintKey());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "active" }) }),
    );
    const res = await getPlusStatus();
    expect(res.status).toBe("active");
    expect(res.payload?.customer).toBe("cus_test123");
  });

  it("is 'offline' (not inactive) when offline-valid but the endpoint is down", async () => {
    vi.stubEnv("CARTWRIGHT_PLUS_KEY", mintKey());
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const res = await getPlusStatus();
    expect(res.status).toBe("offline");
    expect(res.payload).not.toBeNull();
  });
});
