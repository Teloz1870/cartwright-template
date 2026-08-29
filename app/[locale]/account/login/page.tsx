import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, isGithubAuthEnabled, isGoogleAuthEnabled } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/mailer/resend";
import { getBrand } from "@/lib/brand";
import { displayFont } from "@/components/surfaces/DesignSurface";
import LoginForm from "@/components/LoginForm";
import { postLoginDestination } from "@/lib/auth/post-login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  // Guard on session.user (not just session): self-hosted prod without
  // AUTH_TRUST_HOST can return a truthy-but-userless session → reading
  // .role would 500. Treat a userless session as logged-out.
  if (session?.user) {
    // An already-authenticated visitor lands here via a second tab, the back
    // button, or an OAuth continuation link — and used to be sent to the role
    // default with `?callbackUrl=` discarded, stranding them on /account.
    // postLoginDestination validates the value and refuses an auth-page target
    // (which would bounce with this very redirect).
    const raw = (await searchParams).callbackUrl;
    redirect(
      postLoginDestination(
        Array.isArray(raw) ? raw[0] : raw,
        session.user.role,
      ),
    );
  }

  // Email kan ikke leveres uden Resend → skjul magic-link + "glemt adgangskode"
  // så de ikke bliver blindgyder (mailen ville bare ende i .mail-previews/).
  const emailEnabled = await isEmailConfigured();
  // First-run helper: when email isn't configured (no magic-link) AND we're not
  // in production, point the operator at the seeded password in .admin-credentials.
  // Gated to dev so it never surfaces on a deployed shop.
  const devNoEmail = !emailEnabled && process.env.NODE_ENV !== "production";

  // Mixer 2.0 Phase 4 — designSurfaces: the page surface adopts the active
  // palette; the card stays dark so the white-text LoginForm stays legible on
  // every palette. Flag OFF (default) → exact legacy classes (byte-identical).
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
          Log in
        </h1>

        <div className={cardClass}>
          <Suspense fallback={<p className="text-white/50 text-sm">Loading...</p>}>
            <LoginForm
              githubEnabled={isGithubAuthEnabled}
              googleEnabled={isGoogleAuthEnabled}
              emailEnabled={emailEnabled}
              devNoEmail={devNoEmail}
            />
          </Suspense>
        </div>

        <p className={footTextClass}>
          No account?{" "}
          <Link
            href="/account/signup"
            className={footLinkClass}
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
