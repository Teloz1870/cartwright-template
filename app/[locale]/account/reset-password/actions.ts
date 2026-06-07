"use server";

import { resetPasswordSchema } from "@/lib/validation";
import { consumePasswordResetToken } from "@/lib/auth/password-reset";

export type ResetState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Ugyldig indtastning.",
    };
  }
  if (parsed.data.password !== confirm) {
    return { status: "error", message: "De to adgangskoder er ikke ens." };
  }

  const result = await consumePasswordResetToken(
    parsed.data.token,
    parsed.data.password,
  );
  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  return {
    status: "success",
    message: "Din adgangskode er nulstillet. Du kan nu logge ind.",
  };
}
