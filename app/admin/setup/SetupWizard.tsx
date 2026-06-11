"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  saveBrandStep,
  saveAiStep,
  saveDomainStep,
  createCategoryStep,
  createServiceStep,
  finishSetup,
  saveThemeStep,
  generateThemeAction,
  bootstrapStoreAction,
} from "./actions";
import ImageUpload from "@/components/admin/ImageUpload";
import { INDUSTRY_TEMPLATE_OPTIONS } from "@/industry-templates";
import { DESIGN_OPTIONS, inferDesignFromIndustry } from "@/designs/options";
import { brand } from "@/brand.config";

type StepId = "brand" | "theme" | "ai" | "domain" | "category" | "done";

type Props = {
  initialStoreName: string;
  initialAnnouncement: string;
  initialBrandSlug: string;
  /** Is a Resend key already configured? Drives the email-status line. */
  initialResendConfigured?: boolean;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

/**
 * Task D: web-baseret 5-trins setup-wizard.
 *
 * State-machine i client (ingen URL-routing pr. trin) — admin kan navigere
 * frem/tilbage uden at miste form-state. Hver trin saver via server-action
 * når man trykker "Næste"; admin kan også "Skip".
 *
 * Theme-trinnet er guidance-only: vi kan ikke runtime-skifte themes/<slug>.css
 * (build-time-resolved), så vi viser palette + instruktioner. Faktisk
 * theme-skift kræver code-deploy (kopier theme-fil i ny fork).
 */
export default function SetupWizard({
  initialStoreName,
  initialAnnouncement,
  initialBrandSlug: _initialBrandSlug,
  initialResendConfigured = false,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("brand");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Brand-step state (ULTRAPLAN-lite UL5: nu med tagline/domain/email/industry)
  const [storeName, setStoreName] = useState(initialStoreName);
  const [announcement, setAnnouncement] = useState(initialAnnouncement);
  const [tagline, setTagline] = useState("");
  const [domain, setDomain] = useState("");
  const [emailSupport, setEmailSupport] = useState("");
  const [emailAdmin, setEmailAdmin] = useState("");
  
  // Software 3.0: Magic Init State
  const [magicPrompt, setMagicPrompt] = useState("");
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  // P1.4: derive industries dynamisk fra INDUSTRY_TEMPLATE_OPTIONS — drop literal-type
  // så nye industries automatisk dukker op uden code-edit
  const [industryTemplate, setIndustryTemplate] = useState<string>("eyewear");
  const [vibeTemplate, setVibeTemplate] = useState<"ecommerce" | "saas" | "minimalist">("ecommerce");
  const [ecommerceEnabled, setEcommerceEnabled] = useState(true);
  // v0.7.0: design-pakke valg. Tom string = behold null i DB
  // (= inferDesignFromIndustry resolver i runtime). Default-vis "auto"-option.
  const [designSlug, setDesignSlug] = useState<string>("");

  const STEPS: { id: StepId; label: string }[] = [
    { id: "brand", label: "Business model & Brand" },
    { id: "theme", label: "Theme" },
    { id: "ai", label: "AI & features" },
    { id: "domain", label: "Email & Domain" },
    { id: "category", label: ecommerceEnabled ? "First category" : "First service" },
    { id: "done", label: "Ready" },
  ];

  // Theme-step state (ULTRAPLAN-lite UL6)
  const [brandDescription, setBrandDescription] = useState("");
  const [themePalette, setThemePalette] = useState({
    accent: "#1e3f5a",
    accentDeep: "#0f2438",
    cream: "#f4efe6",
    sand: "#e8e1d3",
    ink: "#1a1a1a",
    muted: "#726d62",
  });
  const [themeRationale, setThemeRationale] = useState<string | null>(null);
  const [themeGenerating, setThemeGenerating] = useState(false);

  // AI-step state (3-way: cloud/local/skip)
  const [aiChoice, setAiChoice] = useState<"cloud" | "local" | "skip">("cloud");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [localAiEndpoint, setLocalAiEndpoint] = useState("http://localhost:11434/v1");
  const [localAiModel, setLocalAiModel] = useState("");
  // Live Ollama-probe state for local-branch
  const [ollamaStatus, setOllamaStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; models: string[] }
    | { kind: "no-models" }
    | { kind: "down"; error: string }
  >({ kind: "idle" });

  // Domain & Phone.inc step state
  const [setupDomain, setSetupDomain] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [fromName, setFromName] = useState(initialStoreName);
  const [resendKey, setResendKey] = useState("");
  const [emailProvider, setEmailProvider] = useState<"google" | "microsoft" | "resend">("google");
  const [phoneWorkspace, setPhoneWorkspace] = useState("");
  const [phoneApi, setPhoneApi] = useState("");

  // Category/Service-step state
  const [catName, setCatName] = useState("");
  const [catSlug, setCatSlug] = useState("");
  const [catHero, setCatHero] = useState("");

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  function goNext() {
    const next = STEPS[stepIdx + 1];
    if (next) setStep(next.id);
  }

  function goPrev() {
    const prev = STEPS[stepIdx - 1];
    if (prev) setStep(prev.id);
  }

  function handleMagicInit() {
    if (!magicPrompt) return;
    setError(null);
    setIsMagicLoading(true);
    startTransition(() => {
      void (async () => {
        const result = await bootstrapStoreAction(magicPrompt);
        setIsMagicLoading(false);
        if (result.ok) {
          router.push("/admin");
          router.refresh();
        } else {
          setError(result.error);
        }
      })();
    });
  }

  function handleSaveBrand() {
    setError(null);
    const fd = new FormData();
    fd.set("storeName", storeName);
    fd.set("announcement", announcement);
    if (tagline) fd.set("tagline", tagline);
    if (domain) fd.set("domain", domain);
    if (emailSupport) fd.set("emailSupport", emailSupport);
    fd.set("announcement", announcement);
    fd.set("tagline", tagline);
    fd.set("industryTemplate", industryTemplate);
    fd.set("designSlug", designSlug);
    fd.set("vibeTemplate", vibeTemplate);
    fd.set("ecommerceEnabled", ecommerceEnabled ? "true" : "false");
    startTransition(() => {
      void (async () => {
        const result = await saveBrandStep(fd);
        if (result.ok) goNext();
        else setError(result.error);
      })();
    });
  }

  async function handleGenerateTheme() {
    setError(null);
    setThemeGenerating(true);
    try {
      const result = await generateThemeAction(brandDescription);
      if (result.ok) {
        setThemePalette({
          accent: result.theme.accent,
          accentDeep: result.theme.accentDeep,
          cream: result.theme.cream,
          sand: result.theme.sand,
          ink: result.theme.ink,
          muted: result.theme.muted,
        });
        setThemeRationale(result.theme.rationale);
      } else {
        setError(result.error);
      }
    } finally {
      setThemeGenerating(false);
    }
  }

  function handleSaveTheme() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await saveThemeStep(themePalette);
        if (result.ok) goNext();
        else setError(result.error);
      })();
    });
  }

  function handleSaveAi() {
    setError(null);
    const fd = new FormData();
    fd.set("aiChoice", aiChoice);
    fd.set("anthropicApiKey", anthropicKey);
    fd.set("googleGeminiApiKey", geminiKey);
    fd.set("localAiEndpoint", localAiEndpoint);
    fd.set("localAiModel", localAiModel);
    startTransition(() => {
      void (async () => {
        const result = await saveAiStep(fd);
        if (result.ok) goNext();
        else setError(result.error);
      })();
    });
  }

  async function probeOllama() {
    setOllamaStatus({ kind: "checking" });
    try {
      const { listOllamaModelsAction } = await import(
        "@/app/admin/integrations/actions"
      );
      const r = await listOllamaModelsAction(localAiEndpoint);
      if (!r.ok) {
        setOllamaStatus({ kind: "down", error: r.error });
        return;
      }
      if (r.models.length === 0) {
        setOllamaStatus({ kind: "no-models" });
        return;
      }
      setOllamaStatus({ kind: "ok", models: r.models.map((m) => m.name) });
      // Auto-vælg første model hvis admin ikke har skrevet noget
      if (!localAiModel) setLocalAiModel(r.models[0].name);
    } catch (err) {
      setOllamaStatus({
        kind: "down",
        error: err instanceof Error ? err.message : "Probe failed",
      });
    }
  }

  function handleSaveDomain() {
    setError(null);
    const fd = new FormData();
    fd.set("domain", setupDomain);
    fd.set("setupEmail", setupEmail);
    fd.set("fromName", fromName);
    fd.set("resendKey", resendKey);
    fd.set("emailProvider", emailProvider);
    fd.set("phoneIncWorkspaceId", phoneWorkspace);
    fd.set("phoneIncApiKey", phoneApi);
    startTransition(() => {
      void (async () => {
        const result = await saveDomainStep(fd);
        if (result.ok) goNext();
        else setError(result.error);
      })();
    });
  }

  function handleCreateCategoryOrService() {
    setError(null);
    const fd = new FormData();
    fd.set(ecommerceEnabled ? "name" : "title", catName);
    fd.set("slug", catSlug);
    fd.set("heroImage", catHero);
    startTransition(() => {
      void (async () => {
        const result = ecommerceEnabled ? await createCategoryStep(fd) : await createServiceStep(fd);
        if (result.ok) goNext();
        else setError(result.error);
      })();
    });
  }

  function handleFinish() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await finishSetup();
        if (result.ok) {
          router.push("/admin");
          router.refresh();
        } else {
          setError(result.error);
        }
      })();
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Step-indicator */}
      <ol className="mb-8 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sol-muted">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full ${
                i <= stepIdx
                  ? "bg-sol-accent text-white"
                  : "bg-sol-ink/10 text-sol-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className={i === stepIdx ? "text-sol-ink" : ""}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="text-sol-ink/20">→</span>}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
        {step === "brand" && (
          <div className="space-y-4">
            {/* Software 3.0: Magic Init Banner */}
            <div className="mb-8 p-6 bg-sol-ink text-white rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">✨</div>
              <h2 className="text-xl font-black mb-2">✨ Magic Init (Software 3.0)</h2>
              <p className="text-sm text-sol-muted mb-4 max-w-lg">
                Want to build the shop manually, or have the AI Consultant generate a complete store (categories, products, brand) in 10 seconds from a single sentence?
              </p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={magicPrompt}
                  onChange={e => setMagicPrompt(e.target.value)}
                  placeholder="E.g. 'A B2B SaaS platform for AI integration for lawyers'"
                  className="flex-1 rounded-lg border-0 bg-white/10 px-4 py-2 text-white placeholder:text-white/30 focus:ring-2 focus:ring-sol-accent"
                />
                <button 
                  type="button"
                  onClick={handleMagicInit}
                  disabled={isMagicLoading || !magicPrompt}
                  className="bg-sol-accent px-6 py-2 rounded-lg font-bold disabled:opacity-50"
                >
                  {isMagicLoading ? "Building shop..." : "Auto-Generate"}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="h-px bg-sol-ink/10 flex-1"></div>
              <span className="text-xs font-bold text-sol-muted uppercase tracking-wider">OR CREATE MANUALLY</span>
              <div className="h-px bg-sol-ink/10 flex-1"></div>
            </div>

            <div>
              <h2 className="text-xl font-black text-sol-ink">Business model</h2>
              <p className="mt-1 text-sm text-sol-muted mb-4">
                What are you building? Choose your primary business model to tailor the platform.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <button
                  type="button"
                  onClick={() => setEcommerceEnabled(true)}
                  className={`p-4 rounded-xl border text-left transition-all ${ecommerceEnabled ? 'border-sol-accent bg-sol-accent/5 ring-2 ring-sol-accent/20' : 'border-sol-ink/10 hover:border-sol-ink/30'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-sol-accent/10 flex items-center justify-center">🛒</div>
                    <h3 className="font-bold text-sol-ink">E-commerce</h3>
                  </div>
                  <p className="text-xs text-sol-muted">Webshop with cart, checkout and product categories.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setEcommerceEnabled(false)}
                  className={`p-4 rounded-xl border text-left transition-all ${!ecommerceEnabled ? 'border-sol-accent bg-sol-accent/5 ring-2 ring-sol-accent/20' : 'border-sol-ink/10 hover:border-sol-ink/30'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-sol-accent/10 flex items-center justify-center">🏢</div>
                    <h3 className="font-bold text-sol-ink">B2B SaaS / Agency</h3>
                  </div>
                  <p className="text-xs text-sol-muted">Dark-mode agency website with service catalog and lead forms.</p>
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-black text-sol-ink">Brand identity</h2>
              <p className="mt-1 text-sm text-sol-muted">
                What is your shop called? These values appear in the header, footer,
                and email receipts. You can always change them later in
                /admin/integrations.
              </p>
            </div>
            <div>
              <label htmlFor="storeName" className={labelClass}>
                Shop name
              </label>
              <input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className={inputClass}
                placeholder="For example Direct Fence Panels"
                required
              />
            </div>
            <div>
              <label htmlFor="announcement" className={labelClass}>
                Top banner message (optional)
              </label>
              <input
                id="announcement"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                className={inputClass}
                placeholder="For example Free shipping over 1000 DKK"
                maxLength={160}
              />
            </div>
            {/* ULTRAPLAN-lite UL5: udvidede brand-felter — alle valgfri.
                Tomme værdier bevarer brand.config defaults. */}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="tagline" className={labelClass}>
                  Tagline (optional)
                </label>
                <input
                  id="tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className={inputClass}
                  placeholder="For example Galvanized fencing for home and garden"
                  maxLength={120}
                />
              </div>
              <div>
                <label htmlFor="domain" className={labelClass}>
                  Domain (optional)
                </label>
                <input
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={inputClass}
                  placeholder="For example fence-panels.com"
                  maxLength={120}
                />
              </div>
              <div>
                <label htmlFor="emailSupport" className={labelClass}>
                  Support email (optional)
                </label>
                <input
                  id="emailSupport"
                  type="email"
                  value={emailSupport}
                  onChange={(e) => setEmailSupport(e.target.value)}
                  className={inputClass}
                  placeholder="contact@your-domain.com"
                />
              </div>
              <div>
                <label htmlFor="emailAdmin" className={labelClass}>
                  Owner email (optional)
                </label>
                <input
                  id="emailAdmin"
                  type="email"
                  value={emailAdmin}
                  onChange={(e) => setEmailAdmin(e.target.value)}
                  className={inputClass}
                  placeholder="you@teloz.dk"
                />
              </div>
              <div>
                <label htmlFor="industryTemplate" className={labelClass}>
                  Industry-template
                </label>
                <select
                  id="industryTemplate"
                  value={industryTemplate}
                  onChange={(e) => setIndustryTemplate(e.target.value)}
                  className={inputClass}
                >
                  {/* P1.4: dynamisk fra INDUSTRY_TEMPLATE_OPTIONS — nye industries
                      registreret i industry-templates/index.ts dukker op her uden code-edit.
                      v0.7.0: industry styrer KUN seed-data (categories/products/pages).
                      Visuel design vælges separat i Design-dropdown nedenfor. */}
                  {INDUSTRY_TEMPLATE_OPTIONS.map(({ slug, label }) => (
                    <option key={slug} value={slug}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-sol-muted">
                  Chooses seed data (products, categories, pages) for the next
                  <code className="mx-1">npm run seed</code>. Does not change
                  existing data. Pick the closest match — visual design is separate.
                </p>
              </div>

              <div>
                <label htmlFor="designSlug" className={labelClass}>
                  Design
                </label>
                <select
                  id="designSlug"
                  value={designSlug}
                  onChange={(e) => setDesignSlug(e.target.value)}
                  className={inputClass}
                >
                  {/* v0.7.0: design-pakker fra designs/index.ts. Filtrér efter
                      ecommerceEnabled så vi ikke viser webshop-design'er for
                      website-mode shops (og vice versa). "Auto"-option lader
                      inferDesignFromIndustry resolve i runtime (backwards-compat). */}
                  <option value="">
                    Auto ({inferDesignFromIndustry(industryTemplate, ecommerceEnabled)})
                  </option>
                  {DESIGN_OPTIONS
                    .filter((d) =>
                      ecommerceEnabled ? d.mode !== "website" : d.mode !== "webshop",
                    )
                    .map(({ slug, name, premium }) => {
                      const isPlus = brand.features.cartwrightPlus;
                      const suffix = premium && !isPlus ? " ⭐ Pro" : "";
                      return (
                        <option key={slug} value={slug}>
                          {name}{suffix}
                        </option>
                      );
                    })}
                </select>
                <p className="mt-1 text-xs text-sol-muted">
                  Visual design — independent of industry. Pick &quot;Auto&quot; to let
                  Cartwright infer from your industry choice.
                  {" "}
                  <span className="opacity-75">⭐ Pro = part of the planned Cartwright Plus tier (honor-system today).</span>
                  {" "}
                  Import more designs via{" "}
                  <code className="mx-1">npx cartwright design import</code>.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === "theme" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">Theme & Design</h2>
              <p className="mt-1 text-sm text-sol-muted">
                Describe your brand so the AI can suggest a balanced 6-color palette.
                You can also adjust each color manually. 
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-bold text-sol-ink">Select Design Template (Vibe Generation)</label>
              <div className="grid grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setVibeTemplate("ecommerce")}
                  className={`border-2 rounded-xl p-4 text-left transition-all ${vibeTemplate === "ecommerce" ? "border-sol-accent bg-sol-accent/5" : "border-sol-ink/10 hover:border-sol-ink/30"}`}
                >
                  <div className="font-bold text-sol-ink mb-1">Modern E-commerce</div>
                  <div className="text-xs text-sol-muted">The classic Golden Stack layout. Images, bento grids, hero video.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setVibeTemplate("saas")}
                  className={`border-2 rounded-xl p-4 text-left transition-all ${vibeTemplate === "saas" ? "border-sol-accent bg-sol-accent/5" : "border-sol-ink/10 hover:border-sol-ink/30"}`}
                >
                  <div className="font-bold text-sol-ink mb-1">B2B SaaS</div>
                  <div className="text-xs text-sol-muted">Dark tech design for agencies, software and B2B sales. Vercel-style.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setVibeTemplate("minimalist")}
                  className={`border-2 rounded-xl p-4 text-left transition-all ${vibeTemplate === "minimalist" ? "border-sol-accent bg-sol-accent/5" : "border-sol-ink/10 hover:border-sol-ink/30"}`}
                >
                  <div className="font-bold text-sol-ink mb-1">Minimalist Portfolio</div>
                  <div className="text-xs text-sol-muted">A very clean, exclusive look for architects and designers.</div>
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-sol-accent/30 bg-sol-accent/5 p-3 mt-6">
              <label htmlFor="brandDescription" className={labelClass}>
                Describe your brand (1 sentence)
              </label>
              <div className="flex gap-2">
                <input
                  id="brandDescription"
                  value={brandDescription}
                  onChange={(e) => setBrandDescription(e.target.value)}
                  className={inputClass}
                  placeholder="For example 'galvanized fencing for home and garden' or 'handmade ceramics'"
                />
                <button
                  type="button"
                  onClick={handleGenerateTheme}
                  disabled={themeGenerating || brandDescription.length < 5}
                  className="shrink-0 rounded-lg bg-sol-accent px-3 py-2 text-xs font-black uppercase text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {themeGenerating ? "Generating..." : "✨ AI"}
                </button>
              </div>
              {themeRationale && (
                <p className="mt-2 text-xs italic text-sol-muted">
                  AI: {themeRationale}
                </p>
              )}
            </div>

            {/* Manual hex-pickers — 6 farver, label + color-input + text-input */}
            <div className="grid gap-2 md:grid-cols-2">
              {(
                [
                  { key: "accent", label: "Accent (CTA, price)" },
                  { key: "accentDeep", label: "Deep accent (footer)" },
                  { key: "cream", label: "Cream (page bg)" },
                  { key: "sand", label: "Sand (card bg)" },
                  { key: "ink", label: "Ink (body text)" },
                  { key: "muted", label: "Muted (secondary text)" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themePalette[key]}
                    onChange={(e) =>
                      setThemePalette((p) => ({ ...p, [key]: e.target.value }))
                    }
                    className="h-9 w-12 cursor-pointer rounded border border-sol-ink/15"
                  />
                  <div className="flex-1">
                    <label className="text-xs font-bold text-sol-muted">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={themePalette[key]}
                      onChange={(e) =>
                        setThemePalette((p) => ({ ...p, [key]: e.target.value }))
                      }
                      className={`${inputClass} font-mono text-xs`}
                      placeholder="#rrggbb"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Live preview-strip */}
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: themePalette.cream,
                color: themePalette.ink,
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: themePalette.muted }}>
                Live preview
              </p>
              <h3 className="mt-1 text-lg font-black">Demo product</h3>
              <p className="mt-1 text-sm" style={{ color: themePalette.muted }}>
                This is how text and colors will look in your shop.
              </p>
              <div
                className="mt-3 inline-block rounded px-3 py-1.5 text-xs font-black text-white"
                style={{ backgroundColor: themePalette.accent }}
              >
                Example button
              </div>
              <div
                className="mt-3 rounded p-3"
                style={{ backgroundColor: themePalette.sand }}
              >
                <p className="text-sm">Card background: {themePalette.sand}</p>
              </div>
            </div>
          </div>
        )}

        {step === "ai" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">AI &amp; features</h2>
              <p className="mt-1 text-sm text-sol-muted">
                Choose how the AI consultant should run. You can always change
                this later in /admin/integrations.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <ChoiceCard
                active={aiChoice === "cloud"}
                onClick={() => setAiChoice("cloud")}
                title="☁️ Cloud AI"
                description="Claude Haiku 4.5. Best quality, runs from day 1, costs per call."
                badge="Recommended for shops"
              />
              <ChoiceCard
                active={aiChoice === "local"}
                onClick={() => {
                  setAiChoice("local");
                  if (ollamaStatus.kind === "idle") void probeOllama();
                }}
                title="💻 Local AI"
                description="Ollama on your own Mac. Free, private, no cloud roundtrip. Requires setup."
                badge="For developers"
              />
              <ChoiceCard
                active={aiChoice === "skip"}
                onClick={() => setAiChoice("skip")}
                title="⏭ Skip"
                description="Configure later via /admin/integrations. AI features won't work until then."
              />
            </div>

            {aiChoice === "cloud" && (
              <div>
                <label htmlFor="anthropicApiKey" className={labelClass}>
                  Anthropic API key (optional — can be added later)
                </label>
                <input
                  id="anthropicApiKey"
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  className={inputClass}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-sol-muted">
                  Powers Vibe Designer, AI Consultant and Tool Calling. Get one at{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    console.anthropic.com
                  </a>
                  .
                </p>
              </div>
            )}

            {aiChoice === "local" && (
              <div className="rounded-lg border border-sol-accent/30 bg-sol-accent/5 p-4 space-y-3">
                <div>
                  <label htmlFor="localAiEndpoint" className={labelClass}>
                    Local Endpoint URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="localAiEndpoint"
                      type="text"
                      value={localAiEndpoint}
                      onChange={(e) => setLocalAiEndpoint(e.target.value)}
                      className={`${inputClass} flex-1`}
                      placeholder="http://localhost:11434/v1"
                    />
                    <button
                      type="button"
                      onClick={() => void probeOllama()}
                      disabled={ollamaStatus.kind === "checking"}
                      className="rounded-full border border-sol-ink/15 bg-white px-3 py-1 text-xs font-black uppercase tracking-wider hover:bg-sol-cream disabled:opacity-50"
                    >
                      {ollamaStatus.kind === "checking" ? "Checking…" : "Check"}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-sol-muted">
                    Remember <code>/v1</code> (Ollama&apos;s OpenAI-compatible endpoint).
                  </p>
                </div>

                {ollamaStatus.kind === "ok" && (
                  <p className="text-xs font-bold text-green-700">
                    ✓ Ollama running — {ollamaStatus.models.length} models found
                  </p>
                )}
                {ollamaStatus.kind === "no-models" && (
                  <p className="text-xs font-bold text-amber-700">
                    ⚠ Ollama is running but has 0 models. Pull one via{" "}
                    <code className="rounded bg-white px-1">ollama pull gemma4:e4b</code>{" "}
                    or via /admin/integrations after setup.
                  </p>
                )}
                {ollamaStatus.kind === "down" && (
                  <p className="text-xs font-bold text-red-700">
                    ✗ Ollama is not running: {ollamaStatus.error}. Install via{" "}
                    <code className="rounded bg-white px-1">brew install ollama</code>{" "}
                    + <code className="rounded bg-white px-1">brew services start ollama</code>.
                  </p>
                )}

                {ollamaStatus.kind === "ok" && (
                  <div>
                    <label htmlFor="localAiModel" className={labelClass}>
                      Model
                    </label>
                    <select
                      id="localAiModel"
                      value={localAiModel}
                      onChange={(e) => setLocalAiModel(e.target.value)}
                      className={inputClass}
                    >
                      {ollamaStatus.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {aiChoice === "skip" && (
              <p className="rounded-lg border border-sol-ink/10 bg-sol-cream/40 p-3 text-xs text-sol-muted">
                OK. AI features are disabled until you configure a provider
                in /admin/integrations. Storefront chat and admin chat return
                a friendly error message until then.
              </p>
            )}

            <div>
              <label htmlFor="geminiApiKey" className={labelClass}>
                Google Gemini API key (optional)
              </label>
              <input
                id="geminiApiKey"
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className={inputClass}
                placeholder="AIzaSy..."
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-sol-muted">
                Always used independently of the provider choice — try-on, SEO copy,
                theme generation, voice-shop. Get one at Google AI Studio.
              </p>
            </div>
          </div>
        )}

        {step === "domain" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">Domain, Email & Telephony</h2>
              <p className="mt-1 text-sm text-sol-muted">
                Choose your domain and main email, turn on real email sending with Resend, and set up Phone.inc for Cloud Telephony. Everything can be changed later. You don&apos;t need email to log in — login is password-based.
              </p>
            </div>
            <div className="rounded-lg border border-sol-accent/30 bg-sol-accent/5 p-4 mb-4">
              <h3 className="font-bold text-sol-ink mb-2">1. Domain & Hosting (Software 3.0)</h3>
              <p className="text-xs text-sol-muted mb-4">
                Domain setup is now automated via Vercel&apos;s REST API. When you finish this entire wizard, you can visit the new <strong>Go-Live Dashboard</strong> under Settings. There you can connect your domain and receive the exact DNS records (A and TXT) with one click!
              </p>
              <div className="mb-4">
                <label htmlFor="setupDomain" className={labelClass}>
                  New Domain (e.g. hegnsfabrikken.dk)
                </label>
                <input
                  id="setupDomain"
                  type="text"
                  value={setupDomain}
                  onChange={(e) => setSetupDomain(e.target.value)}
                  className={inputClass}
                  placeholder="yourdomain.com"
                />
              </div>

              {setupDomain.length > 3 && (
                <div className="pt-4 border-t border-sol-ink/10 space-y-4">
                  <div>
                    <label className={labelClass}>Which main email do you want for the shop?</label>
                    <p className="text-xs text-sol-muted mb-3">Pick a suggestion, or type your own. This becomes your official sender and recipient email.</p>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {["info", "kontakt", "hej", "hello", "support"].map(prefix => {
                        const suggestion = `${prefix}@${setupDomain.replace(/^www\./, '')}`;
                        return (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setSetupEmail(suggestion)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all ${setupEmail === suggestion ? 'bg-sol-accent text-white border-sol-accent' : 'bg-white text-sol-ink border-sol-ink/20 hover:border-sol-ink/50'}`}
                          >
                            {suggestion}
                          </button>
                        );
                      })}
                    </div>
                    
                    <input
                      type="email"
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      className={inputClass}
                      placeholder="Your chosen email"
                    />
                  </div>

                  {setupEmail && (
                    <div>
                      <label className={labelClass}>Where do you want to read your mail? (Inbox provider)</label>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setEmailProvider("google")}
                          className={`py-2 text-sm font-bold rounded-lg border transition-all ${emailProvider === "google" ? 'bg-blue-50 text-blue-700 border-blue-500' : 'bg-white text-sol-ink border-sol-ink/10'}`}
                        >
                          Google Workspace
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmailProvider("microsoft")}
                          className={`py-2 text-sm font-bold rounded-lg border transition-all ${emailProvider === "microsoft" ? 'bg-blue-50 text-blue-800 border-blue-600' : 'bg-white text-sol-ink border-sol-ink/10'}`}
                        >
                          Microsoft 365
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmailProvider("resend")}
                          className={`py-2 text-sm font-bold rounded-lg border transition-all ${emailProvider === "resend" ? 'bg-gray-100 text-black border-black' : 'bg-white text-sol-ink border-sol-ink/10'}`}
                        >
                          Other (Resend)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Email-udsendelse — Resend-key + afsender-navn. Uden en key går
                ordrebekræftelser / magic-link / glemt-adgangskode til
                .mail-previews/ (ingen rigtig levering). emailFrom/emailFromName
                læses runtime af lib/brand.ts getBrand(), så det her er ikke
                dead data. Genbruger setResendKeyAction via saveDomainStep. */}
            <div className="rounded-lg border border-sol-ink/10 bg-white p-4 mb-4">
              <h3 className="font-bold text-sol-ink mb-2">2. Email sending (Resend)</h3>
              <div
                className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                  initialResendConfigured
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {initialResendConfigured
                  ? "✅ Real emails are sent (Resend configured)"
                  : "⚠️ Preview mode — emails are written to .mail-previews/ until a key is set"}
              </div>
              <p className="text-xs text-sol-muted mb-4">
                Enter a{" "}
                <a
                  href="https://resend.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-sol-accent underline"
                >
                  Resend
                </a>{" "}
                API key to send real emails (order confirmations, magic-link,
                forgotten-password). The sender domain must be verified in Resend.
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="fromName" className={labelClass}>
                    Sender name (shown in the inbox)
                  </label>
                  <input
                    id="fromName"
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className={inputClass}
                    placeholder="My Shop"
                  />
                </div>
                <div>
                  <label htmlFor="resendKey" className={labelClass}>
                    Resend API key (optional)
                  </label>
                  <input
                    id="resendKey"
                    type="password"
                    value={resendKey}
                    onChange={(e) => setResendKey(e.target.value)}
                    className={inputClass}
                    placeholder="re_..."
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            {/* Login-model note — fjerner forvirringen om "hvor er mit password?". */}
            <div className="rounded-lg border border-sol-accent/20 bg-sol-accent/5 p-4 mb-4 text-xs leading-5 text-sol-muted">
              <p className="font-bold text-sol-ink mb-1">Your admin login</p>
              <p>
                The admin password was set when the database was seeded — shown once
                in the terminal and saved in <code>.admin-credentials</code> (delete the file
                once you&apos;ve saved it). Change it under{" "}
                <Link href="/admin/konto" className="font-bold text-sol-accent underline">
                  My account
                </Link>
                . Login is password-based, so you don&apos;t need email to get in.
              </p>
            </div>

            <div className="rounded-lg border border-sol-ink/10 bg-white p-4">
              <h3 className="font-bold text-sol-ink mb-2">3. Phone.inc Integration</h3>
              <p className="text-xs text-sol-muted mb-4">
                Integrate your Phone.inc workspace to let customers call directly from your website and have your AI agents answer incoming calls. Enter your Phone.inc keys here.
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="phoneWorkspace" className={labelClass}>
                    Workspace ID
                  </label>
                  <input
                    id="phoneWorkspace"
                    type="text"
                    value={phoneWorkspace}
                    onChange={(e) => setPhoneWorkspace(e.target.value)}
                    className={inputClass}
                    placeholder="wksp_..."
                  />
                </div>
                <div>
                  <label htmlFor="phoneApi" className={labelClass}>
                    API Key
                  </label>
                  <input
                    id="phoneApi"
                    type="password"
                    value={phoneApi}
                    onChange={(e) => setPhoneApi(e.target.value)}
                    className={inputClass}
                    placeholder="pi_sk_..."
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "category" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">{ecommerceEnabled ? "First category" : "First service"}</h2>
              <p className="mt-1 text-sm text-sol-muted">
                {ecommerceEnabled
                  ? "Create your first product category so you have a place to put products. You can add more later in /admin/kategorier."
                  : "Create your first service for your agency catalog. Use the Vibe Sandbox afterwards to design the content."}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="catName" className={labelClass}>
                  Name
                </label>
                <input
                  id="catName"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className={inputClass}
                  placeholder="E.g. Panel-hegn"
                />
              </div>
              <div>
                <label htmlFor="catSlug" className={labelClass}>
                  Slug
                </label>
                <input
                  id="catSlug"
                  value={catSlug}
                  onChange={(e) =>
                    setCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                  className={inputClass}
                  placeholder="panel-hegn"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Hero image (optional)</label>
              <ImageUpload onUploaded={setCatHero} currentUrl={catHero} />
              {catHero && (
                <p className="mt-1 text-xs text-sol-muted truncate">{catHero}</p>
              )}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="text-5xl">🎉</div>
            <h2 className="text-2xl font-black text-sol-ink">You are ready!</h2>
            <p className="text-sm text-sol-muted">
              Press Finish to lock the wizard flow and go to the dashboard. You
              can always return to this wizard later via{" "}
              <code className="text-xs">/admin/setup</code>.
            </p>
            <p className="text-xs text-sol-muted">
              Typical next step: add your first products in{" "}
              <code className="text-xs">/admin/produkter</code> + verify payment/
              email keys in <code className="text-xs">/admin/integrations</code>.
            </p>

            {/* Get it online — the missing GitHub → Vercel hand-off. */}
            <div className="mt-6 rounded-2xl border-2 border-sol-accent/30 bg-sol-accent/5 p-5 text-left">
              <h3 className="text-sm font-black text-sol-ink">🚀 Get your shop online</h3>
              <p className="mt-1 text-xs text-sol-muted">
                Right now your shop runs on your computer. To put it on the internet (free,
                you own it), publish it to GitHub and connect Vercel — auto-deploys on every
                change after that. The guide is written for total beginners, no terminal needed:
              </p>
              <ol className="mt-3 space-y-1 text-xs text-sol-muted">
                <li>1. Create a GitHub account + publish your shop (a private repo).</li>
                <li>2. Import the repo on vercel.com → it builds + gives you a live URL.</li>
                <li>3. Every change you save to GitHub redeploys your shop automatically.</li>
              </ol>
              <a
                href="https://cartwright.app/docs/getting-started/from-code-to-live"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-sol-accent px-4 py-2 text-xs font-black text-white transition hover:bg-sol-accent/90"
              >
                Open the “From code to live” guide →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={stepIdx === 0 || isPending}
          className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-bold text-sol-ink disabled:opacity-40"
        >
          ← Back
        </button>

        <div className="flex gap-2">
          {step !== "done" && step !== "brand" && (
            <button
              type="button"
              onClick={goNext}
              disabled={isPending}
              className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-bold text-sol-muted disabled:opacity-40"
            >
              Skip
            </button>
          )}
          {step === "brand" && (
            <button
              type="button"
              onClick={handleSaveBrand}
              disabled={isPending || !storeName.trim()}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Next →"}
            </button>
          )}
          {step === "theme" && (
            <button
              type="button"
              onClick={handleSaveTheme}
              disabled={isPending}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save & next →"}
            </button>
          )}
          {step === "ai" && (
            <button
              type="button"
              onClick={handleSaveAi}
              disabled={isPending}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Next →"}
            </button>
          )}
          {step === "domain" && (
            <button
              type="button"
              onClick={handleSaveDomain}
              disabled={isPending}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Next →"}
            </button>
          )}
          {step === "category" && (
            <button
              type="button"
              onClick={handleCreateCategoryOrService}
              disabled={isPending || !catName.trim() || !catSlug.trim()}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Next →"}
            </button>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isPending}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Finishing..." : "Finish ✓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  description,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition ${
        active
          ? "border-sol-accent bg-sol-accent/5"
          : "border-sol-ink/10 bg-white hover:border-sol-ink/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-sm font-black ${active ? "text-sol-accent" : "text-sol-ink"}`}
        >
          {title}
        </span>
        {badge && (
          <span className="rounded-full bg-sol-cream px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-sol-muted">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-snug text-sol-muted">{description}</p>
    </button>
  );
}
