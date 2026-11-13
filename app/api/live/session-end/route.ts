import { NextRequest } from "next/server";
import { z } from "zod";
import { incrementDailyUsage } from "@/lib/voice/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

const bodySchema = z.object({
  sessionId: z.string().min(1).max(128),
  minutesUsed: z.number().min(0).max(180),
});

/**
 * Voice-plan Fase 1: session-end endpoint.
 *
 * Browseren POSTer dette når VoiceShopClient detekterer at WS-sessionen
 * er afsluttet (timeout, user-close, eller WS-error efter retry). Vi
 * inkrementerer daily-usage-counter så cap håndhæves ved næste token-mint.
 *
 * Bevidst åbent endpoint (cookie-bundet, ikke API-key-beskyttet) fordi det
 * er nem at "snyde" alligevel: en kunde kan altid undgå at POSTe minutter
 * brugt ved at lukke fanen brat. Daily-cap er derfor _bedste-effort_ — ikke
 * en hård security-grænse. Hvis cost-kontrol bliver kritisk, måler vi via
 * Google's egne usage-rapporter i stedet (post-hoc).
 *
 * Reasonable upper bound på minutesUsed (180 min) catcher en form for
 * abuse hvor browseren forsøger at "negate" tidligere usage.
 */

export async function POST(request: NextRequest) {
  const cookie =
    request.cookies.get("cart_session")?.value ??
    request.cookies.get("kurv_session")?.value;
  if (!cookie) {
    return Response.json({ ok: false, error: "No session" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  await incrementDailyUsage(parsed.data.minutesUsed);

  return Response.json({ ok: true });
}
