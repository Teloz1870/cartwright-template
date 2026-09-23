import { AdminPageHeader } from "@/components/admin/ui";
import { getRedirectsForUi } from "./actions";
import { RedirectsManager } from "./RedirectsManager";

export const dynamic = "force-dynamic";

export default async function AdminRedirectsPage() {
  const redirects = await getRedirectsForUi();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Redirects"
        subtitle={
          <>
            301/302 redirects (e.g. after slug changes). They take effect on the edge via
            the proxy within ~1 min. <strong>Requires Redis</strong> (UPSTASH_*) to
            work on the edge — without it they are saved but not activated.
          </>
        }
      />
      <RedirectsManager initial={redirects} />
    </div>
  );
}
