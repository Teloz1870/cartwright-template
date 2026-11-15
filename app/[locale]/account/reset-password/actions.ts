"use server";

import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { resetPasswordSchema } from "@/lib/validation";
import {
  consumePasswordResetToken,
  type PasswordResetFailure,
} from "@/lib/auth/password-reset";
import {
  RESET_TOKEN_COOKIE,
  resetTokenCookiePath,
} from "@/lib/auth/reset-token-cookie";

export type ResetState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const t = await getTranslations("Account");
  // RESET-TOKEN-URL-LEAK: the token comes from the cookie the reset route set
  // (app/api/account/reset-password), never from the form or the address bar.
  const cookieStore = await cookies();
  const token = cookieStore.get(RESET_TOKEN_COOKIE)?.value ?? "";
  if (!token) {
    return { status: "error", message: t("resetActions_missingToken") };
  }
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = resetPasswordSchema.safeParse({
    token,
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
    // The module answers with a code so this page — which HAS a locale — can
    // translate it, the way it already does for the three messages above.
    // Exhaustive by type: a new PasswordResetFailure is a compile error here
    // rather than silently collapsing into the "invalid or expired" message.
    const KEY: Record<PasswordResetFailure, string> = {
      missing_token: "resetActions_missingToken",
      invalid_or_expired_link: "resetActions_invalidOrExpiredLink",
    };
    return { status: "error", message: t(KEY[result.code]) };
  }

  // The token is spent (single-use); without its cookie a revisit offers a
  // new link instead of a form that can only fail. A failure keeps it, so the
  // form answers a second try the same way the first was answered.
  cookieStore.delete({
    name: RESET_TOKEN_COOKIE,
    path: resetTokenCookiePath(await getLocale()),
  });
  return {
    status: "success",
    message: t("resetActions_success"),
  };
}
