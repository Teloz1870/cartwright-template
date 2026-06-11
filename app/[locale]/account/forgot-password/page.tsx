import Link from "next/link";
import { isEmailConfigured } from "@/lib/mailer/resend";
import { getBrand } from "@/lib/brand";
import { displayFont } from "@/components/surfaces/DesignSurface";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = { title: "Glemt adgangskode" };

export default async function ForgotPasswordPage() {
  // The page is directly reachable (bookmarks, old links) even when the login
  // screen hides the entry link. If email can't be delivered, say so up front
  // instead of pretending a mail was sent.
  const emailEnabled = await isEmailConfigured();

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
    : "bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 px-8 py-10";

  return (
    <main className={mainClass} {...(designSurfaces ? { "data-design-surface": true } : {})}>
      <div className="w-full max-w-md relative z-10">
        <h1 className={headingClass} {...(designSurfaces ? { style: displayFont } : {})}>
          Glemt adgangskode
        </h1>
        <div className={cardClass}>
          {emailEnabled ? (
            <ForgotPasswordForm />
          ) : (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm leading-6 text-amber-200">
              <p className="font-black">Email er ikke sat op på denne shop endnu</p>
              <p className="mt-1 text-amber-200/80">
                Nulstillings-mails kan derfor ikke sendes. Kontakt en
                administrator for at få adgang, eller log ind med adgangskode på{" "}
                <Link
                  href="/account/login"
                  className="font-bold underline hover:text-amber-100"
                >
                  login-siden
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
