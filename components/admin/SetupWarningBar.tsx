import Link from "next/link";
import { cronJobsRefusedInProduction } from "@/lib/cron/auth";
import { getSetupStatus } from "@/lib/setup-status";

/**
 * Shows a compact admin warning when required production setup is incomplete.
 * A production deploy without CRON_SECRET gets its own line on every admin
 * page: it refuses every cron call, so its scheduled jobs do not run.
 */
export default async function SetupWarningBar() {
  const status = await getSetupStatus();
  const cronRefused = cronJobsRefusedInProduction();

  if (!status.hasMissing && !cronRefused) {
    return null;
  }

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 md:px-8">
      {cronRefused && (
        <p className="mx-auto mb-1 max-w-7xl text-red-800">
          CRON_SECRET is not set: this shop refuses every cron call, so its scheduled jobs (backups,
          deletions, mails) do not run until it is set.
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
