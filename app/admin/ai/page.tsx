import AdminChatPanel from "@/components/admin/AdminChatPanel";

export const dynamic = "force-dynamic";

export default function AdminAiPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">AI-copilot</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Chat med en AI der kan styre shoppen. Destruktive handlinger viser
          a plan card before execution - no changes go through without your
          click. Turn on &quot;Suggestions only&quot; if you want to try it without risk.
        </p>
      </header>

      <section className="sol-card-elevated overflow-hidden">
        <AdminChatPanel />
      </section>
    </div>
  );
}
