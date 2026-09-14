import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { exportProductsCsv } from "@/lib/products-csv";

/** CSV export of all (non-deleted) products. Admin-only. */
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const csv = await exportProductsCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="products.csv"',
      "Cache-Control": "no-store",
    },
  });
}
