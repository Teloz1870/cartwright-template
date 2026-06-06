import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, isGithubAuthEnabled, isGoogleAuthEnabled } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/mailer/resend";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const session = await auth();
  // Guard on session.user (not just session): self-hosted prod without
  // AUTH_TRUST_HOST can return a truthy-but-userless session → reading
  // .role would 500. Treat a userless session as logged-out.
  if (session?.user) {
    if (session.user.role === "admin") {
      redirect("/admin");
    } else {
      redirect("/account");
    }
  }

  // Email kan ikke leveres uden Resend → skjul magic-link + "glemt adgangskode"
  // så de ikke bliver blindgyder (mailen ville bare ende i .mail-previews/).
  const emailEnabled = await isEmailConfigured();
  // First-run helper: when email isn't configured (no magic-link) AND we're not
  // in production, point the operator at the seeded password in .admin-credentials.
  // Gated to dev so it never surfaces on a deployed shop.
  const devNoEmail = !emailEnabled && process.env.NODE_ENV !== "production";

  return (
    <main className="min-h-screen bg-black text-white selection:bg-white/30 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md relative z-10">
        <h1 className="text-4xl font-black text-white mb-8 text-center tracking-tighter">
          Log in
        </h1>

        <div className="bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 px-8 py-10">
          <Suspense fallback={<p className="text-white/50 text-sm">Loading...</p>}>
            <LoginForm
              githubEnabled={isGithubAuthEnabled}
              googleEnabled={isGoogleAuthEnabled}
              emailEnabled={emailEnabled}
              devNoEmail={devNoEmail}
            />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-white/50">
          No account?{" "}
          <Link
            href="/account/signup"
            className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
