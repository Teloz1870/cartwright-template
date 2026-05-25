import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { generateObject } from "ai";
import { chatModel } from "@/lib/ai/client";
import { brand } from "@/brand.config";

const schema = z.object({
  name: z.string().min(2, "Dit navn er for kort"),
  email: z.string().email("Ugyldig email-adresse"),
  phone: z.string().optional(),
  company: z.string().optional(),
  projectType: z.string().min(1, "Du skal vælge en service"),
  budget: z.string().default("Ukendt"),
  message: z.string().optional(),
});

const triageSchema = z.object({
  priority: z.enum(["low", "normal", "urgent"]),
  summary: z.string(),
  suggestedReply: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    let aiPriority = "normal";
    let aiSummary = "";
    let aiSuggestedReply = "";

    // AI Triage in background before saving
    if (data.message && data.message.trim().length > 5) {
      try {
        const model = await chatModel();
        const { object } = await generateObject({
          model,
          schema: triageSchema,
          prompt: `You are an AI assistant for ${brand.storeName}. 
Analyze this customer inquiry.
Customer Name: ${data.name}
Service: ${data.projectType}
Message: ${data.message}

1. priority: 'urgent' if they are angry, threatening to cancel, or need immediate help with an ongoing critical issue. 'normal' otherwise. 'low' for casual feedback or non-important questions.
2. summary: A 1-sentence summary of what the customer wants.
3. suggestedReply: A draft reply in Danish that the admin can copy/paste to the user. It should be polite and helpful.`,
        });
        aiPriority = object.priority;
        aiSummary = object.summary;
        aiSuggestedReply = object.suggestedReply;
      } catch (err) {
        console.error("AI Triage failed:", err);
      }
    }

    const inquiry = await prisma.lead.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        company: data.company || null,
        projectType: data.projectType,
        budget: data.budget,
        message: data.message || null,
        status: "new",
        aiPriority: aiPriority || null,
        aiSummary: aiSummary || null,
        aiSuggestedReply: aiSuggestedReply || null,
      },
    });

    return NextResponse.json({ ok: true, id: inquiry.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Der opstod en fejl ved afsendelse" }, { status: 500 });
  }
}
