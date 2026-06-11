import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { listSubscribers, subscribersToCsv } from "@/lib/newsletter";

/** CSV-eksport af nyhedsbrevs-tilmeldinger (til kundens ESP). Admin-only. */
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const subs = await listSubscribers();
  const csv = subscribersToCsv(subs);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscribers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
