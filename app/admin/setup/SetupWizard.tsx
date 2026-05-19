"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveBrandStep,
  saveAiStep,
  createCategoryStep,
  finishSetup,
  saveThemeStep,
  generateThemeAction,
} from "./actions";
import ImageUpload from "@/components/admin/ImageUpload";
import { INDUSTRY_TEMPLATE_OPTIONS } from "@/industry-templates";

type StepId = "brand" | "theme" | "ai" | "category" | "done";

type Props = {
  initialStoreName: string;
  initialAnnouncement: string;
  initialBrandSlug: string;
};

const STEPS: { id: StepId; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "theme", label: "Tema" },
  { id: "ai", label: "AI & features" },
  { id: "category", label: "Første kategori" },
  { id: "done", label: "Klar" },
];

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

/**
 * Task D: web-baseret 5-trins setup-wizard.
 *
 * State-machine i client (ingen URL-routing pr. trin) — admin kan navigere
 * frem/tilbage uden at miste form-state. Hver trin saver via server-action
 * når man trykker "Næste"; admin kan også "Spring over".
 *
 * Tema-trinnet er guidance-only: vi kan ikke runtime-skifte themes/<slug>.css
 * (build-time-resolved), så vi viser palette + instruktioner. Faktisk
 * theme-skift kræver code-deploy (kopier theme-fil i ny fork).
 */
export default function SetupWizard({
  initialStoreName,
  initialAnnouncement,
  initialBrandSlug,
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
  // P1.4: derive industries dynamisk fra INDUSTRY_TEMPLATE_OPTIONS — drop literal-type
  // så nye industries automatisk dukker op uden code-edit
  const [industryTemplate, setIndustryTemplate] = useState<string>("eyewear");

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

  // AI-step state
  const [anthropicKey, setAnthropicKey] = useState("");

  // Category-step state
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

  function handleSaveBrand() {
    setError(null);
    const fd = new FormData();
    fd.set("storeName", storeName);
    fd.set("announcement", announcement);
    if (tagline) fd.set("tagline", tagline);
    if (domain) fd.set("domain", domain);
    if (emailSupport) fd.set("emailSupport", emailSupport);
    fd.set("industryTemplate", industryTemplate);
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
    fd.set("anthropicApiKey", anthropicKey);
    startTransition(() => {
      void (async () => {
        const result = await saveAiStep(fd);
        if (result.ok) goNext();
        else setError(result.error);
      })();
    });
  }

  function handleCreateCategory() {
    setError(null);
    const fd = new FormData();
    fd.set("name", catName);
    fd.set("slug", catSlug);
    fd.set("heroImage", catHero);
    startTransition(() => {
      void (async () => {
        const result = await createCategoryStep(fd);
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

      <div className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm">
        {step === "brand" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">Brand-identitet</h2>
              <p className="mt-1 text-sm text-sol-muted">
                Hvad hedder din shop? Disse værdier vises i header, footer og
                e-mail-kvitteringer. Du kan altid ændre dem senere i
                /admin/integrations.
              </p>
            </div>
            <div>
              <label htmlFor="storeName" className={labelClass}>
                Butiksnavn
              </label>
              <input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className={inputClass}
                placeholder="Fx Panel Hegn Direkte"
                required
              />
            </div>
            <div>
              <label htmlFor="announcement" className={labelClass}>
                Top-banner besked (valgfri)
              </label>
              <input
                id="announcement"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                className={inputClass}
                placeholder="Fx Fri fragt over 1000 kr"
                maxLength={160}
              />
            </div>
            {/* ULTRAPLAN-lite UL5: udvidede brand-felter — alle valgfri.
                Tomme værdier bevarer brand.config defaults. */}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="tagline" className={labelClass}>
                  Tagline (valgfri)
                </label>
                <input
                  id="tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className={inputClass}
                  placeholder="Fx Galvaniserede hegn til hus og have"
                  maxLength={120}
                />
              </div>
              <div>
                <label htmlFor="domain" className={labelClass}>
                  Domæne (valgfri)
                </label>
                <input
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={inputClass}
                  placeholder="Fx panel-hegn.dk"
                  maxLength={120}
                />
              </div>
              <div>
                <label htmlFor="emailSupport" className={labelClass}>
                  Support-email (valgfri)
                </label>
                <input
                  id="emailSupport"
                  type="email"
                  value={emailSupport}
                  onChange={(e) => setEmailSupport(e.target.value)}
                  className={inputClass}
                  placeholder="kontakt@dit-domæne.dk"
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
                      registreret i industry-templates/index.ts dukker op her uden code-edit */}
                  {INDUSTRY_TEMPLATE_OPTIONS.map(({ slug, label }) => (
                    <option key={slug} value={slug}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-sol-muted">
                  Vælger seed-data ved næste `npm run seed`. Skifter ikke eksisterende data.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === "theme" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">Tema</h2>
              <p className="mt-1 text-sm text-sol-muted">
                Beskriv dit brand så AI'en foreslår en harmonisk 6-farve-palette.
                Du kan også justere hver farve manuelt. Paletten gemmes i DB og
                overrider <code className="rounded bg-sol-cream px-1.5 py-0.5 text-xs">
                  themes/{initialBrandSlug}.css
                </code> uden code-deploy.
              </p>
            </div>

            <div className="rounded-lg border border-sol-accent/30 bg-sol-accent/5 p-3">
              <label htmlFor="brandDescription" className={labelClass}>
                Beskriv dit brand (1 sætning)
              </label>
              <div className="flex gap-2">
                <input
                  id="brandDescription"
                  value={brandDescription}
                  onChange={(e) => setBrandDescription(e.target.value)}
                  className={inputClass}
                  placeholder="Fx 'galvaniserede hegn til hus og have' eller 'håndlavet keramik'"
                />
                <button
                  type="button"
                  onClick={handleGenerateTheme}
                  disabled={themeGenerating || brandDescription.length < 5}
                  className="shrink-0 rounded-lg bg-sol-accent px-3 py-2 text-xs font-black uppercase text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {themeGenerating ? "Genererer…" : "✨ AI"}
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
                  { key: "accent", label: "Accent (CTA, pris)" },
                  { key: "accentDeep", label: "Accent dyb (footer)" },
                  { key: "cream", label: "Cream (page bg)" },
                  { key: "sand", label: "Sand (card bg)" },
                  { key: "ink", label: "Ink (brødtekst)" },
                  { key: "muted", label: "Muted (sek. tekst)" },
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
              <h3 className="mt-1 text-lg font-black">Demo-produkt</h3>
              <p className="mt-1 text-sm" style={{ color: themePalette.muted }}>
                Sådan vil tekst og farver se ud på din shop.
              </p>
              <div
                className="mt-3 inline-block rounded px-3 py-1.5 text-xs font-black text-white"
                style={{ backgroundColor: themePalette.accent }}
              >
                Eksempel-knap
              </div>
              <div
                className="mt-3 rounded p-3"
                style={{ backgroundColor: themePalette.sand }}
              >
                <p className="text-sm">Card-baggrund: {themePalette.sand}</p>
              </div>
            </div>
          </div>
        )}

        {step === "ai" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">AI &amp; features</h2>
              <p className="mt-1 text-sm text-sol-muted">
                AI-magic-knapper (generér kategori-tekst, produkt-beskrivelse,
                MCP-server, storefront-chat) kræver en Anthropic API-key. Spring
                over hvis du vil tilføje den senere.
              </p>
            </div>
            <div>
              <label htmlFor="anthropicApiKey" className={labelClass}>
                Anthropic API-key (valgfri)
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
                Krypteres lokalt før gem. Få en key på{" "}
                <a
                  href="https://console.anthropic.com/"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  console.anthropic.com
                </a>
                .
              </p>
            </div>
          </div>
        )}

        {step === "category" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-sol-ink">Første kategori</h2>
              <p className="mt-1 text-sm text-sol-muted">
                Opret én kategori så du har et sted at lægge dine første produkter.
                Du kan tilføje flere senere i /admin/kategorier.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="catName" className={labelClass}>
                  Navn
                </label>
                <input
                  id="catName"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className={inputClass}
                  placeholder="Fx Panel-hegn"
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
              <label className={labelClass}>Hero-billede (valgfri)</label>
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
            <h2 className="text-2xl font-black text-sol-ink">Du er klar!</h2>
            <p className="text-sm text-sol-muted">
              Tryk Færdiggør for at låse wizard-flowet og gå til dashboardet. Du
              kan altid komme tilbage til denne wizard senere via{" "}
              <code className="text-xs">/admin/setup</code>.
            </p>
            <p className="text-xs text-sol-muted">
              Næste skridt typisk: tilføj dine første produkter i{" "}
              <code className="text-xs">/admin/produkter</code> + verificér payment/
              email-keys i <code className="text-xs">/admin/integrations</code>.
            </p>
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
          ← Tilbage
        </button>

        <div className="flex gap-2">
          {step !== "done" && step !== "brand" && (
            <button
              type="button"
              onClick={goNext}
              disabled={isPending}
              className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-bold text-sol-muted disabled:opacity-40"
            >
              Spring over
            </button>
          )}
          {step === "brand" && (
            <button
              type="button"
              onClick={handleSaveBrand}
              disabled={isPending || !storeName.trim()}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Gemmer…" : "Næste →"}
            </button>
          )}
          {step === "theme" && (
            <button
              type="button"
              onClick={handleSaveTheme}
              disabled={isPending}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Gemmer…" : "Gem & næste →"}
            </button>
          )}
          {step === "ai" && (
            <button
              type="button"
              onClick={handleSaveAi}
              disabled={isPending}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Gemmer…" : "Næste →"}
            </button>
          )}
          {step === "category" && (
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={isPending || !catName.trim() || !catSlug.trim()}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Opretter…" : "Næste →"}
            </button>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isPending}
              className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isPending ? "Færdiggør…" : "Færdiggør ✓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
