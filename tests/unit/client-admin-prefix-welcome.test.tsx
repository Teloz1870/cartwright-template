// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import { FeaturesProvider, type FeatureFlags } from "@/lib/feature-flags/context";
import messages from "@/messages/en.json";

/**
 * CLIENT-ADMIN-PREFIX (R1) — WelcomeGuide's admin check, by behaviour.
 *
 * The guide opens only after mount (localStorage decides), so the server-render
 * rows in client-admin-prefix.test.tsx cannot see it. Here it is mounted in
 * jsdom on a fresh shop (`setupPending`, nothing dismissed): it must open on
 * `/administration` and stay closed inside `/admin`. `popoverApi` is forced off
 * so the React-state path renders (jsdom has no `showModal`); no other brand
 * value is read, so the file passes in a scaffold.
 */

const pathnameRef = vi.hoisted(() => ({ current: "/" as string | null }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { default: WelcomeGuide } = await import("@/components/WelcomeGuide");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FLAGS = { ...(brand.features as FeatureFlags), popoverApi: false };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  localStorage.clear();
  pathnameRef.current = "/";
});

function mount(pathname: string): HTMLDivElement {
  pathnameRef.current = pathname;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FeaturesProvider initial={FLAGS}>
          <WelcomeGuide setupPending />
        </FeaturesProvider>
      </NextIntlClientProvider>,
    );
  });
  return host;
}

describe("WelcomeGuide opens on /administration, stays closed in /admin", () => {
  it.each(["/administration", "/administration/x/", "/adminx", "/da/administration", "/da/admin", "/"])(
    "opens on %s",
    (p) => {
      expect(mount(p).querySelector("[data-cw-welcome-guide]")).not.toBeNull();
    },
  );
  it.each(["/admin", "/admin/", "/admin/produkter"])("stays closed on %s", (p) => {
    expect(mount(p).innerHTML).toBe("");
  });
});
