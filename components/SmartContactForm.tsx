"use client";

import { useState } from "react";
import { Button } from "./Button";

type Mode = "saas" | "ecommerce";

type Props = {
  services?: string[];
  defaultService?: string;
  title?: string;
  description?: string;
  /**
   * Visual mode:
   *   "saas"      → dark bg + indigo accent (Teloz / agency-style)
   *   "ecommerce" → light bg with dark-mode variants + sol-accent (default for shops)
   */
  mode?: Mode;
};

const THEMES: Record<Mode, {
  wrapper: string;
  successCard: string;
  successHeading: string;
  successBody: string;
  thinkingOverlay: string;
  thinkingSpinner: string;
  thinkingText: string;
  heading: string;
  description: string;
  errorBox: string;
  aiAnswerBox: string;
  aiAnswerHeading: string;
  aiAnswerText: string;
  followUpBox: string;
  followUpText: string;
  ghostBtn: string;
  primaryBtn: string;
  label: string;
  input: string;
  select: string;
  textarea: string;
}> = {
  saas: {
    wrapper: "bg-[#0A0A0A]/80 backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-white/10 shadow-xl relative overflow-hidden",
    successCard: "bg-[#111] rounded-2xl p-8 border border-white/10 text-center",
    successHeading: "text-2xl font-black text-white mb-2",
    successBody: "text-white/60",
    thinkingOverlay: "absolute inset-0 z-10 bg-[#0A0A0A]/80 backdrop-blur-md flex flex-col items-center justify-center",
    thinkingSpinner: "animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4",
    thinkingText: "font-bold text-white",
    heading: "text-2xl font-black text-white",
    description: "text-white/60 mt-2",
    errorBox: "mb-6 bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-lg text-sm font-medium",
    aiAnswerBox: "bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5",
    aiAnswerHeading: "text-sm font-black uppercase tracking-wider text-indigo-400 mb-2",
    aiAnswerText: "text-white whitespace-pre-wrap",
    followUpBox: "bg-[#111] p-4 rounded-xl border border-white/5 text-center",
    followUpText: "text-sm font-bold text-white mb-4",
    ghostBtn: "text-white hover:bg-white/10",
    primaryBtn: "bg-white !text-black hover:bg-white/90",
    label: "block text-sm font-bold text-white mb-1",
    input: "w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-white/30",
    select: "w-full rounded-md border border-white/20 px-3 py-2.5 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-[#111]",
    textarea: "w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-white/30",
  },
  ecommerce: {
    wrapper: "bg-white dark:bg-sol-sand rounded-2xl p-6 sm:p-8 border border-sol-ink/10 dark:border-white/10 shadow-sm relative overflow-hidden",
    successCard: "bg-white dark:bg-sol-sand rounded-2xl p-8 border border-sol-ink/10 dark:border-white/10 text-center",
    successHeading: "text-2xl font-black text-sol-ink dark:text-white mb-2",
    successBody: "text-sol-muted dark:text-white/60",
    thinkingOverlay: "absolute inset-0 z-10 bg-white/80 dark:bg-sol-ink/80 backdrop-blur-md flex flex-col items-center justify-center",
    thinkingSpinner: "animate-spin rounded-full h-12 w-12 border-b-2 border-sol-accent mb-4",
    thinkingText: "font-bold text-sol-ink dark:text-white",
    heading: "text-2xl font-black text-sol-ink dark:text-white",
    description: "text-sol-muted dark:text-white/60 mt-2",
    errorBox: "mb-6 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 p-4 rounded-lg text-sm font-medium",
    aiAnswerBox: "bg-sol-accent/10 border border-sol-accent/20 rounded-xl p-5",
    aiAnswerHeading: "text-sm font-black uppercase tracking-wider text-sol-accent mb-2",
    aiAnswerText: "text-sol-ink dark:text-white whitespace-pre-wrap",
    followUpBox: "bg-sol-cream dark:bg-sol-sand p-4 rounded-xl border border-sol-ink/5 dark:border-white/5 text-center",
    followUpText: "text-sm font-bold text-sol-ink dark:text-white mb-4",
    ghostBtn: "text-sol-ink dark:text-white hover:bg-sol-ink/5 dark:hover:bg-white/10",
    primaryBtn: "bg-sol-accent text-white hover:bg-sol-accent/90",
    label: "block text-sm font-bold text-sol-ink dark:text-white mb-1",
    input: "w-full rounded-md border border-sol-ink/20 dark:border-white/20 px-3 py-2.5 text-sol-ink dark:text-white bg-white dark:bg-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent placeholder:text-sol-muted/70 dark:placeholder:text-white/30",
    select: "w-full rounded-md border border-sol-ink/20 dark:border-white/20 px-3 py-2.5 text-sol-ink dark:text-white focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent bg-white dark:bg-sol-ink",
    textarea: "w-full rounded-md border border-sol-ink/20 dark:border-white/20 px-3 py-2.5 text-sol-ink dark:text-white bg-white dark:bg-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent placeholder:text-sol-muted/70 dark:placeholder:text-white/30",
  },
};

export default function SmartContactForm({
  services = ["Kundeservice", "Returnering", "Produktspørgsmål"],
  defaultService = "Kundeservice",
  title = "Kontakt Os",
  description = "Skriv til os herunder. Vores AI forsøger at svare dig med det samme - ellers sender vi det videre til vores support team.",
  mode = "ecommerce",
}: Props) {
  const t = THEMES[mode];
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
    setAiAnswer(null);

    try {
      const response = await fetch("/api/support/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: formData.message }),
      });
      const data = await response.json();
      if (data.canAnswer && data.answer) {
        setAiAnswer(data.answer);
        setTriageStatus('answered');
      } else {
        await submitToHuman();
      }
    } catch {
      setError("Kunne ikke oprette forbindelse til serveren");
      setTriageStatus('idle');
    }
  };

  const submitToHuman = async () => {
    setTriageStatus('escalating');
    setError(null);
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          projectType: formData.serviceType,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setTriageStatus('success');
      } else {
        setError(data.error || "Noget gik galt. Prøv igen.");
        setTriageStatus('idle');
      }
    } catch {
      setError("Kunne ikke oprette forbindelse til serveren");
      setTriageStatus('idle');
    }
  };

  if (triageStatus === 'success') {
    return (
      <div className={t.successCard}>
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className={t.successHeading}>Tak for din besked!</h3>
        <p className={t.successBody}>Vi har modtaget din henvendelse og vender tilbage hurtigst muligt (oftest indenfor 24 timer).</p>
      </div>
    );
  }

  return (
    <div className={t.wrapper}>

      {/* "Tænker" overlay */}
      {(triageStatus === 'analyzing' || triageStatus === 'escalating') && (
        <div className={t.thinkingOverlay}>
          <div className={t.thinkingSpinner}></div>
          <p className={t.thinkingText}>
            {triageStatus === 'analyzing' ? 'AI læser din besked...' : 'Sender til kundeservice...'}
          </p>
        </div>
      )}

      <div className="mb-6">
        <h2 className={t.heading}>{title}</h2>
        <p className={t.description}>{description}</p>
      </div>

      {error && (
        <div className={t.errorBox}>
          {error}
        </div>
      )}

      {/* AI Answer view */}
      {triageStatus === 'answered' ? (
        <div className="space-y-6">
          <div className={t.aiAnswerBox}>
            <h3 className={t.aiAnswerHeading}>Vores AI Assistent svarer:</h3>
            <p className={t.aiAnswerText}>{aiAnswer}</p>
          </div>

          <div className={t.followUpBox}>
            <p className={t.followUpText}>Fik du svar på dit spørgsmål?</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => setTriageStatus('idle')} variant="ghost" className={t.ghostBtn}>
                Ja, tak for hjælpen
              </Button>
              <Button onClick={submitToHuman} className={t.primaryBtn}>
                Nej, send til support
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleTriage} className="space-y-4">
          <div>
            <label htmlFor="serviceType" className={t.label}>
              Hvad drejer det sig om?
            </label>
            <select
              id="serviceType"
              name="serviceType"
              value={formData.serviceType}
              onChange={handleChange}
              className={t.select}
            >
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="name" className={t.label}>
              Fulde navn
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className={t.input}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className={t.label}>
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                className={t.input}
              />
            </div>
            <div>
              <label htmlFor="phone" className={t.label}>
                Telefon
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className={t.input}
              />
            </div>
          </div>

          <div>
            <label htmlFor="message" className={t.label}>
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
              className={t.textarea}
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
