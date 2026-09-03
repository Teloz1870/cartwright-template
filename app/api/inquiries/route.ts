import { NextResponse, after } from "next/server";
import { getFeatures } from "@/lib/brand";
import {
  inquiryErrorCode,
  inquiryErrorEnglish,
  type InquiryErrorCode,
} from "@/lib/inquiry-errors";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { generateObject } from "ai";
import { chatModelResolved } from "@/lib/ai/client";
import { getAiSettings } from "@/lib/ai/settings";
import { withAuditContext } from "@/lib/audit-context";
import { brand } from "@/brand.config";
import { inquiryPerIpLimiter, rateLimitResponse } from "@/lib/rate-limit";

function inquiryFailure(code: InquiryErrorCode) {
  return { code, error: inquiryErrorEnglish(code) };
}

// Kun vores egne Vercel Blob-URL'er accepteres som vedhæftninger (de kommer fra
// /api/contact/upload) — forhindrer at klienten injicerer vilkårlige URL'er.
const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/;

/**
 * Runtime-tier flag (see the manifest), so it must be read through getBrand's
 * merge — not the static config. Reading the static value here silently
 * dropped attachmentUrls on a shop that had turned attachments on in
 * /admin/features.
 */
async function contactAttachmentsEnabled(): Promise<boolean> {
  const features = (await getFeatures()) as { contactAttachments?: boolean };
  return Boolean(features.contactAttachments);
}

const schema = z.object({
  name: z.string().min(2, "invalid_name"),
  email: z.string().email("invalid_email"),
  phone: z.string().optional(),
  company: z.string().optional(),
  // Agency vocabulary — a product/SaaS fork has no "service" to pick, and this
  // field being REQUIRED meant such a fork could not receive a plain enquiry at
  // all. Optional at the wire; the column stays non-null (see the write below),
  // so no migration is needed and existing rows are untouched.
  projectType: z.string().optional(),
  // "" not a word: SmartContactForm never sends `budget`, so every lead from
  // that form got a Danish badge at app/admin/leads/page.tsx:75. The badge is
  // rendered behind `lead.budget &&`, so an empty string omits it entirely —
  // which is the honest rendering of "the form did not ask".
  budget: z.string().default(""),
  message: z.string().optional(),
  attachmentUrls: z
    .array(
      z
        .string()
        .url()
        .refine((u) => {
          try {
            return BLOB_HOST_RE.test(new URL(u).hostname);
          } catch {
            return false;
          }
        }, "Ugyldig vedhæftnings-URL"),
    )
    .max(3)
    .optional(),
});

const triageSchema = z.object({
  priority: z.enum(["low", "normal", "urgent"]),
  summary: z.string(),
  suggestedReply: z.string(),
});

function leadAiTriageEnabled(): boolean {
  return Boolean((brand.features as { leadAiTriage?: boolean }).leadAiTriage);
}

type TriageInput = { name: string; projectType: string; message: string };

/**
 * Enrich an ALREADY-SAVED lead with AI triage (priority, summary, draft reply).
 *
 * Runs after the response — never on the visitor's critical path. It used to be
 * `await`ed *before* `prisma.lead.create`, under a comment that claimed
 * "in background": every visitor waited on a full structured-output round-trip
 * before their confirmation, and on a shop without an Anthropic key the call
 * threw and logged on EVERY submission, forever. The lead was saved by a
 * `catch`, which is exactly why nobody noticed.
 *
 * Two guards, both silent by design:
 *  - `features.leadAiTriage` (default OFF). `ANTHROPIC_API_KEY` is documented as
 *    an optional env var with a "graceful no-op" contract (README, .env.example)
 *    and `lib/env-preflight.ts` does not require it — so a surface that needs it
 *    must not be on by default.
 *  - `anthropicConfigured` specifically, NOT `isAiConfigured()`: that helper is
 *    true when EITHER provider is set, while `chatModelResolved("vibe")` forces
 *    Anthropic (structured output is unreliable on local models). Same shape as
 *    the key check `app/api/support/triage/route.ts` already does.
 *
 * All three columns are nullable (`prisma/schema.prisma`), so skipping is
 * schema-safe and the lead keeps the `aiPriority: "normal"` it was created with.
 */
async function triageLead(leadId: string, input: TriageInput): Promise<void> {
  try {
    const settings = await getAiSettings();
    if (!settings.anthropicConfigured) return; // silent no-op, per the contract

    // intent="vibe" → tvinger Anthropic (structured triage må ikke fejle pga Gemma JSON-bug)
    const resolved = await chatModelResolved("vibe");
    const object = await withAuditContext(
      { provider: resolved.provider, model: resolved.model, modality: "text" },
      async () => {
        const r = await generateObject({
          model: resolved.handle,
          schema: triageSchema,
          prompt: `You are an AI assistant for ${brand.storeName}.
Analyze this customer inquiry.
Customer Name: ${input.name}
Service: ${input.projectType}
Message: ${input.message}

1. priority: 'urgent' if they are angry, threatening to cancel, or need immediate help with an ongoing critical issue. 'normal' otherwise. 'low' for casual feedback or non-important questions.
2. summary: A 1-sentence summary of what the customer wants.
3. suggestedReply: A draft reply in Danish that the admin can copy/paste to the user. It should be polite and helpful.`,
        });
        return r.object;
      },
    );

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        aiPriority: object.priority,
        aiSummary: object.summary || null,
        aiSuggestedReply: object.suggestedReply || null,
      },
    });
  } catch (err) {
    // The lead is already persisted; triage is enrichment, never a failure mode.
    console.error("AI Triage failed:", err);
  }
}

/**
 * Schedule the triage without touching response latency. `after()` runs the
 * callback once the response is sent and keeps the serverless function alive
 * until it finishes; outside a request scope (unit tests, scripts) we fall back
 * to a loose promise — `triageLead` never throws. Same pattern, and the same
 * reasoning, as `scheduleRegistryHit` in lib/registry-stats.ts.
 */
function scheduleLeadTriage(leadId: string, input: TriageInput): void {
  try {
    after(() => triageLead(leadId, input));
  } catch {
    void triageLead(leadId, input);
  }
}

export async function POST(req: Request) {
  // Spam-værn: rate-limit pr. IP (kontaktformularen er offentlig).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = inquiryPerIpLimiter.check(ip);
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await req.json();
    const data = schema.parse(body);

    const inquiry = await prisma.lead.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        company: data.company || null,
        projectType: data.projectType ?? "",
        budget: data.budget,
        message: data.message || null,
        status: "new",
        aiPriority: "normal",
        aiSummary: null,
        aiSuggestedReply: null,
        // undefined (ikke null) udelades af Prisma 7 for et Json?-felt → gemmes
        // som null. Et literal null afvises af InputJsonValue-typen.
        // Order matters: resolve the flag only when the request actually
        // carries attachments. Reading it unconditionally would put the brand
        // data source on the hot path of every enquiry, for a value that is
        // irrelevant to almost all of them.
        attachmentUrls:
          data.attachmentUrls?.length && (await contactAttachmentsEnabled())
            ? data.attachmentUrls
            : undefined,
      },
    });

    // Enrichment, after the response — see scheduleLeadTriage.
    if (leadAiTriageEnabled() && data.message && data.message.trim().length > 5) {
      scheduleLeadTriage(inquiry.id, {
        name: data.name,
        // Optional since the service picker became opt-out — mirror what was
        // written to the row so the prompt and the record agree.
        projectType: data.projectType ?? "",
        message: data.message,
      });
    }

    return NextResponse.json({ ok: true, id: inquiry.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, ...inquiryFailure(inquiryErrorCode(error.issues[0].message)) }, { status: 400 });
    }
    // A 500 here means the lead was NOT saved — a lost customer. It used to
    // return silently, so the only trace was the visitor's error toast.
    console.error("Inquiry failed:", error);
    return NextResponse.json({ ok: false, ...inquiryFailure("send_failed") }, { status: 500 });
  }
}
