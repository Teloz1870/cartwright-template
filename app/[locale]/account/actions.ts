"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/validation";
import {
  emitMarketingEvent,
  MARKETING_EVENTS,
} from "@/lib/marketing/automations";

export async function registerUser(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const raw = {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    };

    const result = registerSchema.safeParse(raw);
    if (!result.success) {
      return { ok: false, error: result.error.issues[0].message };
    }

    const { name, email, password } = result.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "A user with this email already exists" };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: { name, email, passwordHash, role: "customer" },
    });

    // Fire-and-forget welcome-event til Resend Automations (no-op uden flag/
    // Resend-key/consent). Må aldrig blokere signup.
    void emitMarketingEvent(MARKETING_EVENTS.userCreated, email, { name });

    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
