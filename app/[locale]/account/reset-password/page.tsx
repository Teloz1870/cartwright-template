import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getBrand } from "@/lib/brand";
import { RESET_TOKEN_COOKIE } from "@/lib/auth/reset-token-cookie";
import { displayFont } from "@/components/surfaces/DesignSurface";
import ResetPasswordForm from "./ResetPasswordForm";

export async function generateMetadata() {
  const t = await getTranslations("Account");
  return { title: t("resetPage_title") };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  // RESET-TOKEN-URL-LEAK: a link that still carries its token is answered
  // with a redirect before any HTML — and so before GA4 or any other script —
  // exists at that address. The route moves the token into an httpOnly cookie
  // and sends the browser back here without the query. Links already sent
  // keep working this way; the page never hands the token to the client.
  if (token) {
    redirect(`/api/account/reset-password?${new URLSearchParams({ token, locale })}`);
  }
  const hasToken = Boolean((await cookies()).get(RESET_TOKEN_COOKIE)?.value);
  const t = await getTranslations("Account");

  // Mixer 2.0 Phase 4 — designSurfaces: page surface adopts the active palette;
  // the card stays dark (white-text form inside). Flag OFF (default) → exact
  // legacy classes (byte-identical).
  const designSurfaces =
    Boolean((await getBrand().catch(() => null))?.features.designSurfaces);
  const mainClass = designSurfaces
    ? "min-h-screen bg-sol-cream text-sol-ink flex items-center justify-center px-4 py-16"
    : "min-h-screen bg-black text-white selection:bg-white/30 flex items-center justify-center px-4 py-16";
  const headingClass = designSurfaces
    ? "text-4xl font-black text-sol-ink mb-8 text-center tracking-tighter"
    : "text-4xl font-black text-white mb-8 text-center tracking-tighter";
  const cardClass = designSurfaces
    ? "bg-[#0A0A0A] rounded-3xl shadow-xl border border-sol-ink/15 px-8 py-10"
    : "bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-[var(--cw-brand-on-dark)]/10 border border-white/10 px-8 py-10";

  return (
    <div className={mainClass} {...(designSurfaces ? { "data-design-surface": true } : {})}>
      <div className="w-full max-w-md relative z-10">
        <h1 className={headingClass} {...(designSurfaces ? { style: displayFont } : {})}>
          {t("resetPage_title")}
        </h1>
        <div className={cardClass}>
          <ResetPasswordForm hasToken={hasToken} />
        </div>
      </div>
    </div>
  );
}
