import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";

/**
 * I18N-REVIEW-WISHLIST — the review landing page a post-purchase email links
 * to (`/review/<token>`) and the customer's wishlist (`/account/wishlist`)
 * carried hard-coded Danish: "← Til forsiden", "Min ønskeliste", "← Min
 * konto" and the sentences around them. An English shop's customer met a
 * Danish page.
 *
 * Both routes are driven for real; only their data and the two client leaves
 * (the review form, the product card) are stubbed. The copy goes through the
 * real next-intl translator over `messages/<locale>.json`, so a string put
 * back into the JSX, or a key missing from one file, is the wrong text here.
 *
 * Locales come from the shop's own brand.config — tests/unit ships in
 * scaffolds, which are single-locale `["en"]` — and the Danish byte-identity
 * case runs only where the shop publishes Danish.
 */

const LOCALES = brand.locales as readonly string[];
const whenDanish = LOCALES.includes("da") ? it : it.skip;
const whenEnglish = LOCALES.includes("en") ? it : it.skip;

const mocks = vi.hoisted(() => ({
  state: { locale: "", reviewed: false, wishlist: [] as Array<{ id: string }> },
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { readFileSync: read } = await import("node:fs");
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
      createTranslator({ locale, messages: JSON.parse(read(`messages/${locale}.json`, "utf8")), namespace }),
    getLocale: async () => mocks.state.locale,
  };
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findUnique: async () => ({
        id: "o1",
        email: "kunde@example.com",
        shippingName: "Kunde",
        items: [
          { id: "i1", productId: "p1", product: { id: "p1", name: "Kaffe", slug: "kaffe", permalink: null } },
        ],
      }),
    },
    productReview: {
      findMany: async () => (mocks.state.reviewed ? [{ productId: "p1" }] : []),
    },
  },
}));
vi.mock("@/plugins/reviews/lib/review-token", () => ({ verifyReviewToken: () => ({ orderId: "o1" }) }));
vi.mock("@/plugins/reviews/components/WriteReviewForm", () => ({
  default: ({ locale }: { locale: string }) => <form data-locale={locale} />,
}));
vi.mock("@/lib/brand", () => ({ getFeatures: async () => ({ wishlist: true }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/plugins/wishlist/lib/wishlist", () => ({
  listWishlistProducts: async () => mocks.state.wishlist,
}));
vi.mock("@/components/ProductCard", () => ({
  ProductCard: ({ product }: { product: { id: string } }) => <div data-card={product.id} />,
}));

const { default: ReviewTokenPage } = await import("@/plugins/reviews/pages/ReviewTokenPage");
const { default: WishlistPage } = await import("@/plugins/wishlist/pages/WishlistPage");

const messages = (locale: string) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Record<string, Record<string, string>>;

async function reviewPage(locale: string, reviewed = false) {
  mocks.state.reviewed = reviewed;
  return renderToStaticMarkup(
    await ReviewTokenPage({ params: Promise.resolve({ token: "tok", locale }) }),
  );
}

async function wishlistPage(locale: string) {
  mocks.state.locale = locale;
  return renderToStaticMarkup(await WishlistPage());
}

beforeEach(() => {
  mocks.state.wishlist = [];
});

describe("the review landing page follows the page locale", () => {
  it.each(LOCALES)("%s: every string comes from that locale's messages", async (locale) => {
    const t = messages(locale).Reviews;
    const html = await reviewPage(locale);
    expect(html).toContain(`<a href="/${locale}" class="text-sm font-black text-sol-muted hover:text-sol-accent">${t.token_backToHome}</a>`);
    expect(html).toContain(`>${t.token_title}</h1>`);
    expect(html).toContain(`>${t.token_intro}</p>`);
    expect(html).toContain(`data-locale="${locale}"`);

    const reviewed = await reviewPage(locale, true);
    const link = `<a href="/${locale}/product/kaffe" class="font-black text-sol-ink hover:text-sol-accent">Kaffe</a>`;
    const [before, after] = t.token_alreadyReviewed.split("<product>{name}</product>");
    expect(reviewed).toContain(`>${before}${link}${after}</div>`);
  });

  whenDanish("Danish is byte-identical to the copy the page hard-coded", async () => {
    const html = await reviewPage("da");
    expect(html).toContain('<a href="/da" class="text-sm font-black text-sol-muted hover:text-sol-accent">← Til forsiden</a>');
    expect(html).toContain('<h1 class="mt-4 text-3xl font-black text-sol-ink">Tak for dit køb — del din oplevelse</h1>');
    expect(html).toContain(
      '<p class="mt-2 text-sm text-sol-muted">Du modtog dette link fordi du købte hos os. Anmeldelser hjælper andre kunder med at finde de rigtige produkter. Du behøver ikke at logge ind.</p>',
    );
    expect(await reviewPage("da", true)).toContain(
      '>Du har allerede anmeldt <a href="/da/product/kaffe" class="font-black text-sol-ink hover:text-sol-accent">Kaffe</a>. Tak!</div>',
    );
  });

  whenEnglish("English is English", async () => {
    for (const html of [await reviewPage("en"), await reviewPage("en", true)]) {
      expect(html).not.toMatch(/[æøåÆØÅ]/);
      expect(html).not.toContain("Til forsiden");
      expect(html).not.toContain("Tak!");
    }
  });
});

describe("the wishlist follows the page locale", () => {
  it.each(LOCALES)("%s: every string comes from that locale's messages", async (locale) => {
    const t = messages(locale).Account;
    const html = await wishlistPage(locale);
    expect(html).toContain(`<h1 class="text-4xl font-black text-sol-ink">${t.wishlist_title}</h1>`);
    expect(html).toContain(`<a href="/${locale}/account" class="text-sm font-bold text-sol-accent hover:underline">${t.wishlist_backToAccount}</a>`);
    expect(html).toContain(`<p class="text-sol-muted">${t.wishlist_empty}</p>`);
  });

  it("a saved product still renders its card, not the empty copy", async () => {
    const locale = brand.defaultLocale as string;
    mocks.state.wishlist = [{ id: "p1" }];
    const html = await wishlistPage(locale);
    expect(html).toContain('data-card="p1"');
    expect(html).not.toContain(messages(locale).Account.wishlist_empty);
  });

  whenDanish("Danish is byte-identical to the copy the page hard-coded", async () => {
    const html = await wishlistPage("da");
    expect(html).toContain('<h1 class="text-4xl font-black text-sol-ink">Min ønskeliste</h1>');
    expect(html).toContain('<a href="/da/account" class="text-sm font-bold text-sol-accent hover:underline">← Min konto</a>');
    expect(html).toContain(
      '<p class="text-sol-muted">Din ønskeliste er tom. Tryk på hjertet på et produkt for at gemme det her.</p>',
    );
  });

  whenEnglish("English is English", async () => {
    const html = await wishlistPage("en");
    expect(html).not.toMatch(/[æøåÆØÅ]/);
    expect(html).not.toContain("Min konto");
  });
});
