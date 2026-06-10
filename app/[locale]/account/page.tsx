import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { brand } from "@/brand.config";
import { Button } from "@/components/Button";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

export default async function KontoPage() {
  const session = await auth();
  // Guard on session.user (not just session): a truthy-but-userless session
  // (self-hosted prod without AUTH_TRUST_HOST) must not 500 on .role.
  if (!session?.user) {
    redirect("/account/login");
  }

  if (session.user.role === "admin") {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-black text-white mb-8 text-center tracking-tighter">
          Min konto
        </h1>

        <div className="bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 px-8 py-10 flex flex-col gap-6">
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
              ⚙ Indstillinger
            </Link>
            {brand.features.wishlist && (
              <Link
                href="/account/wishlist"
                className="h-12 w-full flex items-center justify-center rounded-md border border-white/15 text-white font-semibold text-sm hover:bg-white/5 transition-all"
              >
                ♥ Min ønskeliste
              </Link>
            )}
            {brand.features.subscriptions &&
              (brand.ecommerceEnabled || brand.features.webshop) && (
                <Link
                  href="/account/subscriptions"
                  className="h-12 w-full flex items-center justify-center rounded-md border border-white/15 text-white font-semibold text-sm hover:bg-white/5 transition-all"
                >
                  Mine abonnementer
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
              ⬇ Download mine data (GDPR)
            </a>
            {/* Admin-shortcut: kun synlig for admin-users. Backend er kun
                tilgængelig via direkte URL ellers — denne link er bro fra
                kunde-konto til admin-dashboard så man ikke skal huske /admin. */}
            {session.user.role === "admin" && (
              <Link href="/admin" className="h-12 w-full flex items-center justify-center rounded-md bg-white text-black font-semibold text-sm hover:bg-white/90 transition-all focus:ring-4 focus:ring-white/20">
                🔐 Gå til Admin-dashboard
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
      </div>
    </main>
  );
}
