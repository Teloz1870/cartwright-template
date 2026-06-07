import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import ChangePasswordForm from "./ChangePasswordForm";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";

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
    <div className="flex max-w-2xl flex-col gap-6">
      <AdminPageHeader
        title="Min konto"
        subtitle={
          <>
            Logget ind som <span className="font-bold">{user?.email}</span>
          </>
        }
      />

      {forced && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Skift din adgangskode for at fortsætte.</p>
          <p className="mt-1">
            Din konto bruger et genereret start-password. Vælg dit eget, sikre
            password nedenfor — så får du adgang til resten af admin.
          </p>
        </div>
      )}

      <AdminCard
        title="Skift adgangskode"
        description="Mindst 12 tegn. Bruges til password-login på /account/login."
      >
        <ChangePasswordForm />
      </AdminCard>
    </div>
  );
}
