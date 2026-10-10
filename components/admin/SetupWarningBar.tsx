import Link from "next/link";
import { cronJobsOpenInProduction } from "@/lib/cron/auth";
import { getSetupStatus } from "@/lib/setup-status";

/**
 * Shows a compact admin warning when required production setup is incomplete.
 * A production deploy without CRON_SECRET gets its own line on every admin
 * page: its cron jobs answer any caller, and the next release refuses them.
 */
export default async function SetupWarningBar() {
  const status = await getSetupStatus();
  const cronOpen = cronJobsOpenInProduction();

  if (!status.hasMissing && !cronOpen) {
    return null;
  }

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 md:px-8">
      {cronOpen && (
        <p className="mx-auto mb-1 max-w-7xl text-red-800">
          CRON_SECRET is not set: anyone can run this shop&apos;s scheduled jobs (backups, deletions,
          mails). The next release refuses them in production until it is set.
        </p>
      )}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <span>
          Production setup is missing configuration ({status.okCount}/
          {status.totalRequired} ready).
        </span>
        <Link href="/admin/integrations" className="shrink-0 underline underline-offset-4 hover:text-sol-ink">
          Open setup guide
        </Link>
      </div>
    </div>
  );
}
