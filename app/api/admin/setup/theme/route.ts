import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { VIBE_TEMPLATES } from "@/lib/templates";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { template } = await req.json();

    const selectedHtml = VIBE_TEMPLATES[template as keyof typeof VIBE_TEMPLATES];
    
    if (!selectedHtml) {
      return NextResponse.json({ error: "Invalid template" }, { status: 400 });
    }

    await prisma.page.upsert({
      where: { slug: "home" },
      update: { vibeHtml: selectedHtml, title: "Home", body: "" },
      create: { slug: "home", title: "Home", body: "", vibeHtml: selectedHtml }
    });

    revalidatePath("/");
    revalidatePath("/admin/indstillinger");

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
