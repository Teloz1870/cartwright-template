import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import {
  AdminPageHeader,
  AdminCard,
  AdminBadge,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
  AdminTableEmpty,
} from "@/components/admin/ui";

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
    <div className="flex flex-col gap-6 p-8">
      <AdminPageHeader
        title="Leads & Project Inquiries"
        subtitle="Overview of incoming projects and inquiries from the Project Estimator."
      />

      <AdminCard padding="none">
        <AdminTable>
          <AdminThead>
            <tr>
              <AdminTh>Date</AdminTh>
              <AdminTh>Client</AdminTh>
              <AdminTh>Project</AdminTh>
              <AdminTh>Budget</AdminTh>
              <AdminTh>Status / Priority</AdminTh>
              <AdminTh>Message & AI Triage</AdminTh>
            </tr>
          </AdminThead>
          <AdminTbody>
            {leads.length === 0 ? (
              <AdminTableEmpty colSpan={6}>
                No leads yet. Share your Project Estimator to get started!
              </AdminTableEmpty>
            ) : (
              leads.map((lead) => (
                <AdminTr key={lead.id} className="align-top">
                  <AdminTd className="whitespace-nowrap font-medium align-top">
                    {format(new Date(lead.createdAt), "d. MMM yyyy HH:mm", { locale: da })}
                  </AdminTd>
                  <AdminTd className="align-top">
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
                  </AdminTd>
                  <AdminTd className="font-semibold align-top">{lead.projectType}</AdminTd>
                  <AdminTd className="align-top">
                    {lead.budget && <AdminBadge tone="neutral">{lead.budget}</AdminBadge>}
                  </AdminTd>
                  <AdminTd className="align-top">
                    <div className="flex flex-col items-start gap-2">
                      <AdminBadge
                        tone={
                          lead.status === "new"
                            ? "info"
                            : lead.status === "in_progress" || lead.status === "contacted"
                              ? "attention"
                              : lead.status === "lost"
                                ? "neutral"
                                : "success"
                        }
                      >
                        {lead.status === "new"
                          ? "New"
                          : lead.status === "contacted"
                            ? "Contacted"
                            : lead.status === "in_progress"
                              ? "In progress"
                              : lead.status === "won"
                                ? "Won"
                                : lead.status === "lost"
                                  ? "Lost"
                                  : "Closed"}
                      </AdminBadge>

                      {lead.aiPriority && (
                        <AdminBadge
                          tone={
                            lead.aiPriority === "urgent"
                              ? "critical"
                              : lead.aiPriority === "normal"
                                ? "attention"
                                : "neutral"
                          }
                        >
                          AI: {lead.aiPriority === "urgent" ? "Urgent" : lead.aiPriority === "normal" ? "Normal" : "Low priority"}
                        </AdminBadge>
                      )}
                    </div>
                  </AdminTd>
                  <AdminTd className="align-top">
                    <div className="space-y-4">
                      <p className="text-sm text-sol-ink font-medium whitespace-pre-wrap">
                        {lead.message || "-"}
                      </p>

                      {Array.isArray(lead.attachmentUrls) && lead.attachmentUrls.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-bold text-sol-muted">Attachments</p>
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
                                <img src={url} alt={`Attachment ${i + 1}`} className="h-full w-full object-cover" />
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
                              <span className="text-xs font-bold text-sol-ink">Summary: </span>
                              <span className="text-sm text-sol-ink">{lead.aiSummary}</span>
                            </div>
                          )}

                          {lead.aiSuggestedReply && (
                            <div>
                              <span className="text-xs font-bold text-sol-ink block mb-1">Suggested Reply:</span>
                              <div className="bg-sol-sand border border-sol-ink/10 rounded p-3 text-sm text-sol-ink whitespace-pre-wrap">
                                {lead.aiSuggestedReply}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </AdminTd>
                </AdminTr>
              ))
            )}
          </AdminTbody>
        </AdminTable>
      </AdminCard>
    </div>
  );
}
