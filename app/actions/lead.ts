"use server";

import { prisma } from "@/lib/db";
import { z } from "zod";

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

    // AI Triage Strategy (simple for now)
    const isUrgent = parsed.budget === "50k+" || parsed.message?.toLowerCase().includes("haster");
    const aiPriority = isUrgent ? "urgent" : "normal";

    await prisma.lead.create({
      data: {
        ...parsed,
        aiPriority,
      },
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0].message };
    }
    return { ok: false, error: "Der skete en uventet fejl" };
  }
}
