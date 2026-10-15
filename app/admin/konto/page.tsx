import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import ChangePasswordForm from "./ChangePasswordForm";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";

export const metadata = { title: "My account" };

/**
 * Admin account: change password. Also the target of the forced-change gate in
 * app/admin/layout.tsx (an admin with mustChangePassword is sent here and cannot
 * leave the page until the password has been changed).
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
        title="My account"
        subtitle={
          <>
            Signed in as <span className="font-bold">{user?.email}</span>
          </>
        }
      />

      {forced && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Change your password to continue.</p>
          <p className="mt-1">
            Your account uses a generated starter password. Choose your own
            secure password below — then you&apos;ll have access to the rest of the
            admin.
          </p>
        </div>
      )}

      <AdminCard
        title="Change password"
        description="At least 12 characters. Used for password login at /account/login."
      >
        <ChangePasswordForm />
      </AdminCard>
    </div>
  );
}
