"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const profileSchema = z.object({
  name: z.string().max(120).optional().default(""),
  phoneNumber: z.string().max(40).optional().default(""),
  shippingName: z.string().max(120).optional().default(""),
  shippingAddress: z.string().max(200).optional().default(""),
  shippingZip: z.string().max(20).optional().default(""),
  shippingCity: z.string().max(120).optional().default(""),
});

export type ProfileState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const emptyToNull = (s: string) => (s.trim() ? s.trim() : null);

/**
 * Opdater den indloggede brugers profil (navn, telefon, leveringsadresse).
 * Email ændres IKKE her — den er login-identifikatoren, og en ændring uden
 * gen-verifikation kunne låse brugeren ude (magic-link gik til den gamle).
 */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "Du er ikke logget ind." };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phoneNumber: formData.get("phoneNumber"),
    shippingName: formData.get("shippingName"),
    shippingAddress: formData.get("shippingAddress"),
    shippingZip: formData.get("shippingZip"),
    shippingCity: formData.get("shippingCity"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Ugyldig indtastning.",
    };
  }
  const d = parsed.data;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: d.name.trim(),
      phoneNumber: emptyToNull(d.phoneNumber),
      shippingName: emptyToNull(d.shippingName),
      shippingAddress: emptyToNull(d.shippingAddress),
      shippingZip: emptyToNull(d.shippingZip),
      shippingCity: emptyToNull(d.shippingCity),
    },
  });

  revalidatePath("/account/settings");
  return { status: "success", message: "Dine oplysninger er gemt." };
}

export type PwState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/**
 * Sæt/skift den indloggede brugers password. Hvis brugeren allerede HAR et
 * password skal det nuværende verificeres. Magic-link-only konti (intet
 * passwordHash) kan SÆTTE et password uden current — sessionen er beviset.
 */
export async function changeCustomerPassword(
  _prev: PwState,
  formData: FormData,
): Promise<PwState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "Du er ikke logget ind." };
  }

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) {
    return { status: "error", message: "Adgangskoden skal være mindst 8 tegn." };
  }
  if (next !== confirm) {
    return { status: "error", message: "De to adgangskoder er ikke ens." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (user?.passwordHash) {
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) {
      return { status: "error", message: "Nuværende adgangskode er forkert." };
    }
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });

  return {
    status: "success",
    message: user?.passwordHash
      ? "Din adgangskode er skiftet."
      : "Adgangskode oprettet — du kan nu også logge ind med password.",
  };
}
