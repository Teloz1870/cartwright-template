"use client";

import { useState, useEffect } from "react";
import { Phone, Voicemail, Settings, Clock, History } from "lucide-react";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminBadge,
  AdminTextarea,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

export default function PhoneDashboard() {
  const [activeTab, setActiveTab] = useState<"logs" | "ivr">("logs");
  const [calls, setCalls] = useState<{ id: number; from: string; status: string; duration: string; time: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [ivrText, setIvrText] = useState("Welcome to Cartwright. Our staff are busy right now, please leave a message.");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch mock logs
    setTimeout(() => {
      setCalls([
        { id: 1, from: "+45 20 30 40 50", status: "missed", duration: "0:00", time: "10 minutes ago" },
        { id: 2, from: "+45 11 22 33 44", status: "completed", duration: "4:23", time: "1 hour ago" },
        { id: 3, from: "Anonymous", status: "voicemail", duration: "0:45", time: "Yesterday" },
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const handleSaveIvr = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ivrText }),
      });
      if (res.ok) {
        alert("IVR text saved!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl p-6 mx-auto">
      <div className="mb-8">
        <AdminPageHeader
          title={
            <span className="flex items-center gap-3">
              <Phone className="text-sol-accent" size={32} />
              Phone.inc Cloud Telefoni
            </span>
          }
          subtitle="Manage your virtual phone number, call history and AI answering machine directly from Cartwright."
          primaryAction={
            <div className="bg-sol-cream px-6 py-3 rounded-xl border border-sol-ink/10 text-center">
              <p className="text-xs font-bold text-sol-muted uppercase tracking-wider mb-1">Active Number</p>
              <p className="text-xl font-black text-sol-ink">+45 70 80 90 00</p>
            </div>
          }
        />
      </div>

      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-6 py-3 font-bold rounded-lg transition-all ${activeTab === "logs" ? "bg-sol-accent text-white" : "bg-sol-cream text-sol-ink border border-sol-ink/10"}`}
        >
          <History size={18} /> Call History
        </button>
        <button
          onClick={() => setActiveTab("ivr")}
          className={`flex items-center gap-2 px-6 py-3 font-bold rounded-lg transition-all ${activeTab === "ivr" ? "bg-sol-accent text-white" : "bg-sol-cream text-sol-ink border border-sol-ink/10"}`}
        >
          <Settings size={18} /> AI Answering Machine (IVR)
        </button>
      </div>

      {activeTab === "logs" && (
        <AdminCard title="Recent Calls" padding="none">
          {loading ? (
            <div className="p-12 text-center text-sol-muted">Loading history from Phone.inc…</div>
          ) : (
            <AdminTable>
              <AdminThead>
                <AdminTr>
                  <AdminTh>From</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Duration</AdminTh>
                  <AdminTh>Time</AdminTh>
                </AdminTr>
              </AdminThead>
              <AdminTbody>
                {calls.map((call) => (
                  <AdminTr key={call.id}>
                    <AdminTd className="font-semibold">{call.from}</AdminTd>
                    <AdminTd>
                      <AdminBadge
                        tone={
                          call.status === "missed"
                            ? "critical"
                            : call.status === "completed"
                              ? "success"
                              : "warning"
                        }
                      >
                        <span className="flex items-center gap-1">
                          {call.status === "missed" ? "Missed" : call.status === "completed" ? "Answered" : <><Voicemail size={14}/> Voicemail</>}
                        </span>
                      </AdminBadge>
                    </AdminTd>
                    <AdminTd className="text-sol-muted font-mono text-sm">{call.duration}</AdminTd>
                    <AdminTd className="text-sol-muted">
                      <span className="flex items-center gap-2">
                        <Clock size={14} /> {call.time}
                      </span>
                    </AdminTd>
                  </AdminTr>
                ))}
              </AdminTbody>
            </AdminTable>
          )}
        </AdminCard>
      )}

      {activeTab === "ivr" && (
        <AdminCard
          title="Text-to-Speech Welcome Greeting"
          description="Write the text that Phone.inc's AI voice will automatically read aloud when customers call outside opening hours."
        >
          <div className="space-y-4">
            <label className="block font-bold text-sol-ink">Greeting Text (English)</label>
            <AdminTextarea
              value={ivrText}
              onChange={(e) => setIvrText(e.target.value)}
              className="h-32"
              placeholder="Hi! You've reached Cartwright..."
            />

            <AdminButton
              onClick={handleSaveIvr}
              disabled={isSaving}
              variant="primary"
            >
              {isSaving ? "Saving to Cloud…" : "Save IVR Settings"}
            </AdminButton>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
