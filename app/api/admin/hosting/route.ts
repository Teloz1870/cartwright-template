import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// GET /api/admin/hosting?domain=...
// Tjekker status på et domæne via Vercel API
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const domain = url.searchParams.get("domain");

    if (!domain) {
      return NextResponse.json({ error: "Missing domain param" }, { status: 400 });
    }

    const settings = await prisma.integrationSettings.findUnique({ where: { id: 1 } });
    if (!settings?.vercelToken || !settings?.vercelProjectId) {
      return NextResponse.json({ error: "Vercel credentials not configured" }, { status: 400 });
    }

    const response = await fetch(`https://api.vercel.com/v9/projects/${settings.vercelProjectId}/domains/${domain}`, {
      headers: {
        Authorization: `Bearer ${settings.vercelToken}`,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || "Failed to fetch domain status" }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/admin/hosting
// Tilføjer et domæne til projektet via Vercel API
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { domain } = await req.json();

    if (!domain) {
      return NextResponse.json({ error: "Missing domain" }, { status: 400 });
    }

    const settings = await prisma.integrationSettings.findUnique({ where: { id: 1 } });
    if (!settings?.vercelToken || !settings?.vercelProjectId) {
      return NextResponse.json({ error: "Vercel credentials not configured" }, { status: 400 });
    }

    const response = await fetch(`https://api.vercel.com/v10/projects/${settings.vercelProjectId}/domains`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || "Failed to add domain" }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
