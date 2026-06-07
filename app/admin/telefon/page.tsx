"use client";

import { useState, useEffect } from "react";
import { Phone, Voicemail, Settings, Clock, History } from "lucide-react";

export default function PhoneDashboard() {
  const [activeTab, setActiveTab] = useState<"logs" | "ivr">("logs");
  const [calls, setCalls] = useState<{ id: number; from: string; status: string; duration: string; time: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [ivrText, setIvrText] = useState("Velkommen til Cartwright. Vores medarbejdere er optaget, læg venligst en besked.");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch mock logs
    setTimeout(() => {
      setCalls([
        { id: 1, from: "+45 20 30 40 50", status: "missed", duration: "0:00", time: "10 minutter siden" },
        { id: 2, from: "+45 11 22 33 44", status: "completed", duration: "4:23", time: "1 time siden" },
        { id: 3, from: "Anonym", status: "voicemail", duration: "0:45", time: "I går" },
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
        alert("IVR tekst gemt!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl p-6 mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-sol-ink flex items-center gap-3">
            <Phone className="text-sol-accent" size={32} />
            Phone.inc Cloud Telefoni
          </h1>
          <p className="mt-2 text-sol-muted">
            Administrer dit virtuelle telefonnummer, opkaldshistorik og AI-svarer direkte fra Cartwright.
          </p>
        </div>
        <div className="bg-sol-cream px-6 py-3 rounded-xl border border-sol-ink/10 text-center">
          <p className="text-xs font-bold text-sol-muted uppercase tracking-wider mb-1">Aktivt Nummer</p>
          <p className="text-xl font-black text-sol-ink">+45 70 80 90 00</p>
        </div>
      </header>

      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-6 py-3 font-bold rounded-lg transition-all ${activeTab === "logs" ? "bg-sol-accent text-white" : "bg-sol-cream text-sol-ink border border-sol-ink/10"}`}
        >
          <History size={18} /> Opkaldshistorik
        </button>
        <button
          onClick={() => setActiveTab("ivr")}
          className={`flex items-center gap-2 px-6 py-3 font-bold rounded-lg transition-all ${activeTab === "ivr" ? "bg-sol-accent text-white" : "bg-sol-cream text-sol-ink border border-sol-ink/10"}`}
        >
          <Settings size={18} /> AI Telefonsvarer (IVR)
        </button>
      </div>

      {activeTab === "logs" && (
        <div className="bg-sol-sand rounded-xl shadow-sm border border-sol-ink/10 overflow-hidden">
          <div className="p-6 border-b border-sol-ink/10">
            <h2 className="text-lg font-bold text-sol-ink">Seneste Opkald</h2>
          </div>
          {loading ? (
            <div className="p-12 text-center text-sol-muted">Indlæser historik fra Phone.inc...</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-sol-cream/50 text-sm font-bold text-sol-muted">
                  <th className="p-4 border-b border-sol-ink/10">Fra</th>
                  <th className="p-4 border-b border-sol-ink/10">Status</th>
                  <th className="p-4 border-b border-sol-ink/10">Varighed</th>
                  <th className="p-4 border-b border-sol-ink/10">Tidspunkt</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id} className="border-b border-sol-ink/5 hover:bg-sol-cream/30">
                    <td className="p-4 font-semibold text-sol-ink">{call.from}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center w-max gap-1 ${
                        call.status === "missed" ? "bg-red-100 text-red-700" :
                        call.status === "completed" ? "bg-green-100 text-green-700" :
                        "bg-orange-100 text-orange-700"
                      }`}>
                        {call.status === "missed" ? "Ubesvaret" : call.status === "completed" ? "Besvaret" : <><Voicemail size={14}/> Voicemail</>}
                      </span>
                    </td>
                    <td className="p-4 text-sol-muted font-mono text-sm">{call.duration}</td>
                    <td className="p-4 text-sol-muted flex items-center gap-2">
                      <Clock size={14} /> {call.time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "ivr" && (
        <div className="bg-sol-sand rounded-xl shadow-sm border border-sol-ink/10 p-6">
          <h2 className="text-xl font-bold text-sol-ink mb-4">Text-to-Speech Velkomsthilsen</h2>
          <p className="text-sol-muted mb-6">
            Skriv den tekst som Phone.inc&apos;s AI stemme automatisk skal læse op, når kunderne ringer uden for åbningstiden.
          </p>

          <div className="space-y-4">
            <label className="block font-bold text-sol-ink">Hilsenstekst (Dansk)</label>
            <textarea 
              value={ivrText}
              onChange={(e) => setIvrText(e.target.value)}
              className="w-full h-32 rounded-lg border border-sol-ink/15 p-4 focus:ring-2 focus:ring-sol-accent font-medium text-sol-ink"
              placeholder="Hej! Du har ringet til Cartwright..."
            />
            
            <button 
              onClick={handleSaveIvr}
              disabled={isSaving}
              className="bg-sol-accent text-white px-8 py-3 rounded-lg font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
            >
              {isSaving ? "Gemmer i Cloud..." : "Gem IVR Indstillinger"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
