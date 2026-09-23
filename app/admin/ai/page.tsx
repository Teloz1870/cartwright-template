import AdminChatPanel from "@/components/admin/AdminChatPanel";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default function AdminAiPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        title="AI-copilot"
        subtitle={
          <>
            Chat with an AI that can run the shop. Destructive actions show
            a plan card before execution - no changes go through without your
            click. Turn on &quot;Suggestions only&quot; if you want to try it without risk.
          </>
        }
      />

      <section className="sol-card-elevated overflow-hidden">
        <AdminChatPanel />
      </section>
    </div>
  );
}
