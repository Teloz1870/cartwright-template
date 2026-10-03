"use server";

import { z } from "zod";
import { sendContactMail } from "@/lib/contact-mail";

/**
 * B3 static seam variant — the lead-capture server action WITHOUT a
 * database (site-profile program). The materializer copies this file over
 * `app/actions/lead.ts` when the db module is not in the profile; NOTHING
 * imports it in the shipped engine (byte-identical until then).
 *
 * Same schema + return contract as the db variant, so the /start lead wizard
 * works unchanged — the lead is delivered to the owner's inbox
 * (lib/contact-mail: Resend when configured, .mail-previews/ in dev) instead
 * of a Lead row + AI triage.
 */
const leadSchema = z.object({
  name: z.string().min(1, "Navn er påkrævet"),
  email: z.string().email("Ugyldig email"),
  company: z.string().optional(),
  phone: z.string().optional(),
  projectType: z.string().min(1, "Vælg en projekttype"),
  budget: z.string().min(1, "Vælg et budget"),
  message: z.string().optional(),
});

export async function createLead(formData: FormData) {
  try {
    const rawData = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      company: formData.get("company") as string,
      phone: formData.get("phone") as string,
      projectType: formData.get("projectType") as string,
      budget: formData.get("budget") as string,
      message: formData.get("message") as string,
    };

    const parsed = leadSchema.parse(rawData);

    const delivered = await sendContactMail({
      subject: `New lead: ${parsed.name} (${parsed.projectType})`,
      replyTo: parsed.email,
      text: [
        `Name: ${parsed.name}`,
        `Email: ${parsed.email}`,
        parsed.company ? `Company: ${parsed.company}` : null,
        parsed.phone ? `Phone: ${parsed.phone}` : null,
        `Project type: ${parsed.projectType}`,
        `Budget: ${parsed.budget}`,
        "",
        parsed.message ?? "",
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    });

    if (!delivered) {
      return { ok: false, error: "Der skete en uventet fejl" };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0].message };
    }
    return { ok: false, error: "Der skete en uventet fejl" };
  }
}
