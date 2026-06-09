import { getGenomeForUi } from "./actions";
import Link from "next/link";
import { IDENTITY_OPTIONS } from "@/lib/genome/identity";
import { GenomeDashboard } from "./GenomeDashboard";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminGenomePage() {
  const snapshot = await getGenomeForUi();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        title="Resolvable Genome"
        subtitle={
          <>
            Forretningens copy som ét felt-rum. Sæt de høj-niveau{" "}
            <strong>identity-ankre</strong> (tone, audience, formality, vibe), og{" "}
            <strong>re-harmonisér</strong> for at lade hvert resolvable felt skrive
            sig selv om i den stemme. Render kalder aldrig en LLM — kun knapperne
            her (eller AI-tool&apos;et <code className="rounded bg-sol-ink/5 px-1">genome.*</code>)
            trigger resolution. Tænd under{" "}
            <Link href="/admin/features" className="underline">Funktioner</Link> (
            <code className="rounded bg-sol-ink/5 px-1">Resolvable Genome</code>) for at
            vise det resolvede på storefront; er det slukket rendres ankrene.
          </>
        }
      />

      <GenomeDashboard snapshot={snapshot} identityOptions={IDENTITY_OPTIONS} />
    </div>
  );
}
