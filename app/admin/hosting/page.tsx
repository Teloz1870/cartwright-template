"use client";

import { useState } from "react";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminBadge,
} from "@/components/admin/ui";

export default function HostingDashboard() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ name?: string; verified?: boolean; verification?: { type: string; domain: string; value: string }[] } | null>(null);
  const [activeTab, setActiveTab] = useState<"domain" | "email">("domain");
  const [emailProvider, setEmailProvider] = useState<"google" | "microsoft" | "resend">("google");
  
  const handleAddDomain = async () => {
    if (!domain) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/hosting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add domain");
      
      // Fetch status right after adding
      handleCheckStatus(domain);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleCheckStatus = async (checkDomain: string = domain) => {
    if (!checkDomain) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hosting?domain=${checkDomain}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch status");
      setStatus(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl p-6 mx-auto">
      <div className="mb-8">
        <AdminPageHeader
          title="Go-Live Dashboard"
          subtitle="Software 3.0 Hosting Integration. Tilknyt dit domæne direkte til Vercel infrastrukturen uden at forlade platformen."
        />
      </div>

      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setActiveTab("domain")}
          className={`px-4 py-2 font-bold rounded-lg ${activeTab === "domain" ? "bg-sol-accent text-white" : "bg-white text-sol-ink border border-sol-ink/10"}`}
        >
          Domæne Opsætning
        </button>
        <button 
          onClick={() => setActiveTab("email")}
          className={`px-4 py-2 font-bold rounded-lg ${activeTab === "email" ? "bg-sol-accent text-white" : "bg-white text-sol-ink border border-sol-ink/10"}`}
        >
          E-mail (MX Records)
        </button>
      </div>

      {activeTab === "domain" && (
        <AdminCard bodyClassName="space-y-6">
          <div>
            <label className="block text-sm font-bold text-sol-ink mb-2">Tilknyt Domæne</label>
          <div className="flex gap-4">
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="ex: my-awesome-shop.com"
              className="flex-1 rounded-lg border border-sol-ink/15 px-4 py-2 focus:ring-2 focus:ring-sol-accent"
            />
            <AdminButton
              onClick={handleAddDomain}
              disabled={loading || !domain}
              variant="primary"
            >
              Tilføj Domæne
            </AdminButton>
          </div>
          {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
        </div>

        {status && (
          <div className="bg-sol-cream p-6 rounded-lg space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-sol-ink">Domæne Status: {status.name}</h2>
              <AdminBadge tone={status.verified ? "success" : "attention"}>
                {status.verified ? '✅ Verified & Live' : '⏳ Pending Configuration'}
              </AdminBadge>
            </div>

            {!status.verified && (
              <div className="space-y-4">
                <p className="text-sm text-sol-muted">
                  Kopier venligst disse DNS-records til din domæne-udbyder (fx Simply.com eller GoDaddy).
                </p>
                <div className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm">
                  <p className="font-bold mb-2 text-sol-ink">A Record (Anbefalet)</p>
                  <div className="grid grid-cols-3 gap-2 text-sol-muted">
                    <div>Type: A</div>
                    <div>Name: @</div>
                    <div>Value: 76.76.21.21</div>
                  </div>
                </div>
                {status.verification && status.verification.map((v, i) => (
                  <div key={i} className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm mt-2">
                    <p className="font-bold mb-2 text-sol-ink">Verification Record ({v.type})</p>
                    <div className="grid grid-cols-3 gap-2 text-sol-muted">
                      <div>Type: {v.type}</div>
                      <div>Name: {v.domain}</div>
                      <div className="break-all">Value: {v.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <AdminButton
              onClick={() => handleCheckStatus(domain)}
              disabled={loading}
              variant="secondary"
              className="w-full"
            >
              Opdater Status
            </AdminButton>
          </div>
        )}
        </AdminCard>
      )}

      {activeTab === "email" && (
        <AdminCard bodyClassName="space-y-6">
          <div>
            <label className="block text-sm font-bold text-sol-ink mb-2">Vælg E-mail Udbyder</label>
            <div className="flex gap-4">
              <button 
                onClick={() => setEmailProvider("google")}
                className={`flex-1 py-3 rounded-lg border font-bold transition-all ${emailProvider === "google" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-sol-ink/10 text-sol-ink hover:bg-sol-ink/5"}`}
              >
                Google Workspace
              </button>
              <button 
                onClick={() => setEmailProvider("microsoft")}
                className={`flex-1 py-3 rounded-lg border font-bold transition-all ${emailProvider === "microsoft" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-sol-ink/10 text-sol-ink hover:bg-sol-ink/5"}`}
              >
                Microsoft 365
              </button>
              <button 
                onClick={() => setEmailProvider("resend")}
                className={`flex-1 py-3 rounded-lg border font-bold transition-all ${emailProvider === "resend" ? "border-black bg-gray-50 text-black" : "border-sol-ink/10 text-sol-ink hover:bg-sol-ink/5"}`}
              >
                Resend (API)
              </button>
            </div>
          </div>

          <div className="bg-sol-cream p-6 rounded-lg space-y-4">
            <h2 className="text-lg font-bold text-sol-ink">DNS Records (Kopier til din udbyder)</h2>
            <p className="text-sm text-sol-muted mb-4">Tilføj følgende records i DNS-indstillingerne for dit domæne, der hvor du har købt det (fx Simply.com).</p>
            
            {emailProvider === "google" && (
              <div className="space-y-2">
                <div className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm">
                  <p className="font-bold mb-2 text-sol-ink">MX Record</p>
                  <div className="grid grid-cols-4 gap-2 text-sol-muted">
                    <div className="font-semibold">Type</div><div className="font-semibold">Name</div><div className="font-semibold">Priority</div><div className="font-semibold">Value</div>
                    <div>MX</div><div>@</div><div>1</div><div>smtp.google.com</div>
                  </div>
                </div>
                <div className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm">
                  <p className="font-bold mb-2 text-sol-ink">TXT Record (SPF)</p>
                  <div className="grid grid-cols-3 gap-2 text-sol-muted">
                    <div className="font-semibold">Type</div><div className="font-semibold">Name</div><div className="font-semibold">Value</div>
                    <div>TXT</div><div>@</div><div>v=spf1 include:_spf.google.com ~all</div>
                  </div>
                </div>
              </div>
            )}

            {emailProvider === "microsoft" && (
              <div className="space-y-2">
                <div className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm">
                  <p className="font-bold mb-2 text-sol-ink">MX Record</p>
                  <div className="grid grid-cols-4 gap-2 text-sol-muted">
                    <div className="font-semibold">Type</div><div className="font-semibold">Name</div><div className="font-semibold">Priority</div><div className="font-semibold">Value</div>
                    <div>MX</div><div>@</div><div>0</div><div>ditdomaene-dk.mail.protection.outlook.com</div>
                  </div>
                </div>
                <div className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm">
                  <p className="font-bold mb-2 text-sol-ink">TXT Record (SPF)</p>
                  <div className="grid grid-cols-3 gap-2 text-sol-muted">
                    <div className="font-semibold">Type</div><div className="font-semibold">Name</div><div className="font-semibold">Value</div>
                    <div>TXT</div><div>@</div><div>v=spf1 include:spf.protection.outlook.com -all</div>
                  </div>
                </div>
              </div>
            )}

            {emailProvider === "resend" && (
              <div className="space-y-2">
                <div className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm">
                  <p className="font-bold mb-2 text-sol-ink">TXT Record (SPF)</p>
                  <div className="grid grid-cols-3 gap-2 text-sol-muted">
                    <div className="font-semibold">Type</div><div className="font-semibold">Name</div><div className="font-semibold">Value</div>
                    <div>TXT</div><div>bounces</div><div>v=spf1 include:sendgrid.net ~all</div>
                  </div>
                </div>
                <div className="bg-white border border-sol-ink/10 rounded-lg p-4 font-mono text-sm">
                  <p className="font-bold mb-2 text-sol-ink">TXT Record (DKIM)</p>
                  <div className="grid grid-cols-3 gap-2 text-sol-muted">
                    <div className="font-semibold">Type</div><div className="font-semibold">Name</div><div className="font-semibold">Value</div>
                    <div>TXT</div><div>resend._domainkey</div><div>p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBg...</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </AdminCard>
      )}
    </div>
  );
}
