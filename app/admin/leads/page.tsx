import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { da } from "date-fns/locale";

/**
 * Leads & projektforespørgsler — den kanoniske indbakke for indkomne
 * henvendelser fra Projektberegneren / kontaktformularen (Lead-tabellen).
 *
 * Slår tidligere /admin/henvendelser sammen hertil (de kørte samme
 * prisma.lead.findMany): denne side bevarer henvendelser's rigere visning
 * (besked, vedhæftninger, AI-triage opsummering + foreslået svar) sammen med
 * leads' budget/firma-felter.
 */
export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-sol-ink">Leads & Projektforespørgsler</h1>
          <p className="text-sol-muted mt-2 font-medium">
            Overblik over indkomne projekter og henvendelser fra Projektberegneren.
          </p>
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
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">Status / Prioritet</th>
              <th className="px-6 py-4 font-black uppercase text-xs text-sol-muted tracking-wider">Besked & AI Triage</th>
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
                <tr key={lead.id} className="hover:bg-sol-sand/10 transition-colors align-top">
                  <td className="px-6 py-4 whitespace-nowrap text-sol-ink font-medium align-top">
                    {format(new Date(lead.createdAt), "d. MMM yyyy HH:mm", { locale: da })}
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="font-bold text-sol-ink">{lead.name}</div>
                    {lead.company && <div className="text-xs text-sol-muted">{lead.company}</div>}
                    <a href={`mailto:${lead.email}`} className="text-xs text-sol-accent mt-1 block hover:underline">
                      {lead.email}
                    </a>
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="text-xs text-sol-muted block hover:underline">
                        {lead.phone}
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4 font-semibold text-sol-ink align-top">{lead.projectType}</td>
                  <td className="px-6 py-4 align-top">
                    {lead.budget && (
                      <span className="inline-flex px-2.5 py-1 rounded-md bg-sol-sand text-sol-ink text-xs font-bold border border-sol-ink/10">
                        {lead.budget}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="flex flex-col items-start gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          lead.status === "new"
                            ? "bg-blue-100 text-blue-800"
                            : lead.status === "in_progress" || lead.status === "contacted"
                              ? "bg-amber-100 text-amber-800"
                              : lead.status === "lost"
                                ? "bg-gray-100 text-gray-700"
                                : "bg-green-100 text-green-800"
                        }`}
                      >
                        {lead.status === "new"
                          ? "Ny"
                          : lead.status === "contacted"
                            ? "Kontaktet"
                            : lead.status === "in_progress"
                              ? "Igangværende"
                              : lead.status === "won"
                                ? "Vundet"
                                : lead.status === "lost"
                                  ? "Tabt"
                                  : "Afsluttet"}
                      </span>

                      {lead.aiPriority && (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            lead.aiPriority === "urgent"
                              ? "bg-red-100 text-red-800 border border-red-200"
                              : lead.aiPriority === "normal"
                                ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                                : "bg-gray-100 text-gray-800 border border-gray-200"
                          }`}
                        >
                          AI: {lead.aiPriority === "urgent" ? "Haster" : lead.aiPriority === "normal" ? "Normal" : "Lav prio"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="space-y-4">
                      <p className="text-sm text-sol-ink font-medium whitespace-pre-wrap">
                        {lead.message || "-"}
                      </p>

                      {Array.isArray(lead.attachmentUrls) && lead.attachmentUrls.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-bold text-sol-muted">Vedhæftninger</p>
                          <div className="flex flex-wrap gap-2">
                            {(lead.attachmentUrls as string[]).map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block h-16 w-16 overflow-hidden rounded-lg border border-sol-ink/10"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={`Vedhæftning ${i + 1}`} className="h-full w-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {(lead.aiSummary || lead.aiSuggestedReply) && (
                        <div className="bg-sol-accent/5 border border-sol-accent/20 rounded-xl p-4">
                          <h4 className="text-xs font-black uppercase text-sol-accent tracking-wider mb-2 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            AI Triage
                          </h4>

                          {lead.aiSummary && (
                            <div className="mb-3">
                              <span className="text-xs font-bold text-sol-ink">Opsummering: </span>
                              <span className="text-sm text-sol-ink">{lead.aiSummary}</span>
                            </div>
                          )}

                          {lead.aiSuggestedReply && (
                            <div>
                              <span className="text-xs font-bold text-sol-ink block mb-1">Foreslået Svar:</span>
                              <div className="bg-sol-sand border border-sol-ink/10 rounded p-3 text-sm text-sol-ink whitespace-pre-wrap">
                                {lead.aiSuggestedReply}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
