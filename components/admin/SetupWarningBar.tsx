import Link from "next/link";
import { getSetupStatus } from "@/lib/setup-status";

/**
 * Shows a compact admin warning when required production setup is incomplete.
 */
export default async function SetupWarningBar() {
  const status = await getSetupStatus();

  if (!status.hasMissing) {
    return null;
  }

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <span>
          Produktionsopsætning mangler konfiguration ({status.okCount}/
          {status.totalRequired} klar).
        </span>
        <Link href="/admin/integrations" className="shrink-0 underline underline-offset-4 hover:text-sol-ink">
          Åbn setup-guide
        </Link>
      </div>
    </div>
  );
}
