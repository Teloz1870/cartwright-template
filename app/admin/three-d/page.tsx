import { getThreeDForUi } from "./actions";
import Link from "next/link";
import { ThreeDForm } from "./ThreeDForm";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminThreeDPage() {
  const data = await getThreeDForUi();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        title="Live Canvas (3D)"
        subtitle={
          <>
            Den AI-konfigurerbare 3D-hero. Tænd/sluk under{" "}
            <Link href="/admin/features" className="underline">
              Funktioner
            </Link>{" "}
            (<code className="rounded bg-sol-ink/5 px-1">Live Canvas (3D)</code>);
            vælg scene + intensitet her. Du (eller AI-assistenten via{" "}
            <code className="rounded bg-sol-ink/5 px-1">three.configure</code>) kan
            ændre det live — ændringer slår igennem inden for 30 sekunder.
          </>
        }
      />

      <ThreeDForm initial={data} />
    </div>
  );
}
