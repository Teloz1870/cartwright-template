import { NextRequest, NextResponse } from "next/server";

import { logConsentDecision } from "@/lib/gdpr/consent-log";

/**
 * Modtager en consent-beslutning og logger den server-side (art. 7
 * ansvarlighed). Kan kaldes af ConsentBanner ved accept/afvis. Fail-soft.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  await logConsentDecision(
    {
      necessary: b.necessary === undefined ? true : Boolean(b.necessary),
      analytics: Boolean(b.analytics),
      marketing: Boolean(b.marketing),
    },
    {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    },
  );

  return NextResponse.json({ ok: true });
}
