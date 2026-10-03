import { NextRequest, NextResponse } from "next/server";

import { subscribe } from "@/lib/newsletter";

/** Newsletter-tilmelding. POST { email, source? }. */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email : "";
  const source = typeof b.source === "string" ? b.source : undefined;

  const result = await subscribe(email, source);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
