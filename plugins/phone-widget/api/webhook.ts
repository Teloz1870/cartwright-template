import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Verify webhook signature here if Phone.inc uses one
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
