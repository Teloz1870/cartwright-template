import { afterEach, describe, expect, it } from "vitest";
import { isPhoneWebhookAuthorized } from "@/plugins/phone-widget/lib/verify-webhook";

const URL_BASE = "https://shop.example.com/api/phone/webhook";

function req(opts: { headers?: Record<string, string>; query?: string } = {}): Request {
  const url = opts.query ? `${URL_BASE}?${opts.query}` : URL_BASE;
  return new Request(url, { method: "POST", headers: opts.headers });
}

const ORIGINAL = process.env.PHONE_INC_WEBHOOK_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PHONE_INC_WEBHOOK_SECRET;
  else process.env.PHONE_INC_WEBHOOK_SECRET = ORIGINAL;
});

describe("isPhoneWebhookAuthorized", () => {
  it("is dormant when no secret is configured — accepts any request (byte-identical behaviour)", () => {
    delete process.env.PHONE_INC_WEBHOOK_SECRET;
    expect(isPhoneWebhookAuthorized(req())).toBe(true);
    expect(isPhoneWebhookAuthorized(req({ headers: { "x-phone-inc-signature": "anything" } }))).toBe(true);
  });

  it("treats an empty/whitespace secret as unset (still dormant)", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "   ";
    expect(isPhoneWebhookAuthorized(req())).toBe(true);
  });

  it("rejects when a secret is set but none is presented", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    expect(isPhoneWebhookAuthorized(req())).toBe(false);
  });

  it("accepts a matching secret via the x-phone-inc-signature header", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    expect(
      isPhoneWebhookAuthorized(req({ headers: { "x-phone-inc-signature": "s3cr3t-value" } })),
    ).toBe(true);
  });

  it("accepts a matching secret via the ?token= query param", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    expect(isPhoneWebhookAuthorized(req({ query: "token=s3cr3t-value" }))).toBe(true);
  });

  it("rejects a wrong secret (header)", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    expect(
      isPhoneWebhookAuthorized(req({ headers: { "x-phone-inc-signature": "wrong" } })),
    ).toBe(false);
  });

  it("rejects a wrong secret (query)", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    expect(isPhoneWebhookAuthorized(req({ query: "token=wrong" }))).toBe(false);
  });

  it("rejects a secret that only shares a prefix (length mismatch is safe)", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    expect(
      isPhoneWebhookAuthorized(req({ headers: { "x-phone-inc-signature": "s3cr3t" } })),
    ).toBe(false);
  });

  it("accepts when one channel matches even if the other carries a foreign value", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    // Correct token in the URL, unrelated value in the header → still accepted.
    expect(
      isPhoneWebhookAuthorized(
        req({ headers: { "x-phone-inc-signature": "provider-noise" }, query: "token=s3cr3t-value" }),
      ),
    ).toBe(true);
  });

  it("trims surrounding whitespace on the presented secret", () => {
    process.env.PHONE_INC_WEBHOOK_SECRET = "s3cr3t-value";
    expect(
      isPhoneWebhookAuthorized(req({ headers: { "x-phone-inc-signature": "  s3cr3t-value  " } })),
    ).toBe(true);
  });
});
