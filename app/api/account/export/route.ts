import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { exportUserData } from "@/lib/gdpr/export";
import { dataExportLimiter, rateLimitResponse } from "@/lib/rate-limit";

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

  // Throttle per bruger: eksporten er tung (mange tabeller) og sjælden for en
  // ægte kunde, så et lavt loft stopper misbrug uden at genere normal brug.
  const limit = dataExportLimiter.check(userId);
  if (!limit.allowed) return rateLimitResponse(limit);

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
