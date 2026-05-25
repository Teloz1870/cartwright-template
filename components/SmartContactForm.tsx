"use client";

import { useState } from "react";
import { Button } from "./Button";

type Props = {
  services?: string[];
  defaultService?: string;
  title?: string;
  description?: string;
};

export default function SmartContactForm({
  services = ["Kundeservice", "Returnering", "Produktspørgsmål"],
  defaultService = "Kundeservice",
  title = "Kontakt Os",
  description = "Skriv til os herunder. Vores AI forsøger at svare dig med det samme - ellers sender vi det videre til vores support team.",
}: Props) {
  const [triageStatus, setTriageStatus] = useState<'idle' | 'analyzing' | 'answered' | 'escalating' | 'success'>('idle');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    serviceType: defaultService,
    message: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.message.trim().length < 10) {
      setError("Skriv venligst lidt mere, så vi kan hjælpe dig bedst muligt.");
      return;
    }
    
    setError(null);
    setTriageStatus('analyzing');

    try {
      const res = await fetch("/api/support/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: formData.message }),
      });

      const result = await res.json();
      
      if (result.canAnswer && result.answer) {
        setAiAnswer(result.answer);
        setTriageStatus('answered');
      } else {
        // AI couldn't answer or escalated immediately
        await submitToHuman();
      }
    } catch (err) {
      await submitToHuman();
    }
  };

  const submitToHuman = async () => {
    setTriageStatus('escalating');
    setError(null);

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await res.json();
      if (result.ok) {
        setTriageStatus('success');
      } else {
        setError(result.error || "Der opstod en fejl.");
        setTriageStatus('idle');
      }
    } catch (err) {
      setError("Kunne ikke oprette forbindelse til serveren");
      setTriageStatus('idle');
    }
  };

  if (triageStatus === 'success') {
    return (
      <div className="bg-[#111] rounded-2xl p-8 border border-white/10 text-center">
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-2xl font-black text-white mb-2">Tak for din besked!</h3>
        <p className="text-white/60">Vi har modtaget din henvendelse og vender tilbage hurtigst muligt (oftest indenfor 24 timer).</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A]/80 backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-white/10 shadow-xl relative overflow-hidden">
      
      {/* "Tænker" overlay */}
      {(triageStatus === 'analyzing' || triageStatus === 'escalating') && (
        <div className="absolute inset-0 z-10 bg-[#0A0A0A]/80 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
          <p className="font-bold text-white">
            {triageStatus === 'analyzing' ? 'AI læser din besked...' : 'Sender til kundeservice...'}
          </p>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <p className="text-white/60 mt-2">{description}</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}

      {/* AI Answer view */}
      {triageStatus === 'answered' ? (
        <div className="space-y-6">
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5">
            <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400 mb-2">Vores AI Assistent svarer:</h3>
            <p className="text-white whitespace-pre-wrap">{aiAnswer}</p>
          </div>
          
          <div className="bg-[#111] p-4 rounded-xl border border-white/5 text-center">
            <p className="text-sm font-bold text-white mb-4">Fik du svar på dit spørgsmål?</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => setTriageStatus('idle')} variant="ghost" className="text-white hover:bg-white/10">
                Ja, tak for hjælpen
              </Button>
              <Button onClick={submitToHuman} className="bg-white !text-black hover:bg-white/90">
                Nej, send til support
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleTriage} className="space-y-4">
          <div>
            <label htmlFor="serviceType" className="block text-sm font-bold text-white mb-1">
              Hvad drejer det sig om?
            </label>
            <select
              id="serviceType"
              name="serviceType"
              value={formData.serviceType}
              onChange={handleChange}
              className="w-full rounded-md border border-white/20 px-3 py-2.5 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-[#111]"
            >
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-bold text-white mb-1">
              Fulde navn
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-white/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-white mb-1">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-white/30"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-bold text-white mb-1">
                Telefon
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-white/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-bold text-white mb-1">
              Besked
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              required
              value={formData.message}
              onChange={handleChange}
              placeholder="Beskriv dit problem her..."
              className="w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-white/30"
            />
          </div>

          <Button
            type="submit"
            className="w-full justify-center"
          >
            Spørg kundeservice
          </Button>
        </form>
      )}
    </div>
  );
}
