import { describe, expect, it } from "vitest";
import { renderMagicLinkHtml } from "@/lib/auth/email-template";
import { brand } from "@/brand.config";
import {
  magicLinkPerEmailLimiter,
  magicLinkPerIpLimiter,
} from "@/lib/rate-limit";

describe("magic-link email template", () => {
  it("renders the subject, html button, expiry note, and text fallback", () => {
    // F3 (P3-fix): callback-URL og storeName-assertions læser fra brand.config
    // så templaten kan rendres for hvilken som helst fork uden hardcoded
    // solbrillen.dk-strings i testen.
    const url = `${brand.url}/api/auth/callback/email?token=abc`;
    const rendered = renderMagicLinkHtml({
      email: "kunde@example.com",
      url,
      expiresMinutes: 15,
    });

    expect(rendered.subject).toBe(`Log ind på ${brand.storeName}`);
    expect(rendered.html).toContain(`Log ind på ${brand.storeName}`);
    expect(rendered.html).toContain("kunde@example.com");
    expect(rendered.html).toContain(`href="${url}"`);
    expect(rendered.html).toContain("Log ind nu");
    expect(rendered.html).toContain("Link udløber om 15 minutter");
    expect(rendered.html).toContain(
      `&copy; ${brand.footer.copyrightYear} ${brand.storeName}`,
    );
    expect(rendered.text).toContain(url);
  });
});

describe("magic-link rate limiters", () => {
  it("exports separate email and IP limiters with expected names", () => {
    expect(magicLinkPerEmailLimiter.name).toBe("magic-link-email");
    expect(magicLinkPerIpLimiter.name).toBe("magic-link-ip");
  });
});
