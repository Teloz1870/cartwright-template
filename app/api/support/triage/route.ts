import { NextResponse } from "next/server";
import { generateText } from "ai";
import { chatModelResolved, getAnthropicApiKey } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { brand } from "@/brand.config";
import { z } from "zod";
import { supportTriagePerIpLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { trustedClientIp } from "@/lib/trusted-client-ip";

const triageSchema = z.object({
  message: z.string().min(5),
});

export async function POST(req: Request) {
  // Uautentificeret rute der kalder en betalt model, og kontaktformularen kalder
  // den umiddelbart før /api/inquiries — derfor samme nøgle som dér:
  // trustedClientIp, ikke rå x-forwarded-for. Self-hosted uden overskrivende
  // proxy kunne en klient ellers sende sin egen header, få en frisk spand pr.
  // værdi og kalde modellen ubegrænset. En klient, der ikke kan identificeres,
  // deler "unknown"-spanden; er den brugt op, svarer ruten 429, og formularen
  // sender beskeden direkte til et menneske (/api/inquiries) uden AI-svar.
  const limit = supportTriagePerIpLimiter.check(trustedClientIp(req.headers));
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await req.json();
    const { message } = triageSchema.parse(body);

    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return NextResponse.json({
        canAnswer: false,
        answer: null,
      });
    }

    const resolved = await chatModelResolved("generation");

    const { text } = await withAuditContext(
      {
        provider: resolved.provider,
        model: resolved.model,
        modality: "text",
      },
      () =>
        generateText({
          model: resolved.handle,
          system: `You are an intelligent support assistant for ${brand.storeName}.
The user is about to submit a contact form with the following message.
Your job is to read their message and decide if you can provide an immediate answer based on general knowledge about our store.
If you can answer their question perfectly (e.g. shipping times, return policies, general FAQ), respond directly with the answer in Danish.
If you cannot answer (e.g. they need to change an order, they have a specific complaint, or it requires a human), respond ONLY with the word "ESCALATE".`,
          prompt: `User message: ${message}`,
        }),
    );

    const isEscalated = text.trim() === "ESCALATE" || text.includes("ESCALATE");

    if (isEscalated) {
      return NextResponse.json({
        canAnswer: false,
        answer: null,
      });
    }

    return NextResponse.json({
      canAnswer: true,
      answer: text.trim(),
    });

  } catch (error) {
    console.error("Support Triage Error:", error);
    return NextResponse.json({ canAnswer: false, answer: null });
  }
}
