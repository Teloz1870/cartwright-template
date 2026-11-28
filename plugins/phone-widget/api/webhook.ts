import { NextResponse } from "next/server";
import { getFeatures } from "@/lib/brand";
import {
  hasLegacyUrlToken,
  isValidPhoneIncSignature,
  phoneWebhookSecret,
} from "@/plugins/phone-widget/lib/verify-webhook";

/**
 * The event names Phone.inc documents (https://docs.phone.inc/api/webhooks),
 * plus `call.outside_opening_hours`, the name Phone.inc used before it moved
 * those subscriptions to `call.outside_business_hours`.
 *
 * Only a name on this list is written to the server log. A Phone.inc payload
 * carries the caller's number, voicemail transcripts and recording links, and a
 * server log is kept longer and read by more people than the data itself
 * (DRØM26-a), so nothing else from the body is logged.
 */
const PHONE_INC_EVENTS: ReadonlySet<string> = new Set([
  "call.initiated",
  "call.outside_business_hours",
  "call.outside_opening_hours",
  "call.queued",
  "call.answered",
  "call.ended",
  "call.lost",
  "call.transcription_done",
  "call.summary_done",
  "call.data_deleted",
  "voicemail.new",
  "voicemail.transcription_done",
  "voicemail.data_deleted",
  "note.created",
  "note.deleted",
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "employee.status.changed",
  "number.registration_approved",
  "number.registration_rejected",
]);

export function loggableEventName(event: unknown): string {
  if (typeof event === "string" && PHONE_INC_EVENTS.has(event)) return event;
  return "(not a Phone.inc event)";
}

/** A delivery is at most a few KB; this only bounds what an unsigned caller makes us read. */
const MAX_BODY = 1024 * 1024;

/**
 * The body's bytes, or null once it passes `max`. Read chunk by chunk and
 * cancelled at the limit, so a chunked request without `Content-Length` is
 * not buffered whole before its size is known.
 */
async function readBodyCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * POST /api/phone/webhook — Phone.inc's webhook.
 *
 *   flag `phoneWidget` off  → 404, as if the route were not mounted;
 *   no signing secret       → 503, fail closed (Phone.inc retries a 5xx, so a
 *                              delivery made while the secret is being set is
 *                              not lost at once);
 *   bad or missing signature, timestamp outside ±300 s → 401;
 *   signed body that is not a JSON object → 400 (Phone.inc does not retry a
 *                              4xx; the same bytes would fail every retry).
 *
 * The body is read as bytes and verified before anything parses it.
 */
export async function POST(request: Request) {
  if (!(await getFeatures()).phoneWidget) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = phoneWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await readBodyCapped(request, MAX_BODY);
  if (!rawBody) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const signed = isValidPhoneIncSignature({
    secret,
    timestamp: request.headers.get("x-phone-inc-timestamp"),
    signature: request.headers.get("x-phone-inc-signature"),
    rawBody,
  });
  if (!signed) {
    if (!hasLegacyUrlToken(request, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.warn(
      "[Phone.inc Webhook] Accepted through the deprecated ?token= URL; remove it and set PHONE_INC_WEBHOOK_SECRET to the subscription's signing secret.",
    );
  }

  let event: unknown;
  try {
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new TypeError();
    event = (body as { event?: unknown }).event;
  } catch (error) {
    // The error's name only: a JSON parse error's message quotes the start of
    // the body it could not read, and that can be the caller's number.
    const kind = error instanceof Error ? error.name : typeof error;
    console.error(`Failed to process Phone.inc webhook: ${kind}`);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log(`[Phone.inc Webhook] Received event: ${loggableEventName(event)}`);

  switch (event) {
    case "call.initiated":
      // A new inbound or outbound call has started
      break;
    case "call.answered":
      // The call was answered by an employee
      break;
    case "call.ended":
      // The call has ended, regardless of outcome
      break;
    case "call.lost":
      // The call ended without being answered and without going to voicemail
      break;
    case "voicemail.new":
      // A new voicemail was recorded and saved
      break;
    case "call.transcription_done":
      // The call recording has been transcribed
      break;
    case "call.outside_business_hours":
    case "call.outside_opening_hours":
      // An inbound call arrived outside business hours (the second name is
      // the one Phone.inc used before; kept for older deliveries)
      break;
    default:
      console.log(`[Phone.inc Webhook] Unhandled event type: ${loggableEventName(event)}`);
  }

  return NextResponse.json({ received: true });
}
