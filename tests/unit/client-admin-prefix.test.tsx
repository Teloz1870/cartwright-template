import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isAdminPath, isApiPath } from "@/lib/path-segments";
import messages from "@/messages/en.json";

/**
 * CLIENT-ADMIN-PREFIX — storefront components read `/admin` as a whole path
 * segment, like the proxy does since PROXY-SEGMENT-BOUNDARIES (#693).
 *
 * Four client components hide storefront chrome "inside the admin" with
 * `pathname.startsWith("/admin")`. A migrated WooCommerce shop can have an
 * `/administration` page, and on a shop whose URLs carry no locale prefix
 * (`urls.localePrefix: "never"`)
 * `usePathname()` returns exactly `/administration` — so that page lost its
 * welcome guide, AI assistant and voice button (and, in a fork that mounts it,
 * StorefrontWrapper's children). They now share the proxy's
 * reading through `lib/path-segments.ts`.
 *
 * `/admin` itself is a root route, never under `[locale]`, so `/da/admin` was
 * not treated as admin before and is not now (byte-identical).
 *
 * No brand value is read: the component rows mock `usePathname` and render
 * standalone, so the file passes in a scaffold whose brand.config differs.
 */

const pathnameRef = vi.hoisted(() => ({ current: "/" as string | null }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  pathnameRef.current = "/";
});

const ADMIN = ["/admin", "/admin/", "/admin/produkter", "/admin/konto/x"];
const STOREFRONT = [
  "/administration",
  "/administration/",
  "/da/administration",
  "/adminx",
  "/da/admin", // locale-prefixed: /admin is not under [locale] — unchanged
  "/en/admin/x",
  "/x/admin",
  "/",
  "/da",
];

describe("isAdminPath — the /admin segment, locale-less", () => {
  it.each(ADMIN)("%s is the admin area", (p) => {
    expect(isAdminPath(p)).toBe(true);
  });
  it.each(STOREFRONT)("%s is a storefront path", (p) => {
    expect(isAdminPath(p)).toBe(false);
  });
  it("null/undefined/empty (usePathname before hydration) is not admin", () => {
    expect(isAdminPath(null)).toBe(false);
    expect(isAdminPath(undefined)).toBe(false);
    expect(isAdminPath("")).toBe(false);
  });
});

describe("isApiPath — the /api segment, locale-less (proxy + site proxy)", () => {
  it.each(["/api", "/api/", "/api/v1/tools/x"])("%s is the API", (p) => {
    expect(isApiPath(p)).toBe(true);
  });
  it.each(["/apiary", "/apikultur/", "/da/api", "/", null])("%s is not the API", (p) => {
    expect(isApiPath(p)).toBe(false);
  });
});

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("storefront chrome renders on /administration, hides on /admin", async () => {
  const { default: StorefrontWrapper } = await import("@/components/StorefrontWrapper");
  const { default: AIStylistButton } = await import("@/components/AIStylistButton");
  const { default: VoiceShopButton } = await import("@/components/voice/VoiceShopButton");

  const cases: Array<[string, () => React.ReactElement, string]> = [
    ["StorefrontWrapper", () => <StorefrontWrapper><span data-probe>chrome</span></StorefrontWrapper>, "data-probe"],
    ["AIStylistButton", () => <AIStylistButton ecommerceEnabled={false} />, 'data-cw-ai-assistant="fab"'],
    [
      "VoiceShopButton",
      () => <VoiceShopButton capabilities={{ vision: false, maxMinutes: 5, visionEnabled: false }} />,
      'data-cw-voice-shop="fab"',
    ],
  ];

  describe.each(cases)("%s", (_name, ui, marker) => {
    it.each(["/administration", "/administration/x/", "/adminx", "/da/administration", "/da/admin"])(
      "renders on %s",
      (p) => {
        pathnameRef.current = p;
        expect(render(ui())).toContain(marker);
      },
    );
    it.each(["/admin", "/admin/produkter"])("renders nothing on %s", (p) => {
      pathnameRef.current = p;
      expect(render(ui())).toBe("");
    });
  });
});

describe("no client component reads /admin as a bare prefix", () => {
  // WelcomeGuide renders nothing on the server (it opens after mount); its
  // behaviour is mounted in jsdom in client-admin-prefix-welcome.test.tsx.
  const FILES = [
    "components/StorefrontWrapper.tsx",
    "components/WelcomeGuide.tsx",
    "components/AIStylistButton.tsx",
    "components/voice/VoiceShopButton.tsx",
  ];
  it.each(FILES)("%s uses isAdminPath, not startsWith(\"/admin\")", (file) => {
    const src = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(src).not.toMatch(/startsWith\(\s*["'`]\/admin["'`]\s*\)/);
    expect(src).toMatch(/isAdminPath\(pathname\)/);
  });
});
