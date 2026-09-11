import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { displayFont } from "@/components/surfaces/DesignSurface";
import RegisterForm from "@/components/RegisterForm";

export default async function OpretKontoPage() {
  const session = await auth();
  // Guard on session.user — a truthy-but-userless session (self-hosted prod
  // without AUTH_TRUST_HOST) must not 500 on .role; treat as logged-out.
  if (session?.user) {
    if (session.user.role === "admin") {
      redirect("/admin");
    } else {
      redirect("/account");
    }
  }

  // Mixer 2.0 Phase 4 — designSurfaces: page surface adopts the active palette;
  // the card stays dark (white-text RegisterForm inside). Flag OFF (default) →
  // exact legacy classes (byte-identical).
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
  const footTextClass = designSurfaces
    ? "mt-6 text-center text-sm text-sol-muted"
    : "mt-6 text-center text-sm text-white/50";
  const footLinkClass = designSurfaces
    ? "font-bold text-sol-accent hover:underline transition-colors"
    : "font-bold text-[var(--cw-brand-on-dark)] hover:text-[var(--cw-brand-on-dark-hi)] transition-colors";

  return (
    <main className={mainClass} {...(designSurfaces ? { "data-design-surface": true } : {})}>
      <div className="w-full max-w-md relative z-10">
        <h1 className={headingClass} {...(designSurfaces ? { style: displayFont } : {})}>
          Create account
        </h1>
        <div className={cardClass}>
          <RegisterForm />
        </div>
        <p className={footTextClass}>
          Already have an account?{" "}
          <Link
            href="/account/login"
            className={footLinkClass}
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
