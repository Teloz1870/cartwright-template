// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";

import da from "@/messages/da.json";
import en from "@/messages/en.json";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The header and its mobile drawer are ONE navigation, rendered twice.
 *
 * Two measured defects live here, and both are invisible to the existing
 * suite (tests/unit/header-nav-locale.test.tsx):
 *
 *  1. **They disagreed about what the nav IS.** `HeaderClient` gated the
 *     website-mode marketing links on `isSaas`, which the Aurora rollout
 *     redefined as "the active design asks for DARK chrome"
 *     (`darkChrome ?? <old heuristic>`). Aurora-site is light, so on the
 *     website-mode canary the desktop nav silently lost Services/Cases/
 *     Pricing/Cartwright while the drawer — still on the old heuristic —
 *     kept rendering them. Chrome is a paint decision; which pages exist is
 *     not.
 *
 *  2. **The drawer's LIVE branch had no test.** `useNative` starts false for
 *     SSR parity and only flips in an effect, so every
 *     `renderToStaticMarkup` render exercises the fallback `<aside>`. The
 *     native `<dialog>` branch is the one that actually runs wherever
 *     `popoverApi` is on — i.e. on the website-mode canary — and a typo
 *     inside it left the whole existing file green.
 */

vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    ...actual,
    useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  };
});

vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} data-locale-link="1" {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/brand.config", () => ({
  brand: { uiLabels: { allProductsLink: "All products" } },
}));
// The native branch under test: both gates open.
vi.mock("@/lib/features", () => ({ supportsDialog: () => true }));
vi.mock("@/lib/feature-flags/context", () => ({ useFeature: () => true }));

vi.mock("@/components/Logo", () => ({ default: () => <span /> }));
vi.mock("@/components/CartwrightLogo", () => ({ CartwrightLogo: () => <span /> }));
vi.mock("@/components/SearchBox", () => ({ default: () => <span /> }));
vi.mock("@/components/NavLink", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/LanguageSwitcher", () => ({ default: () => <span /> }));
vi.mock("@/components/CurrencySwitcher", () => ({ default: () => <span /> }));

const { default: MobileMenu } = await import("@/components/MobileMenu");
const { default: HeaderClient } = await import("@/components/HeaderClient");
const { MARKETING_PAGES } = await import("@/components/nav/marketing-pages");
const { brand } = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderClient(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the drawer's native <dialog> branch is the one that ships", () => {
  it("renders the drawer chrome inside <dialog>, not only in the fallback aside", async () => {
    const { container, cleanup } = await renderClient(
      <MobileMenu categories={[{ name: "Beans", slug: "beans" }]} ecommerceEnabled />,
    );
    try {
      const dialog = container.querySelector("dialog");
      expect(dialog, "the native branch never rendered — the effect gate is untested again")
        .not.toBeNull();
      // The fallback <aside> must be GONE, or this test would pass on it.
      expect(container.querySelector("aside")).toBeNull();

      // Every string the branch owns, read off the dialog subtree itself.
      expect(dialog!.getAttribute("aria-label")).toBe("Header.mobileNav");
      expect(dialog!.textContent).toContain("Header.menu");
      expect(
        dialog!.querySelector('button[aria-label="Header.closeMenu"]'),
      ).not.toBeNull();
      expect(dialog!.querySelectorAll("a[data-locale-link]").length).toBeGreaterThanOrEqual(4);
    } finally {
      cleanup();
    }
  });

  it("renders the same nav in both branches — one source, not two copies", async () => {
    const props = {
      categories: [{ name: "Beans", slug: "beans" }],
      ecommerceEnabled: false,
      industryTemplate: "saas",
      navPages: [{ slug: "om", title: "Om" }],
    };

    const native = await renderClient(<MobileMenu {...props} />);
    let nativeHrefs: (string | null)[];
    try {
      // Guard the comparison itself: with the native gate closed BOTH renders
      // would be the fallback and the assertion below would pass vacuously.
      // Inside try/finally so a failure here cannot leave a mounted root and
      // its container attached to document.body for the rest of the file.
      expect(native.container.querySelector("dialog")).not.toBeNull();
      nativeHrefs = [...native.container.querySelectorAll("a")].map((a) =>
        a.getAttribute("href"),
      );
    } finally {
      native.cleanup();
    }

    // Same component, fallback branch: strip the native gate by rendering to
    // static markup (no effects run, so `useNative` stays false).
    const { renderToStaticMarkup } = await import("react-dom/server");
    const fallback = renderToStaticMarkup(<MobileMenu {...props} />);
    const fallbackHrefs = [...fallback.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    expect(nativeHrefs).toEqual(fallbackHrefs);
  });
});

describe("desktop nav and drawer agree on the website-mode pages", () => {
  const websiteSaas = {
    categories: [],
    cartCount: 0,
    signedIn: false,
    storeName: "Teloz",
    allProductsLabel: "Alle produkter",
    ecommerceEnabled: false,
    industryTemplate: "saas",
    navPages: [{ slug: "om", title: "Om" }],
  };

  it("keeps the marketing links when the design asks for LIGHT chrome", async () => {
    // darkChrome=false is exactly the Aurora default that made them vanish.
    const { container, cleanup } = await renderClient(
      <HeaderClient {...websiteSaas} darkChrome={false} />,
    );
    try {
      const desktopNav = container.querySelector('nav[aria-label="Header.pages"]');
      expect(desktopNav).not.toBeNull();
      const hrefs = [...desktopNav!.querySelectorAll("a")].map((a) => a.getAttribute("href"));
      for (const page of MARKETING_PAGES) {
        expect(hrefs, `${page.href} missing from the desktop nav`).toContain(page.href);
      }
    } finally {
      cleanup();
    }
  });

  it("renders each marketing link TWICE — desktop nav and drawer", async () => {
    // The property this file is named after, in the positive direction. The
    // negative cases cannot see the mirror image of the bug being fixed:
    // deleting the drawer's marketing block, or dropping
    // `industryTemplate={industryTemplate}` from HeaderClient's <MobileMenu>
    // call (which silently defaults the drawer to "generic"), reproduces
    // "desktop shows four, drawer shows none, same page" — and left the whole
    // suite green until this assertion existed. Same technique the
    // `allProductsLabel` wiring test uses: count BOTH halves.
    const { container, cleanup } = await renderClient(
      <HeaderClient {...websiteSaas} darkChrome={false} />,
    );
    try {
      for (const page of MARKETING_PAGES) {
        const hrefs = [...container.querySelectorAll("a")].filter(
          (a) => a.getAttribute("href") === page.href,
        );
        expect(
          hrefs.length,
          `${page.href} rendered ${hrefs.length}x — the two halves disagree`,
        ).toBe(2);
      }
    } finally {
      cleanup();
    }
  });

  it("does not paint those links white on a light header", async () => {
    const { container, cleanup } = await renderClient(
      <HeaderClient {...websiteSaas} darkChrome={false} />,
    );
    try {
      const desktopNav = container.querySelector('nav[aria-label="Header.pages"]')!;
      // White-on-light is invisible: the class may only appear on dark chrome.
      expect(desktopNav.innerHTML).not.toContain("text-white/70");
    } finally {
      cleanup();
    }
  });

  it("still paints them white on a dark header", async () => {
    const { container, cleanup } = await renderClient(
      <HeaderClient {...websiteSaas} darkChrome />,
    );
    try {
      const desktopNav = container.querySelector('nav[aria-label="Header.pages"]')!;
      expect(desktopNav.innerHTML).toContain("text-white/70");
    } finally {
      cleanup();
    }
  });

  it("hides them on a website that is NOT the saas template", async () => {
    // The second conjunct of `marketingNav`. Without this, deleting
    // `&& industryTemplate === "saas"` from BOTH components left the entire
    // 3940-test suite green — while /services, /cases and /priser 404 on any
    // non-saas website (they notFound() on exactly that predicate).
    for (const industryTemplate of ["generic", "studio", "website-corporate"]) {
      const { container, cleanup } = await renderClient(
        <HeaderClient {...websiteSaas} industryTemplate={industryTemplate} darkChrome={false} />,
      );
      try {
        const html = container.innerHTML;
        for (const page of MARKETING_PAGES) {
          expect(
            html,
            `${page.href} rendered on a ${industryTemplate} website, where its route 404s`,
          ).not.toContain(`href="${page.href}"`);
        }
      } finally {
        cleanup();
      }
    }
  });

  it("hides them in the DRAWER too on a non-saas website", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const markup = renderToStaticMarkup(
      <MobileMenu categories={[]} ecommerceEnabled={false} industryTemplate="generic" />,
    );
    for (const page of MARKETING_PAGES) {
      expect(markup, `${page.href} leaked into a non-saas drawer`).not.toContain(
        `href="${page.href}"`,
      );
    }
  });

  it("hides them for a webshop, on either chrome", async () => {
    // Honest scope: this pins STRUCTURE, not the predicate. BOTH halves put
    // the marketing block inside an outer `ecommerceEnabled ? … : …` ternary
    // (HeaderClient.tsx:135, MobileMenu.tsx:81), so no change to
    // `marketingNav` or to either link list can make it fail. It fails only
    // if a future edit lifts the block OUT of that ternary — which is exactly
    // the regression it exists to catch. The predicate itself is pinned by
    // the non-saas cases above and the both-halves count below.
    for (const darkChrome of [false, true]) {
      const { container, cleanup } = await renderClient(
        <HeaderClient
          {...websiteSaas}
          ecommerceEnabled
          industryTemplate="coffee"
          darkChrome={darkChrome}
        />,
      );
      try {
        const html = container.innerHTML;
        for (const page of MARKETING_PAGES) {
          expect(html, `${page.href} leaked into a webshop header`).not.toContain(
            `href="${page.href}"`,
          );
        }
      } finally {
        cleanup();
      }
    }
  });
});

describe("the shared marketing list", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

  /**
   * Only THIS project's own config decides whether these links can render, so
   * that is what the route assertions are conditioned on. A `--profile light`
   * scaffold prunes `app/[locale]/{services,cases,priser}` wholesale
   * (cartwright-app `apps/cli/src/profile-light.ts`) AND scaffolds as
   * `industryTemplate: "website-corporate"` (`apps/cli/src/index.ts`), so the
   * nav renders nothing there and a hardcoded "these routes exist" assertion
   * would be a false red in every customer tree — the R1/R2 release-blocker
   * class. Derive, never hardcode.
   */
  const navCanRender =
    !brand.ecommerceEnabled && brand.industryTemplate === "saas";

  it.runIf(navCanRender)("only links to routes this engine actually serves", () => {
    // The dead `/onboarding` NavLink shipped in the desktop copy for months —
    // unreachable only because the chrome gate happened to be false. A shared
    // list is worth nothing if it can carry a 404.
    // path.join, not new URL: `[locale]` percent-encodes in a URL and the
    // check would then be vacuously false for every entry.
    for (const page of MARKETING_PAGES) {
      const dir = path.join(repoRoot, "app", "[locale]", page.href);
      expect(existsSync(dir), `app/[locale]${page.href} does not exist`).toBe(true);
    }
  });

  it.runIf(navCanRender)("links only to pages whose own gate is implied by the nav's", () => {
    // Not "is it gated at all" — WHICH predicate. The nav renders when
    // `!ecommerceEnabled && industryTemplate === "saas"`; every page it links
    // must 404 no more narrowly than that, or the nav ships a 404.
    // /cartwright is deliberately weaker (`!ecommerceEnabled` alone): served
    // in more places than it is linked, which is sound in the safe direction.
    const SAAS_GATED = new Set(["/services", "/cases", "/priser"]);
    for (const page of MARKETING_PAGES) {
      const src = readFileSync(
        path.join(repoRoot, "app", "[locale]", page.href, "page.tsx"),
        "utf8",
      );
      expect(src, `${page.href} never calls notFound()`).toContain("notFound()");
      // Both gate forms occur in the tree: `!brand.ecommerceEnabled && …`
      // (the three saas pages) and `if (brand.ecommerceEnabled) notFound()`
      // (/cartwright). Pin that the mode is read at all; the saas conjunct —
      // the load-bearing half — is pinned exactly below.
      expect(src, `${page.href} does not read ecommerceEnabled`).toMatch(/ecommerceEnabled/);
      if (SAAS_GATED.has(page.href)) {
        expect(
          src,
          `${page.href} no longer gates on the saas template — the nav predicate is now wider than the route's`,
        ).toMatch(/industryTemplate === "saas"/);
      } else {
        // Pin the asymmetry so a future narrowing of /cartwright's gate (which
        // WOULD make the nav link a 404) cannot land silently.
        expect(
          src,
          `${page.href} started gating on industryTemplate — re-check the nav predicate`,
        ).not.toMatch(/industryTemplate/);
      }
    }
  });

  it("is not empty", () => {
    expect(MARKETING_PAGES.length).toBeGreaterThanOrEqual(3);
  });

  it("uses message keys that exist in every shipped locale", () => {
    // `key: string` is free-form (no IntlMessages augmentation in this repo),
    // so a typo typechecks and next-intl renders the key path as visible nav
    // text: t("casesTypo") -> "Header.casesTypo".
    for (const page of MARKETING_PAGES) {
      if (!page.key) continue;
      expect(Object.keys(en.Header), `Header.${page.key} missing from en`).toContain(page.key);
      expect(Object.keys(da.Header), `Header.${page.key} missing from da`).toContain(page.key);
    }
  });

  it("gives every entry exactly one label source", () => {
    for (const page of MARKETING_PAGES) {
      expect(
        Boolean(page.key) !== Boolean(page.label),
        `${page.href} has neither or both of key/label`,
      ).toBe(true);
    }
  });
});
