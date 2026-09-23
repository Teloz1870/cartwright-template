import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { displayFont } from "@/components/surfaces/DesignSurface";
import { Check, Zap, Code, Bot } from "lucide-react";
import { pageOg } from "@/lib/og";

const PRISER_DESCRIPTION = "Fra strategisk AI-rådgivning til lynhurtige custom platforme.";

export const metadata = {
  title: "Priser & Ydelser | Cartwright",
  description: PRISER_DESCRIPTION,
  ...pageOg("Priser & Ydelser", PRISER_DESCRIPTION),
};

/**
 * Pricing-siden er agency/SaaS-konsulent-rater. Hardcoded Teloz-branding
 * + dark-mode design — kun relevant for Teloz-fork. Gate bag isSaas så
 * ecommerce-mode shops returnerer 404 i stedet for at vise Teloz-priser
 * på deres egen shop.
 *
 * Mixer 2.0 Phase 4 — designSurfaces: når flaget er on re-toner siden til
 * sol-tokens (palette + display-typografi) i stedet for det hardcodede sorte
 * Teloz-udtryk. Flag OFF (default) → hver klasse evaluerer til den eksakte
 * legacy-streng → byte-identisk.
 */
export default async function PricingPage() {
  const isSaas =
    !brand.ecommerceEnabled && brand.industryTemplate === "saas";
  if (!isSaas) notFound();

  const ds = Boolean((await getBrand().catch(() => null))?.features.designSurfaces);

  const shellClass = ds
    ? "min-h-screen bg-sol-cream text-sol-ink font-sans pt-32 pb-24 relative overflow-hidden"
    : "min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white pt-32 pb-24 relative overflow-hidden";
  const badgeClass = ds
    ? "mb-8 rounded-full border border-sol-ink/10 bg-sol-sand/60 w-max px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-sol-muted"
    : "mb-8 rounded-full border border-white/10 bg-white/5 w-max px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-white/80 backdrop-blur-md";
  const h1Class = ds
    ? "text-6xl sm:text-8xl font-black text-sol-ink tracking-tighter mb-6 leading-[1.1]"
    : "text-6xl sm:text-8xl font-black text-white tracking-tighter mb-6 leading-[1.1]";
  const accentClass = ds ? "text-sol-accent" : "text-[var(--cw-brand-on-dark)]";
  const heroPClass = ds
    ? "text-lg sm:text-xl text-sol-muted font-light leading-relaxed max-w-2xl"
    : "text-lg sm:text-xl text-white/60 font-light leading-relaxed max-w-2xl";
  const consultingCardClass = ds
    ? "rounded-[2rem] p-10 lg:p-14 border border-sol-ink/10 bg-sol-sand/60 relative transition-all hover:border-sol-ink/20 group"
    : "rounded-[2rem] p-10 lg:p-14 border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl relative transition-all hover:border-white/20 group";
  const cardTitleClass = ds
    ? "text-2xl font-bold text-sol-ink mb-4"
    : "text-2xl font-bold text-white mb-4";
  const cardBodyClass = ds
    ? "text-sol-muted text-sm md:text-base mb-12 max-w-sm leading-relaxed"
    : "text-white/50 text-sm md:text-base mb-12 max-w-sm leading-relaxed";
  const fromLabelClass = ds
    ? "text-xs font-semibold uppercase tracking-widest text-sol-accent mb-3 block"
    : "text-xs font-semibold uppercase tracking-widest text-[var(--cw-brand-on-dark)] mb-3 block";
  const priceClass = ds
    ? "text-5xl font-black text-sol-ink"
    : "text-5xl font-black text-white";
  const priceUnitClass = ds
    ? "text-sol-muted font-medium text-lg"
    : "text-white/60 font-medium text-lg";
  const liTextClass = ds ? "text-sol-ink/80 text-sm" : "text-white/80 text-sm";
  const liStrongTextClass = ds ? "text-sol-ink text-sm" : "text-white/90 text-sm";
  const checkColor = ds ? "text-sol-accent" : "text-[var(--cw-brand-on-dark)]";
  const checkColorAlt = ds ? "text-sol-accent" : "text-emerald-400";
  const consultingCtaClass = ds
    ? "flex h-12 w-full items-center justify-center rounded-xl border border-sol-ink/20 bg-transparent text-sol-ink text-sm font-semibold hover:bg-sol-ink hover:text-sol-cream transition-all"
    : "flex h-12 w-full items-center justify-center rounded-xl border border-white/20 bg-transparent text-white text-sm font-semibold hover:bg-white hover:text-black transition-all";
  const platformCardClass = ds
    ? "rounded-[2rem] p-10 lg:p-14 border border-sol-accent/30 bg-sol-sand/60 relative transition-all hover:border-sol-accent/50 group overflow-hidden mt-8 md:mt-0"
    : "rounded-[2rem] p-10 lg:p-14 border border-emerald-500/30 bg-gradient-to-b from-[#0A1510] to-[#050A08] backdrop-blur-xl relative transition-all hover:border-emerald-500/50 group overflow-hidden mt-8 md:mt-0";
  const platformBadgeClass = ds
    ? "inline-flex items-center gap-2 px-4 py-1.5 bg-sol-accent/10 border border-sol-accent/20 text-sol-accent text-[10px] font-black uppercase tracking-wider rounded-full absolute top-8 right-8"
    : "inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-full absolute top-8 right-8";
  const enterpriseLabelClass = ds
    ? "text-xs font-semibold uppercase tracking-widest text-sol-accent mb-3 block"
    : "text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3 block";
  const platformCtaClass = ds
    ? "flex h-12 w-full items-center justify-center rounded-xl bg-sol-accent text-white text-sm font-semibold hover:bg-sol-accent-deep transition-all focus:ring-4 focus:ring-sol-accent/20"
    : "flex h-12 w-full items-center justify-center rounded-xl bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-all focus:ring-4 focus:ring-emerald-500/20";
  const showcaseClass = ds
    ? "mb-32 rounded-[2.5rem] p-10 lg:p-16 border border-sol-ink/10 bg-sol-sand/60 relative overflow-hidden group shadow-sm"
    : "mb-32 rounded-[2.5rem] p-10 lg:p-16 border border-[var(--cw-brand-on-dark)]/30 bg-gradient-to-r from-[#050510] via-[#0A0A1A] to-[#050510] backdrop-blur-xl relative overflow-hidden group shadow-2xl shadow-[var(--cw-brand-on-dark)]/5";
  const showcaseBadgeClass = ds
    ? "inline-flex items-center gap-2 px-4 py-1.5 bg-sol-accent/10 border border-sol-accent/20 text-sol-accent text-[10px] font-black uppercase tracking-wider rounded-full mb-8"
    : "inline-flex items-center gap-2 px-4 py-1.5 bg-[var(--cw-brand-on-dark)]/10 border border-[var(--cw-brand-on-dark)]/20 text-[var(--cw-brand-on-dark)] text-[10px] font-black uppercase tracking-wider rounded-full mb-8";
  const showcaseTitleClass = ds
    ? "text-3xl font-bold text-sol-ink mb-6"
    : "text-3xl font-bold text-white mb-6";
  const showcaseBodyClass = ds
    ? "text-sol-muted text-base mb-10 leading-relaxed"
    : "text-white/60 text-base mb-10 leading-relaxed";
  const showcaseCtaClass = ds
    ? "inline-flex h-12 px-8 items-center justify-center rounded-xl bg-sol-ink text-sol-cream text-sm font-bold hover:opacity-90 transition-all focus:ring-4 focus:ring-sol-ink/20"
    : "inline-flex h-12 px-8 items-center justify-center rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-all focus:ring-4 focus:ring-white/20";
  const mockFrameClass = ds
    ? "w-full max-w-sm rounded-2xl border border-sol-ink/10 bg-sol-cream shadow-xl overflow-hidden relative"
    : "w-full max-w-sm rounded-2xl border border-white/10 bg-black/50 shadow-2xl overflow-hidden backdrop-blur-md relative";
  const mockBarClass = ds
    ? "h-10 border-b border-sol-ink/10 bg-sol-sand/60 flex items-center px-4 gap-2"
    : "h-10 border-b border-white/10 bg-white/5 flex items-center px-4 gap-2";
  const mockAvatarClass = ds
    ? "w-16 h-16 rounded-full bg-sol-accent/20 flex items-center justify-center mb-6 border border-sol-accent/30"
    : "w-16 h-16 rounded-full bg-[var(--cw-brand-on-dark)]/20 flex items-center justify-center mb-6 border border-[var(--cw-brand-on-dark)]/30";
  const mockLine1Class = ds ? "h-4 w-2/3 bg-sol-ink/20 rounded mb-4" : "h-4 w-2/3 bg-white/20 rounded mb-4";
  const mockLine2Class = ds ? "h-3 w-1/2 bg-sol-ink/10 rounded mb-10" : "h-3 w-1/2 bg-white/10 rounded mb-10";
  const mockCodeClass = ds
    ? "w-full bg-sol-ink rounded-lg border border-sol-ink/10 p-4 font-mono text-sm text-left flex items-center justify-between group/code cursor-pointer hover:border-sol-accent/50 transition-colors"
    : "w-full bg-black/80 rounded-lg border border-white/10 p-4 font-mono text-sm text-left flex items-center justify-between group/code cursor-pointer hover:border-[var(--cw-brand-on-dark)]/50 transition-colors";
  const techNoteClass = ds
    ? "text-sol-muted mb-10 uppercase tracking-widest text-xs font-semibold"
    : "text-white/40 mb-10 uppercase tracking-widest text-xs font-semibold";
  const techDividerClass = ds
    ? "border-t border-sol-ink/10 pt-20 flex flex-col items-center text-center"
    : "border-t border-white/10 pt-20 flex flex-col items-center text-center";
  const monoIconColor = ds ? "black" : "white";

  return (
    <div className={shellClass} {...(ds ? { "data-design-surface": true } : {})}>
      {/* Background Gradients (legacy dark surface only — invisible/incorrect on a light palette) */}
      {!ds && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.10]"
            style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
          />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[var(--cw-brand-on-dark)]/10 blur-[150px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-500/10 blur-[150px] rounded-full" />
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="mb-32 md:w-2/3">
          <div className={badgeClass}>
            Investering i fremtiden
          </div>
          <h1 className={h1Class} {...(ds ? { style: displayFont } : {})}>
            Tech der <span className={accentClass}>skalerer.</span>
          </h1>
          <p className={heroPClass}>
            Uanset om du har brug for strategisk AI-rådgivning til at optimere interne processer, eller skal have bygget en lynhurtig enterprise-platform fra bunden.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-start mb-32">

          {/* Consulting Package */}
          <div className={consultingCardClass}>
            <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-50 transition-opacity">
              <Bot className={`w-12 h-12 ${accentClass}`} />
            </div>

            <h3 className={cardTitleClass}>AI & Forretningsudvikling</h3>
            <p className={cardBodyClass}>Strategisk konsulentarbejde og implementering af AI i jeres eksisterende workflows.</p>

            <div className="mb-12">
              <span className={fromLabelClass}>Fra</span>
              <div className="flex items-baseline gap-2">
                <span className={priceClass}>1.200</span>
                <span className={priceUnitClass}>DKK / time</span>
              </div>
            </div>

            <ul className="space-y-5 mb-14">
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColor} surfaces={ds} />
                <span className={liTextClass}>Identificering af AI use-cases i jeres forretning</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColor} surfaces={ds} />
                <span className={liTextClass}>Automatisering af manuelle processer & workflows</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColor} surfaces={ds} />
                <span className={liTextClass}>Rådgivning om tech-stack og systemarkitektur</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColor} surfaces={ds} />
                <span className={liTextClass}>Løbende sparring og teknisk ledelse</span>
              </li>
            </ul>

            <Link
              href="/contact"
              className={consultingCtaClass}
            >
              Book et uforpligtende møde
            </Link>
          </div>

          {/* Platform Package */}
          <div className={platformCardClass}>
            {/* Highlight glow (legacy dark surface only) */}
            {!ds && (
              <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-emerald-500/20 blur-[80px] rounded-full pointer-events-none"></div>
            )}

            <div className={platformBadgeClass}>
              <Zap className="w-3 h-3" /> Core Product
            </div>

            <h3 className={`${cardTitleClass} mt-2`}>Custom Platform</h3>
            <p className={cardBodyClass}>Vi bygger din næste e-commerce eller SaaS platform fra bunden på Cartwright Engine.</p>

            <div className="mb-12">
              <span className={enterpriseLabelClass}>Enterprise Setup</span>
              <div className="flex items-baseline gap-2">
                <span className={priceUnitClass}>Projektbaseret estimat</span>
              </div>
            </div>

            <ul className="space-y-5 mb-14">
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColorAlt} surfaces={ds} />
                <span className={liStrongTextClass}>Skræddersyet design der bryder med standard skabeloner</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColorAlt} surfaces={ds} />
                <span className={liStrongTextClass}>Lynhurtig Next.js 16 & React 19 Frontend</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColorAlt} surfaces={ds} />
                <span className={liStrongTextClass}>Flersproget (i18nexus) setup inkl. AI auto-oversættelse</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColorAlt} surfaces={ds} />
                <span className={liStrongTextClass}>AI-genereret logo & brand identitet via Setup Wizard</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColorAlt} surfaces={ds} />
                <span className={liStrongTextClass}>Custom API integrationer (ERP, CRM, PIM)</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color={checkColorAlt} surfaces={ds} />
                <span className={liStrongTextClass}>Drift, vedligehold og cloud-hosting på Vercel</span>
              </li>
            </ul>

            <Link
              href="/cases"
              className={platformCtaClass}
            >
              Se hvordan vi byggede Hegnsfabrikken
            </Link>
          </div>

        </div>

        {/* Cartwright Product Showcase */}
        <div className={showcaseClass}>
          {!ds && (
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--cw-brand-on-dark)]/10 blur-[100px] rounded-full pointer-events-none transition-opacity group-hover:bg-[var(--cw-brand-on-dark)]/20" />
          )}

          <div className="relative z-10 flex flex-col md:flex-row gap-16 items-center">
            <div className="md:w-1/2">
              <div className={showcaseBadgeClass}>
                <Code className="w-3 h-3" /> Vores eget produkt
              </div>
              <h3 className={showcaseTitleClass}>Cartwright Commerce</h3>
              <p className={showcaseBodyClass}>
                Udover konsulentarbejde har vi bygget vores eget lynhurtige e-commerce og SaaS system. Cartwright er en komplet Next.js 16 platform med indbygget AI-assistent, i18nexus lokalisering, Stripe Billing og AI Auto-Oversættelse — og platformen er 100% gratis at bruge i sin grundform.
              </p>

              <ul className="space-y-5 mb-10">
                <li className="flex items-center gap-4">
                  <CheckIcon color={checkColor} surfaces={ds} />
                  <span className={liStrongTextClass}>Gratis licens (Open Source) uden skjulte gebyrer</span>
                </li>
                <li className="flex items-center gap-4">
                  <CheckIcon color={checkColor} surfaces={ds} />
                  <span className={liStrongTextClass}>Autonom AI-assistent & Headless CMS med Gemini Flash</span>
                </li>
                <li className="flex items-center gap-4">
                  <CheckIcon color={checkColor} surfaces={ds} />
                  <span className={liStrongTextClass}>Native i18nexus cloud sync & ✨ Auto-Oversæt knap</span>
                </li>
                <li className="flex items-center gap-4">
                  <CheckIcon color={checkColor} surfaces={ds} />
                  <span className={liStrongTextClass}>Dark Mode SaaS & Light Mode Webshop fra én kodebase</span>
                </li>
              </ul>

              <Link
                href="/cases"
                className={showcaseCtaClass}
              >
                Læs mere om Cartwright
              </Link>
            </div>

            <div className="md:w-1/2 w-full flex justify-center">
               <div className={mockFrameClass}>
                 <div className={mockBarClass}>
                   <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                   <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                   <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                 </div>
                 <div className="p-8 flex flex-col items-center text-center">
                    <div className={mockAvatarClass}>
                      <Bot className={`w-8 h-8 ${accentClass}`} />
                    </div>
                    <div className={mockLine1Class} />
                    <div className={mockLine2Class} />

                    <div className={mockCodeClass}>
                       <span className="text-white/70"><span className="text-pink-500">npx</span> create-cartwright</span>
                       <Zap className={`w-4 h-4 ${accentClass} opacity-0 group-hover/code:opacity-100 transition-opacity`} />
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Bottom Tech Stack Note */}
        <div className={techDividerClass}>
          <p className={techNoteClass}>Vi arbejder primært med</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500 items-center">
            <div className="flex items-center gap-3 font-bold text-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative ~24px external CDN tech-stack icon; next/image needs remotePatterns for no benefit */}
              <img src={`https://cdn.simpleicons.org/nextdotjs/${monoIconColor}`} alt="Next.js Logo" loading="lazy" decoding="async" className="h-6 w-6" />
              Next.js
            </div>
            <div className="flex items-center gap-3 font-bold text-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative external CDN icon */}
              <img src="https://cdn.simpleicons.org/react/61DAFB" alt="React Logo" loading="lazy" decoding="async" className="h-6 w-6" />
              React
            </div>
            <div className="flex items-center gap-3 font-bold text-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative external CDN icon */}
              <img src="https://cdn.simpleicons.org/googlegemini/8B5CF6" alt="Google Gemini Logo" loading="lazy" decoding="async" className="h-6 w-6" />
              Google Gemini
            </div>
            <div className="flex items-center gap-3 font-bold text-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative external CDN icon */}
              <img src={`https://cdn.simpleicons.org/vercel/${monoIconColor}`} alt="Vercel Logo" loading="lazy" decoding="async" className="h-6 w-6" />
              Vercel
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ color, surfaces }: { color: string; surfaces?: boolean }) {
  return (
    <div
      className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full ${surfaces ? "bg-sol-ink/5" : "bg-white/5"} flex items-center justify-center ${color}`}
    >
      <Check className="w-3 h-3" strokeWidth={3} />
    </div>
  );
}
