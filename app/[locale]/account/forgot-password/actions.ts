"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { forgotPasswordSchema } from "@/lib/validation";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import {
  passwordResetPerEmailLimiter,
  passwordResetPerIpLimiter,
} from "@/lib/rate-limit";

export type ForgotState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function requestPasswordResetAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const t = await getTranslations("Account");
  // Uniform svar uanset om kontoen findes (no-enumeration).
  const sentMessage = t("forgotActions_sentMessage");

  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? t("forgotActions_invalidEmail"),
    };
  }
  const email = parsed.data.email.toLowerCase();

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate-limit pr. email + pr. IP. Ved throttle returnerer vi STADIG samme
  // uniforme svar (afslør intet) — vi springer bare email-afsendelsen over.
  const allowed =
    passwordResetPerEmailLimiter.check(email).allowed &&
    passwordResetPerIpLimiter.check(ip).allowed;

  if (allowed) {
    try {
      await requestPasswordReset(email);
    } catch (err) {
      // Aldrig fejl-detaljer til klienten — svaret forbliver uniformt.
      console.error("[password-reset] request failed:", err);
    }
  }

  return { status: "sent", message: sentMessage };
}
