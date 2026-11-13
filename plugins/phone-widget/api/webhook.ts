import { NextResponse } from "next/server";
import { isPhoneWebhookAuthorized } from "@/plugins/phone-widget/lib/verify-webhook";

export async function POST(request: Request) {
  // Shared-secret guard. Dormant (accepts everything) until the merchant sets
  // PHONE_INC_WEBHOOK_SECRET, so existing deployments are unaffected; once set,
  // unauthenticated callers are rejected before the body is parsed.
  if (!isPhoneWebhookAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const event = body.event;
    const callData = body.data;

    console.log(`[Phone.inc Webhook] Received event: ${event}`, callData);

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
      case "call.outside_opening_hours":
        // An inbound call arrived outside opening hours
        break;
      default:
        console.log(`[Phone.inc Webhook] Unhandled event type: ${event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Failed to process Phone.inc webhook:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
