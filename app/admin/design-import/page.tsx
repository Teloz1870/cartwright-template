import { requireAdmin } from "@/lib/admin";
import { DesignImportForm } from "./DesignImportForm";

export const dynamic = "force-dynamic";

export default async function DesignImportPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Design-import</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Træk en farvepalette fra en anden side ind i din shop på ~2 minutter.
          Firecrawl henter siden, AI udleder en Cartwright-palette, og du anvender
          den som tema. Kun design-vibe (farver/typografi/tone) — ikke layout.
        </p>
      </header>
      <DesignImportForm />
    </div>
  );
}
