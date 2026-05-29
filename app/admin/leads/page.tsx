import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { da } from "date-fns/locale";

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-sol-ink">Leads & Projektforespørgsler</h1>
          <p className="text-sol-muted mt-2 font-medium">Overblik over indkomne projekter fra Projektberegneren.</p>
        </div>
      </div>

      <div className="bg-sol-sand rounded-2xl shadow-sm border border-sol-ink/10 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-sol-sand/30 border-b border-sol-ink/5">
            <tr>
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">Dato</th>
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">Klient</th>
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">Projekt</th>
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">Budget</th>
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">AI Triage</th>
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sol-ink/5">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sol-muted">
                  Ingen leads endnu. Del din Projektberegner for at komme i gang!
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-sol-sand/10 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sol-ink font-medium">
                    {format(new Date(lead.createdAt), "d. MMM yyyy", { locale: da })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-sol-ink">{lead.name}</div>
                    {lead.company && <div className="text-xs text-sol-muted">{lead.company}</div>}
                    <div className="text-xs text-sol-accent mt-1">{lead.email}</div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-sol-ink">
                    {lead.projectType}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2.5 py-1 rounded-md bg-sol-sand text-sol-ink text-xs font-bold border border-sol-ink/10">
                      {lead.budget}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {lead.aiPriority === "urgent" ? (
                      <span className="inline-flex px-2 py-1 bg-red-100 text-red-700 text-xs font-bold uppercase tracking-wider rounded">Urgent ⚡️</span>
                    ) : (
                      <span className="inline-flex px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded">Normal</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      defaultValue={lead.status}
                      className="bg-transparent font-bold text-sm outline-none border-none cursor-pointer focus:ring-0"
                    >
                      <option value="new">Ny</option>
                      <option value="contacted">Kontaktet</option>
                      <option value="won">Vundet</option>
                      <option value="lost">Tabt</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
