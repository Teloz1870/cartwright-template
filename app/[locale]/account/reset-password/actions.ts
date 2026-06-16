"use server";

import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("Account");
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? t("resetActions_invalidInput"),
    };
  }
  if (parsed.data.password !== confirm) {
    return { status: "error", message: t("resetActions_passwordsMismatch") };
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
    message: t("resetActions_success"),
  };
}
