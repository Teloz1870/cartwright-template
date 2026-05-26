import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// This endpoint allows external AI tools (v0, Cursor, Lovable) to push
// generated React Server Components or raw HTML directly into Cartwright.
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    const settings = await prisma.integrationSettings.findUnique({
      where: { id: 1 }
    });

    if (!settings?.vibeApiKey || token !== settings.vibeApiKey) {
      return NextResponse.json({ error: "Invalid Vibe API Key" }, { status: 403 });
    }

    const { target, targetId, html } = await req.json();

    if (!target || !targetId || !html) {
      return NextResponse.json({ error: "Missing required fields: target, targetId, html" }, { status: 400 });
    }

    let updatedEntity;

    switch (target) {
      case "page":
        updatedEntity = await prisma.page.update({
          where: { id: targetId },
          data: { vibeHtml: html }
        });
        break;
      case "service":
        updatedEntity = await prisma.service.update({
          where: { id: targetId },
          data: { vibeHtml: html }
        });
        break;
      case "category":
        updatedEntity = await prisma.category.update({
          where: { id: targetId },
          data: { vibeHtml: html }
        });
        break;
      default:
        return NextResponse.json({ error: "Invalid target. Allowed: page, service, category" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: `Successfully injected Vibe HTML into ${target} ${targetId}` });

  } catch (error: any) {
    console.error("Vibe Push Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
