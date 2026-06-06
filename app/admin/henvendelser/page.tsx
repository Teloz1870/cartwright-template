import { prisma } from "@/lib/db";
// Removed date-fns import

export const metadata = {
  title: "Henvendelser | Cartwright Admin",
};

export default async function InquiriesPage() {
  const inquiries = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-sol-ink">Henvendelser</h1>
          <p className="mt-2 text-sol-muted">
            Oversigt over leads og forespørgsler fra besøgende.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-sol-ink/10 bg-sol-sand">
        {inquiries.length === 0 ? (
          <div className="p-12 text-center text-sol-muted">
            Ingen henvendelser endnu.
          </div>
        ) : (
          <table className="w-full text-left text-sm text-sol-ink">
            <thead className="bg-sol-cream/50 text-xs uppercase tracking-wider text-sol-muted">
              <tr>
                <th className="px-6 py-4 font-black">Dato</th>
                <th className="px-6 py-4 font-black">Navn & Kontakt</th>
                <th className="px-6 py-4 font-black">Service</th>
                <th className="px-6 py-4 font-black">Status / Prioritet</th>
                <th className="px-6 py-4 font-black">Besked & AI Triage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sol-ink/10">
              {inquiries.map((inq) => (
                <tr key={inq.id} className="transition hover:bg-sol-cream/30 items-start">
                  <td className="whitespace-nowrap px-6 py-4 align-top">
                    {new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", hour: '2-digit', minute: '2-digit' }).format(new Date(inq.createdAt))}
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="font-bold">{inq.name}</div>
                    <div className="text-xs text-sol-muted mt-1">
                      <a href={`mailto:${inq.email}`} className="hover:underline block">{inq.email}</a>
                      {inq.phone && <a href={`tel:${inq.phone}`} className="hover:underline block mt-1">{inq.phone}</a>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 font-medium align-top">
                    {inq.projectType}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 align-top space-y-2 flex flex-col items-start">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      inq.status === 'new' ? 'bg-blue-100 text-blue-800' :
                      inq.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {inq.status === 'new' ? 'Ny' :
                       inq.status === 'in_progress' ? 'Igangværende' : 'Afsluttet'}
                    </span>

                    {inq.aiPriority && (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        inq.aiPriority === 'urgent' ? 'bg-red-100 text-red-800 border border-red-200' :
                        inq.aiPriority === 'normal' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                        'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}>
                        AI: {inq.aiPriority === 'urgent' ? 'Haster' : inq.aiPriority === 'normal' ? 'Normal' : 'Lav prio'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="space-y-4">
                      {/* Original besked */}
                      <div>
                        <p className="text-sm text-sol-ink font-medium whitespace-pre-wrap">
                          {inq.message || "-"}
                        </p>
                      </div>

                      {/* Vedhæftninger (brand.features.contactAttachments) */}
                      {Array.isArray(inq.attachmentUrls) &&
                        inq.attachmentUrls.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-bold text-sol-muted">
                              Vedhæftninger
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {(inq.attachmentUrls as string[]).map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block h-16 w-16 overflow-hidden rounded-lg border border-sol-ink/10"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`Vedhæftning ${i + 1}`}
                                    className="h-full w-full object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* AI Triage Section */}
                      {(inq.aiSummary || inq.aiSuggestedReply) && (
                        <div className="bg-sol-accent/5 border border-sol-accent/20 rounded-xl p-4 mt-2">
                          <h4 className="text-xs font-black uppercase text-sol-accent tracking-wider mb-2 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            AI Triage
                          </h4>
                          
                          {inq.aiSummary && (
                            <div className="mb-3">
                              <span className="text-xs font-bold text-sol-ink">Opsummering: </span>
                              <span className="text-sm text-sol-ink">{inq.aiSummary}</span>
                            </div>
                          )}

                          {inq.aiSuggestedReply && (
                            <div>
                              <span className="text-xs font-bold text-sol-ink block mb-1">Foreslået Svar:</span>
                              <div className="bg-sol-sand border border-sol-ink/10 rounded p-3 text-sm text-sol-ink whitespace-pre-wrap relative group">
                                {inq.aiSuggestedReply}
                                {/* In a real app, this would use a Client Component for copy-to-clipboard */}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
