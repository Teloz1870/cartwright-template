import AdminChatPanel from "@/components/admin/AdminChatPanel";

export const dynamic = "force-dynamic";

export default function AdminAiPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">AI-copilot</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Chat med en AI der kan styre shoppen. Destruktive handlinger viser
          en plan-card før de udføres — ingen ændringer går igennem uden dit
          klik. Slå &quot;Kun forslag&quot; til hvis du vil prøve uden risiko.
        </p>
      </header>

      <section className="sol-card-elevated overflow-hidden">
        <AdminChatPanel />
      </section>
    </div>
  );
}
