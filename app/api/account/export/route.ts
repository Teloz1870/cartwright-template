import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { exportUserData } from "@/lib/gdpr/export";

/**
 * DSAR-selvbetjening (GDPR art. 15/20): en indlogget kunde henter ALT deres
 * data som en JSON-fil. Auth via session; man kan kun eksportere SIT EGET data
 * (userId tages fra sessionen, ikke fra input).
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Ikke logget ind." }, { status: 401 });
  }

  const data = await exportUserData(userId);
  if (!data) {
    return NextResponse.json({ error: "Bruger ikke fundet." }, { status: 404 });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mine-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
