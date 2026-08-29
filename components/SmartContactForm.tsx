"use client";

import { useState } from "react";
import { useFeature } from "@/lib/feature-flags/context";
import { WEBMCP_FORM_TOOL_NAMES } from "@/lib/model-context";
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
  /** "da" | "en" — drives all built-in copy. Pass from the [locale] page. */
  locale?: string;
  /** brand.features.contactAttachments — viser billede-upload på formularen. */
  attachmentsEnabled?: boolean;
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
    thinkingSpinner: "animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--cw-brand)] mb-4",
    thinkingText: "font-bold text-white",
    heading: "text-2xl font-black text-white",
    description: "text-white/60 mt-2",
    errorBox: "mb-6 bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-lg text-sm font-medium",
    aiAnswerBox: "bg-[var(--cw-brand-on-dark)]/10 border border-[var(--cw-brand-on-dark)]/20 rounded-xl p-5",
    aiAnswerHeading: "text-sm font-black uppercase tracking-wider text-[var(--cw-brand-on-dark)] mb-2",
    aiAnswerText: "text-white whitespace-pre-wrap",
    followUpBox: "bg-[#111] p-4 rounded-xl border border-white/5 text-center",
    followUpText: "text-sm font-bold text-white mb-4",
    ghostBtn: "text-white hover:bg-white/10",
    primaryBtn: "bg-white !text-black hover:bg-white/90",
    label: "block text-sm font-bold text-white mb-1",
    input: "w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-[var(--cw-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--cw-brand)] placeholder:text-white/30",
    select: "w-full rounded-md border border-white/20 px-3 py-2.5 text-white focus:border-[var(--cw-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--cw-brand)] bg-[#111]",
    textarea: "w-full rounded-md border border-white/20 px-3 py-2.5 text-white bg-transparent focus:border-[var(--cw-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--cw-brand)] placeholder:text-white/30",
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
  services,
  defaultService,
  title,
  description,
  mode = "ecommerce",
  locale = "da",
  attachmentsEnabled = false,
}: Props) {
  const t = THEMES[mode];
  const en = locale === "en";
  const tr = en
    ? {
        services: ["Customer service", "Returns", "Product question"],
        title: "Contact us",
        description:
          "Write to us below. Our AI tries to answer you right away — otherwise we pass it on to our support team.",
        readingMsg: "AI is reading your message...",
        sendingMsg: "Sending to customer service...",
        aiAnswers: "Our AI assistant answers:",
        gotAnswer: "Did this answer your question?",
        yesThanks: "Yes, thanks for the help",
        noSendSupport: "No, send to support",
        serviceQ: "What is it about?",
        fullName: "Full name",
        email: "E-mail",
        phone: "Phone",
        message: "Message",
        messagePlaceholder: "Describe your issue here...",
        askSupport: "Ask customer service",
        tooShort: "Please write a little more so we can help you best.",
        somethingWrong: "Something went wrong. Please try again.",
        noConnection: "Could not connect to the server",
        successHeading: "Thank you for your message!",
        successBody:
          "We have received your inquiry and will get back to you as soon as possible (usually within 24 hours).",
      }
    : {
        services: ["Kundeservice", "Returnering", "Produktspørgsmål"],
        title: "Kontakt Os",
        description:
          "Skriv til os herunder. Vores AI forsøger at svare dig med det samme - ellers sender vi det videre til vores support team.",
        readingMsg: "AI læser din besked...",
        sendingMsg: "Sender til kundeservice...",
        aiAnswers: "Vores AI Assistent svarer:",
        gotAnswer: "Fik du svar på dit spørgsmål?",
        yesThanks: "Ja, tak for hjælpen",
        noSendSupport: "Nej, send til support",
        serviceQ: "Hvad drejer det sig om?",
        fullName: "Fulde navn",
        email: "E-mail",
        phone: "Telefon",
        message: "Besked",
        messagePlaceholder: "Beskriv dit problem her...",
        askSupport: "Spørg kundeservice",
        tooShort: "Skriv venligst lidt mere, så vi kan hjælpe dig bedst muligt.",
        somethingWrong: "Noget gik galt. Prøv igen.",
        noConnection: "Kunne ikke oprette forbindelse til serveren",
        successHeading: "Tak for din besked!",
        successBody:
          "Vi har modtaget din henvendelse og vender tilbage hurtigst muligt (oftest indenfor 24 timer).",
      };
  const svc = services ?? tr.services;
  const ttl = title ?? tr.title;
  const desc = description ?? tr.description;
  // WebMCP declarative form API (types/webmcp-dom.d.ts). NO autosubmit:
  // kontakt er high-impact kommunikation — mennesket bekræfter.
  const webMcp = useFeature("webMcp");
  const [triageStatus, setTriageStatus] = useState<'idle' | 'analyzing' | 'answered' | 'escalating' | 'success'>('idle');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    // svc[0] is undefined when services={[]} — keep the field a string.
    serviceType: defaultService ?? svc[0] ?? "",
    message: ""
  });
  const [files, setFiles] = useState<File[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    const native = e.nativeEvent as SubmitEvent;
    const agentInvoked =
      native.agentInvoked === true && typeof native.respondWith === "function";
    // FormData-first (se SearchBox): felterne HAR name-attributter, så en
    // agent-udfyldt DOM læses direkte; menneskelige submits får identiske
    // værdier (controlled inputs holder DOM og state i sync).
    const domData = new FormData(e.currentTarget as HTMLFormElement);
    const submitted = {
      ...formData,
      ...Object.fromEntries(
        ["serviceType", "name", "email", "phone", "message"]
          .map((k) => [k, domData.get(k)] as const)
          .filter((kv): kv is [string, string] => typeof kv[1] === "string"),
      ),
    };
    // Sync controlled state med de native værdier — retry-udkastet og
    // "send til support"-knappen (som læser formData) skal se agentens
    // indhold, ikke tom start-state.
    setFormData(submitted);
    if (submitted.message.trim().length < 10) {
      setError(tr.tooShort);
      if (agentInvoked) native.respondWith!(Promise.resolve({ error: "Message too short — write at least 10 characters." }));
      return;
    }
    setError(null);
    setTriageStatus('analyzing');
    setAiAnswer(null);

    // Triage-udfaldet som ét promise så en agent-invokeret submit får svaret
    // (AI-svar eller eskaleret-til-menneske) via respondWith — mennesket ser
    // præcis samme state-flow som før.
    const work = (async () => {
      try {
        const response = await fetch("/api/support/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: submitted.message }),
        });
        const data = await response.json();
        if (data.canAnswer && data.answer) {
          setAiAnswer(data.answer);
          setTriageStatus('answered');
          return { status: "answered", answer: data.answer };
        }
        const escalated = await submitToHuman(submitted);
        return escalated
          ? { status: "escalated_to_human" }
          : { error: "Sending to support failed — nothing was submitted. The user can retry from the page." };
      } catch {
        setError(tr.noConnection);
        setTriageStatus('idle');
        return { error: "Sending failed — the store had a temporary error." };
      }
    })();
    if (agentInvoked) native.respondWith!(work);
    await work;
  };

  // Returnerer om eskaleringen faktisk LANDEDE — knap-callerne ignorerer
  // værdien (uændret adfærd); agent-stien i handleTriage må ikke melde
  // "escalated_to_human" på et upload-/API-fejlslag der aldrig sendte noget.
  const submitToHuman = async (
    payload: typeof formData = formData,
  ): Promise<boolean> => {
    setTriageStatus('escalating');
    setError(null);
    try {
      // Upload evt. vedhæftede billeder først → saml offentlige URL'er.
      const attachmentUrls: string[] = [];
      if (attachmentsEnabled && files.length > 0) {
        for (const file of files.slice(0, 3)) {
          const fd = new FormData();
          fd.append("file", file);
          const up = await fetch("/api/contact/upload", {
            method: "POST",
            body: fd,
          });
          const upData = await up.json().catch(() => ({}));
          if (!up.ok || !upData.url) {
            setError(upData.error || tr.somethingWrong);
            setTriageStatus('idle');
            return false;
          }
          attachmentUrls.push(upData.url);
        }
      }

      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          // An empty `services` list means this site has no service to pick —
          // send nothing rather than a placeholder.
          ...(svc.length ? { projectType: payload.serviceType } : {}),
          ...(attachmentUrls.length ? { attachmentUrls } : {}),
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setTriageStatus('success');
        return true;
      }
      setError(data.error || tr.somethingWrong);
      setTriageStatus('idle');
      return false;
    } catch {
      setError(tr.noConnection);
      setTriageStatus('idle');
      return false;
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
        <h3 className={t.successHeading}>{tr.successHeading}</h3>
        <p className={t.successBody}>{tr.successBody}</p>
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
            {triageStatus === 'analyzing' ? tr.readingMsg : tr.sendingMsg}
          </p>
        </div>
      )}

      <div className="mb-6">
        <h2 className={t.heading}>{ttl}</h2>
        <p className={t.description}>{desc}</p>
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
            <h3 className={t.aiAnswerHeading}>{tr.aiAnswers}</h3>
            <p className={t.aiAnswerText}>{aiAnswer}</p>
          </div>

          <div className={t.followUpBox}>
            <p className={t.followUpText}>{tr.gotAnswer}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => setTriageStatus('idle')} variant="ghost" className={t.ghostBtn}>{tr.yesThanks}</Button>
              <Button onClick={() => submitToHuman()} className={t.primaryBtn}>{tr.noSendSupport}</Button>
            </div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleTriage}
          className="space-y-4"
          {...(webMcp
            ? {
                toolname: WEBMCP_FORM_TOOL_NAMES.contactStore,
                tooldescription:
                  "Send a message to this store's support. The message is triaged by AI first (instant answer when possible) and otherwise forwarded to a human. High-impact communication — asks the user to confirm before submitting.",
              }
            : {})}
        >
          {/* `services={[]}` opts a product/SaaS site out of the service
              picker entirely — the field is agency vocabulary. Passing nothing
              keeps the shipped defaults, so this is byte-identical by default. */}
          {svc.length > 0 && (
            <div>
              <label htmlFor="serviceType" className={t.label}>{tr.serviceQ}</label>
              <select
                id="serviceType"
                name="serviceType"
                value={formData.serviceType}
                onChange={handleChange}
                className={t.select}
                {...(webMcp
                  ? { toolparamdescription: "Which service the inquiry is about." }
                  : {})}
              >
                {svc.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="name" className={t.label}>{tr.fullName}</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className={t.input}
              {...(webMcp ? { toolparamdescription: "The sender's full name." } : {})}
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
                {...(webMcp
                  ? { toolparamdescription: "Reply-to email address." }
                  : {})}
              />
            </div>
            <div>
              <label htmlFor="phone" className={t.label}>{tr.phone}</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className={t.input}
                {...(webMcp
                  ? {
                      toolparamdescription:
                        "Optional phone number for a call-back.",
                    }
                  : {})}
              />
            </div>
          </div>

          <div>
            <label htmlFor="message" className={t.label}>{tr.message}</label>
            <textarea
              id="message"
              name="message"
              rows={4}
              required
              value={formData.message}
              onChange={handleChange}
              placeholder={tr.messagePlaceholder}
              className={t.textarea}
              {...(webMcp
                ? {
                    toolparamdescription:
                      "The question or request, at least 10 characters.",
                  }
                : {})}
            />
          </div>

          {attachmentsEnabled && (
            <div>
              <label htmlFor="attachments" className={t.label}>
                {en
                  ? "Attach images (optional, max 3)"
                  : "Vedhæft billeder (valgfrit, maks 3)"}
              </label>
              <input
                id="attachments"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) =>
                  setFiles(Array.from(e.target.files ?? []).slice(0, 3))
                }
                className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:px-3 file:py-2 file:text-sm file:font-bold"
              />
              {files.length > 0 && (
                <p className="mt-1 text-xs opacity-70">
                  {files.length} {en ? "file(s) selected" : "fil(er) valgt"}
                </p>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full justify-center"
          >{tr.askSupport}</Button>
        </form>
      )}
    </div>
  );
}
