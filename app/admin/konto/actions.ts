"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { validatePasswordStrength } from "@/lib/auth/password";

export type ChangePwState = {
  status: "idle" | "error" | "success";
  message?: string;
};

/**
 * Change the signed-in admin's password. Verifies the current password,
 * validates the new one, hashes it and clears the mustChangePassword flag (so the
 * forced-change gate in app/admin/layout.tsx lets the admin through).
 *
 * Used by /admin/konto (useActionState signature). Never callable without an admin
 * session (requireAdmin redirecter ellers).
 */
export async function changeAdminPassword(
  _prev: ChangePwState,
  formData: FormData,
): Promise<ChangePwState> {
  const session = await requireAdmin();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, mustChangePassword: true },
  });
  if (!user?.passwordHash) {
    return {
      status: "error",
      message:
        "Your account has no password (magic-link account). Sign in with the magic link.",
    };
  }

  const currentMatches = await bcrypt.compare(current, user.passwordHash);
  if (!currentMatches) {
    return { status: "error", message: "Current password is incorrect." };
  }

  if (next !== confirm) {
    return { status: "error", message: "The two new passwords do not match." };
  }

  const strength = validatePasswordStrength(next);
  if (!strength.ok) {
    return { status: "error", message: strength.error };
  }

  if (next === current) {
    return {
      status: "error",
      message: "Choose a new password, different from the current one.",
    };
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  revalidatePath("/admin");

  // First forced change (admin created with a generated start-password): route the
  // new owner straight into the setup wizard. shouldShowSetupWizard() is gated on an
  // empty product table, and the seed adds demo products — so without this explicit
  // redirect a fresh owner would land on the dashboard and never see the wizard.
  // A normal later change falls through to the success state (dashboard link).
  if (user.mustChangePassword) {
    redirect("/admin/setup");
  }

  return { status: "success", message: "Password changed." };
}
