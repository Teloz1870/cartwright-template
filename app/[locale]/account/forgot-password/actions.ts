"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { forgotPasswordSchema } from "@/lib/validation";
import { schedulePasswordReset } from "@/lib/auth/password-reset";
import {
  passwordResetPerEmailLimiter,
  passwordResetPerIpLimiter,
} from "@/lib/rate-limit";
import { trustedClientIp } from "@/lib/trusted-client-ip";

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

  const ip = trustedClientIp(await headers());

  // Rate-limit pr. IP + pr. email. Ved throttle returnerer vi STADIG samme
  // uniforme svar (afslør intet) — vi springer bare email-afsendelsen over.
  // IP-nøglen er trustedClientIp (en klient kan ikke længere vælge sin egen
  // spand med en x-forwarded-for-header; uidentificerede deler "unknown").
  // IP-spanden tjekkes FØRST: en klient, hvis IP-spand er tom, må ikke kunne
  // blive ved med at bruge fremmede adressers per-email-spande op.
  const allowed =
    passwordResetPerIpLimiter.check(ip).allowed &&
    passwordResetPerEmailLimiter.check(email).allowed;

  if (allowed) {
    // After the response (AUTH-FORGOT-TIMING): the lookup, the token and the
    // mail run once the answer is sent, so a known and an unknown address are
    // answered after the same work. Errors are logged there, never shown here.
    // The address goes on as typed, not lowercased: which of several accounts
    // that differ only in case it means depends on the spelling
    // (REG-EMAIL-CASE-b, accountForAddress). The limiter keys above stay
    // lowercased, so one address is one budget whatever its case.
    schedulePasswordReset(parsed.data.email);
  }

  return { status: "sent", message: sentMessage };
}
