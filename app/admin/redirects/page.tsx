import { getRedirectsForUi } from "./actions";
import { RedirectsManager } from "./RedirectsManager";

export const dynamic = "force-dynamic";

export default async function AdminRedirectsPage() {
  const redirects = await getRedirectsForUi();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Redirects</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          301/302-omdirigeringer (fx ved ændrede slugs). Slår igennem på edge via
          proxy&apos;en inden for ~1 min. <strong>Kræver Redis</strong> (UPSTASH_*) for
          at virke på edge — uden det gemmes de, men aktiveres ikke.
        </p>
      </header>
      <RedirectsManager initial={redirects} />
    </div>
  );
}
