import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import ChangePasswordForm from "./ChangePasswordForm";

export const metadata = { title: "Min konto" };

/**
 * Admin-konto: skift adgangskode. Også målet for den tvungne-skift-gate i
 * app/admin/layout.tsx (en admin med mustChangePassword sendes hertil og kan
 * ikke forlade siden før koden er skiftet).
 */
export default async function AdminAccountPage() {
  const session = await requireAdmin();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, mustChangePassword: true },
  });
  const forced = Boolean(user?.mustChangePassword);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-black text-sol-ink">Min konto</h1>
      <p className="mt-1 text-sm text-sol-muted">
        Logget ind som <span className="font-bold">{user?.email}</span>
      </p>

      {forced && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Skift din adgangskode for at fortsætte.</p>
          <p className="mt-1">
            Din konto bruger et genereret start-password. Vælg dit eget, sikre
            password nedenfor — så får du adgang til resten af admin.
          </p>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-sol-ink/10 bg-white p-5">
        <h2 className="text-lg font-black text-sol-ink">Skift adgangskode</h2>
        <p className="mt-1 mb-4 text-sm text-sol-muted">
          Mindst 12 tegn. Bruges til password-login på /account/login.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
