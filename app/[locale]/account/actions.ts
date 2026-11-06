"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/validation";
import { registerPerIpLimiter } from "@/lib/rate-limit";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import {
  REGISTER_ELAPSED_FIELD,
  REGISTER_HONEYPOT_FIELD,
  filledSlowlyEnough,
  honeypotFilled,
} from "@/lib/auth/register-guard";
import {
  findAccountsByEmail,
  normalizeAccountEmail,
} from "@/lib/auth/account-email";
import {
  emitMarketingEvent,
  MARKETING_EVENTS,
} from "@/lib/marketing/automations";

export async function registerUser(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Bot guard (AUTH-REG1, lib/auth/register-guard.ts): the honeypot and the
    // fill time first (free), then validation, and only then the per-IP limit,
    // so a typo or a too-quick submit does not cost a person an attempt.
    //
    // A bot that filled the hidden field gets the answer a real sign-up gets,
    // so it learns nothing; no account is created.
    if (honeypotFilled(formData.get(REGISTER_HONEYPOT_FIELD))) {
      return { ok: true };
    }
    if (!filledSlowlyEnough(formData.get(REGISTER_ELAPSED_FIELD))) {
      return {
        ok: false,
        error: "That was very quick. Please check the form and try again.",
      };
    }

    const raw = {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    };

    const result = registerSchema.safeParse(raw);
    if (!result.success) {
      return { ok: false, error: result.error.issues[0].message };
    }

    // trustedClientIp answers "unknown" when the client cannot be identified
    // (self-hosted without CARTWRIGHT_TRUST_PROXY_IP_HEADERS): one shared bucket
    // would then throttle every customer of the shop at once, so the per-IP
    // limit applies only to a known client. The honeypot and fill time above
    // still apply to everyone.
    const ip = trustedClientIp(await headers());
    if (ip !== "unknown" && !registerPerIpLimiter.check(ip).allowed) {
      return {
        ok: false,
        error: "Too many attempts. Please try again in a few minutes.",
      };
    }

    const { name, password } = result.data;
    // Saved lowercased, so `Foo@x.dk` and `foo@x.dk` are one customer
    // (REG-EMAIL-CASE, lib/auth/account-email.ts). The lookup below compares
    // case-insensitively against the rows as stored: an account saved in the
    // case it was typed before this (`Ada@Example.com`) counts as taken by
    // `ada@example.com` too, so no second account is made for it.
    const email = normalizeAccountEmail(result.data.email);

    // Answer a known and an unknown address the same way, and hash before the
    // lookup so both pay the bcrypt cost: the answer itself no longer says
    // "this address already has an account". (Without email verification a
    // prober can still try to sign in with the password it chose — the limit
    // above is what slows that down.) The owner of an existing account lands
    // on the login page, as a new one does.
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await findAccountsByEmail(result.data.email);
    if (existing.length > 0) {
      return { ok: true };
    }

    await prisma.user.create({
      data: { name, email, passwordHash, role: "customer" },
    });

    // Fire-and-forget welcome-event til Resend Automations (no-op uden flag/
    // Resend-key/consent). Må aldrig blokere signup.
    void emitMarketingEvent(MARKETING_EVENTS.userCreated, email, { name });

    return { ok: true };
  } catch (err) {
    // Two sign-ups for one address racing past the lookup: the loser hits the
    // unique index, and must get the same neutral answer as above.
    if ((err as { code?: unknown } | null)?.code === "P2002") {
      return { ok: true };
    }
    console.error(err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
