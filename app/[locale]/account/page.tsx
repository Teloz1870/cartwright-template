import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { getActiveDesign } from "@/lib/theme";
import { readField } from "@/lib/genome/read";
import { displayFont } from "@/components/surfaces/DesignSurface";
import { Button } from "@/components/Button";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

export default async function KontoPage() {
  const t = await getTranslations("Account");
  const session = await auth();
  // Guard on session.user (not just session): a truthy-but-userless session
  // (self-hosted prod without AUTH_TRUST_HOST) must not 500 on .role.
  if (!session?.user) {
    redirect("/account/login");
  }

  if (session.user.role === "admin") {
    redirect("/admin");
  }

  // Mixer 2.0 Phase 4 — designSurfaces. The legacy account page is hardcoded
  // black and ignores the palette entirely. Flag ON: the page SURFACE adopts
  // the active palette (sol-* tokens + display-typography + Voice-resolvable
  // heading) while the card stays dark so the white-text inner components
  // (links, LogoutButton) stay legible on every palette. Flag OFF (default):
  // every class below evaluates to the exact legacy string → byte-identical.
  const brandSettings = await getBrand().catch(() => null);
  const designSurfaces = Boolean(brandSettings?.features.designSurfaces);
  const welcome =
    designSurfaces && brandSettings?.features.genomeResolve
      ? await readField("account.welcome").catch(() => t("home_title"))
      : t("home_title");
  const mainClass = designSurfaces
    ? "min-h-screen bg-sol-cream text-sol-ink flex items-center justify-center px-4 py-16"
    : "min-h-screen bg-black text-white flex items-center justify-center px-4 py-16";
  const headingClass = designSurfaces
    ? "text-4xl font-black text-sol-ink mb-8 text-center tracking-tighter"
    : "text-4xl font-black text-white mb-8 text-center tracking-tighter";
  const cardClass = designSurfaces
    ? "bg-[#0A0A0A] rounded-3xl shadow-xl border border-sol-ink/15 px-8 py-10 flex flex-col gap-6"
    : "bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 px-8 py-10 flex flex-col gap-6";

  const body = (
    <main className={mainClass} {...(designSurfaces ? { "data-design-surface": true } : {})}>
      <div className="w-full max-w-md">
        <h1 className={headingClass} {...(designSurfaces ? { style: displayFont } : {})}>
          {welcome}
        </h1>

        <div className={cardClass}>
          <div>
            {session.user.name && (
              <p className="text-lg font-black text-white">
                {session.user.name}
              </p>
            )}
            {session.user.email && (
              <p className="text-sm text-white/50">{session.user.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button href="/account/orders" variant="primary">
              View my orders
            </Button>
            <Link
              href="/account/settings"
              className="h-12 w-full flex items-center justify-center rounded-md border border-white/15 text-white font-semibold text-sm hover:bg-white/5 transition-all"
            >
              {t("home_settings")}
            </Link>
            {brand.features.wishlist && (
              <Link
                href="/account/wishlist"
                className="h-12 w-full flex items-center justify-center rounded-md border border-white/15 text-white font-semibold text-sm hover:bg-white/5 transition-all"
              >
                {t("home_wishlist")}
              </Link>
            )}
            {brand.features.subscriptions &&
              (brand.ecommerceEnabled || brand.features.webshop) && (
                <Link
                  href="/account/subscriptions"
                  className="h-12 w-full flex items-center justify-center rounded-md border border-white/15 text-white font-semibold text-sm hover:bg-white/5 transition-all"
                >
                  {t("home_subscriptions")}
                </Link>
              )}
            {/* DSAR-selvbetjening (GDPR art. 15/20): kunden henter ALT sit data
                som JSON. <a download> rammer den locale-agnostiske API-route
                direkte (uden for [locale]); routen tager userId fra sessionen,
                så man kun kan hente sit eget. Altid synlig — det er en lovsikret
                ret, ikke en feature der kan slås fra. */}
            <a
              href="/api/account/export"
              download
              className="h-12 w-full flex items-center justify-center rounded-md border border-white/15 text-white/80 font-semibold text-sm hover:bg-white/5 transition-all"
            >
              {t("home_downloadData")}
            </a>
            {/* Admin-shortcut: kun synlig for admin-users. Backend er kun
                tilgængelig via direkte URL ellers — denne link er bro fra
                kunde-konto til admin-dashboard så man ikke skal huske /admin. */}
            {session.user.role === "admin" && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- hard nav across the storefront→admin boundary (next-intl soft-nav loops on /admin)
              <a href="/admin" className="h-12 w-full flex items-center justify-center rounded-md bg-white text-black font-semibold text-sm hover:bg-white/90 transition-all focus:ring-4 focus:ring-white/20">
                {t("home_adminDashboard")}
              </a>
            )}
            <LogoutButton />
          </div>
        </div>
      </div>
    </main>
  );

  // Flagship packs can own the whole account frame (DesignPages.account) —
  // only consulted in the designSurfaces-on branch.
  if (designSurfaces) {
    const AccountTemplate = (await getActiveDesign().catch(() => null))?.pages
      ?.account;
    if (AccountTemplate) {
      const locale = await getLocale();
      return <AccountTemplate locale={locale}>{body}</AccountTemplate>;
    }
  }
  return body;
}
