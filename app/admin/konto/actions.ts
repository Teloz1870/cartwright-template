"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { validatePasswordStrength } from "@/lib/auth/password";

export type ChangePwState = {
  status: "idle" | "error" | "success";
  message?: string;
};

/**
 * Skift den indloggede admins password. Verificerer nuværende password,
 * validerer det nye, hasher og rydder mustChangePassword-flaget (så den
 * tvungne-skift-gate i app/admin/layout.tsx slipper admin videre).
 *
 * Bruges af /admin/konto (useActionState-signatur). Aldrig kaldbar uden admin-
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
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) {
    return {
      status: "error",
      message:
        "Din konto har intet password (magic-link-konto). Log ind med magic-link.",
    };
  }

  const currentMatches = await bcrypt.compare(current, user.passwordHash);
  if (!currentMatches) {
    return { status: "error", message: "Nuværende adgangskode er forkert." };
  }

  if (next !== confirm) {
    return { status: "error", message: "De to nye adgangskoder er ikke ens." };
  }

  const strength = validatePasswordStrength(next);
  if (!strength.ok) {
    return { status: "error", message: strength.error };
  }

  if (next === current) {
    return {
      status: "error",
      message: "Vælg en ny adgangskode, forskellig fra den nuværende.",
    };
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  revalidatePath("/admin");
  return { status: "success", message: "Adgangskoden er skiftet." };
}
