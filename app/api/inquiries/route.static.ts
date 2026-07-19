import { NextResponse } from "next/server";
import { z } from "zod";
import { sendContactMail } from "@/lib/contact-mail";
import { inquiryPerIpLimiter, rateLimitResponse } from "@/lib/rate-limit";

/**
 * B3 static seam variant — the contact-form endpoint WITHOUT a database
 * (site-profile program, `internal-docs/site-profile-ultraplan.md` §5). The
 * materializer copies this file over `app/api/inquiries/route.ts` when the
 * db module is not in the profile; NOTHING imports it in the shipped engine
 * (byte-identical until then).
 *
 * Same request schema and the `{ ok, error? }` response contract the
 * contact form consumes (deliberately WITHOUT the db variant's `id` — there
 * is no inquiry row to reference; the form only reads `ok`). The inquiry is delivered to the owner's inbox via
 * lib/contact-mail (owner decision 2026-07-15: the site-profile contact form
 * is Resend-only, no database, no AI triage). The in-memory per-IP rate
 * limit is shared with the db variant.
 */
const schema = z.object({
  name: z.string().min(2, "Dit navn er for kort"),
  email: z.string().email("Ugyldig email-adresse"),
  phone: z.string().optional(),
  company: z.string().optional(),
  projectType: z.string().min(1, "Du skal vælge en service"),
  budget: z.string().default("Ukendt"),
  message: z.string().optional(),
  // Attachment URLs only exist when the contactAttachments flag + upload
  // route (db module) are present — but the field must not be silently
  // dropped if a hybrid setup sends it: the links are forwarded in the mail.
  attachmentUrls: z.array(z.string().url()).max(3).optional(),
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = inquiryPerIpLimiter.check(ip);
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await req.json();
    const data = schema.parse(body);

    const delivered = await sendContactMail({
      subject: `New inquiry: ${data.name} (${data.projectType})`,
      replyTo: data.email,
      text: [
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        data.phone ? `Phone: ${data.phone}` : null,
        data.company ? `Company: ${data.company}` : null,
        `Service: ${data.projectType}`,
        `Budget: ${data.budget}`,
        "",
        data.message ?? "",
        ...(data.attachmentUrls?.length
          ? ["", "Attachments:", ...data.attachmentUrls.map((u) => `- ${u}`)]
          : []),
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    });

    if (!delivered) {
      return NextResponse.json(
        { ok: false, error: "Der opstod en fejl ved afsendelse" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0].message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Der opstod en fejl ved afsendelse" },
      { status: 500 },
    );
  }
}
