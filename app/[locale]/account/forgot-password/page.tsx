import Link from "next/link";
import { isEmailConfigured } from "@/lib/mailer/resend";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = { title: "Glemt adgangskode" };

export default async function ForgotPasswordPage() {
  // The page is directly reachable (bookmarks, old links) even when the login
  // screen hides the entry link. If email can't be delivered, say so up front
  // instead of pretending a mail was sent.
  const emailEnabled = await isEmailConfigured();

  return (
    <main className="min-h-screen bg-black text-white selection:bg-white/30 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md relative z-10">
        <h1 className="text-4xl font-black text-white mb-8 text-center tracking-tighter">
          Glemt adgangskode
        </h1>
        <div className="bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 px-8 py-10">
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
