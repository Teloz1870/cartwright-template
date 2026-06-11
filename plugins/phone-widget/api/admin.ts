import { NextResponse } from "next/server";


export async function POST(req: Request) {
  try {
    const { ivrText } = await req.json();

    // Here we would sync with the Phone.inc API using the keys
    // from IntegrationSettings (phoneIncWorkspaceId, phoneIncApiKey).
    // For now we just mock the success response.

    console.log("Mock syncing IVR to Phone.inc:", ivrText);

    return NextResponse.json({ ok: true, message: "IVR updated" });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET(_req: Request) {
  try {
    // Mock fetching calls
    return NextResponse.json({
      calls: [
        { id: 1, from: "+45 20 30 40 50", status: "missed", duration: "0:00", time: "10 minutter siden" },
      ]
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
