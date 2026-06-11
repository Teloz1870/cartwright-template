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
            Your store&apos;s copy as one field-space. Set the high-level{" "}
            <strong>identity anchors</strong> (tone, audience, formality, vibe), and{" "}
            <strong>re-harmonize</strong> to let every resolvable field rewrite
            itself in that voice. Rendering never calls an LLM — only the buttons
            here (or the <code className="rounded bg-sol-ink/5 px-1">genome.*</code> AI tool)
            trigger resolution. Turn it on under{" "}
            <Link href="/admin/features" className="underline">Features</Link> (
            <code className="rounded bg-sol-ink/5 px-1">Resolvable Genome</code>) to
            show the resolved copy on the storefront; while it&apos;s off, the anchors render.
          </>
        }
      />

      <GenomeDashboard snapshot={snapshot} identityOptions={IDENTITY_OPTIONS} />
    </div>
  );
}
