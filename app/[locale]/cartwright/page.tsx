import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Server, Zap, Code2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { brand } from "@/brand.config";

export const metadata = {
  title: "Cartwright Engine",
  description: "Build fast, AI-native platforms with Cartwright.",
};

export default function CartwrightPage() {
  const t = useTranslations("CartwrightPage");
  // Engine marketing belongs on the engine's own (website-mode) sites — a
  // WEBSHOP hosting a full "Cartwright Engine" pitch page under its shop
  // domain is another product's landing page on the merchant's brand.
  // Webshops answer 404; website-mode keeps the page.
  if (brand.ecommerceEnabled) notFound();

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white pt-32 pb-24">
      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center mb-24">
        <div className="mb-6 rounded-full border border-[var(--cw-brand-on-dark)]/30 bg-[var(--cw-brand-on-dark)]/10 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-[var(--cw-brand-on-dark-hi)]">
          {t("badge")}
        </div>
        
        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter mb-8 leading-[1.1]">
          {t("title1")} <span className="text-[var(--cw-brand-on-dark)]">{t("title2")}</span>
        </h1>
        
        <p className="text-xl sm:text-2xl text-white/60 mb-12 max-w-3xl mx-auto font-light leading-relaxed">
          {t("description")}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link 
            href="https://cartwright.app" 
            target="_blank"
            rel="noopener noreferrer"
            className="h-14 px-8 flex items-center justify-center rounded-md bg-white !text-black font-bold text-base hover:bg-white/90 transition-all focus:ring-4 focus:ring-white/20 gap-2"
          >
            {t("visitBtn")} <ArrowRight className="w-5 h-5" />
          </Link>
          <a 
            href="https://github.com/Teloz1870/cartwright-template"
            target="_blank"
            rel="noopener noreferrer"
            className="h-14 px-8 flex items-center justify-center rounded-md border border-white/25 hover:bg-white/10 hover:border-white/40 text-white font-bold text-base transition-all focus:ring-4 focus:ring-white/10 gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            {t("githubBtn")}
          </a>
        </div>
      </section>

      {/* Terminal Mockup */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-32">
        <div className="max-w-4xl mx-auto relative w-full rounded-2xl border border-white/10 bg-[#0A0A0A] overflow-hidden shadow-2xl shadow-[var(--cw-brand-on-dark)]/10 group">
          <div className="absolute inset-0 bg-gradient-to-tr from-[var(--cw-brand-on-dark)]/5 to-transparent pointer-events-none" />
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <div className="ml-2 text-xs font-mono text-white/40">{t("terminalTitle")}</div>
          </div>
          <div className="p-8 font-mono text-sm leading-loose relative z-10">
            <div className="text-white/50"><span className="text-pink-500">$</span> <span className="text-blue-400">npx</span> <span className="text-yellow-200">create-cartwright</span> my-store</div>
            <div className="text-emerald-400 mt-2">{t("terminalOk1")}</div>
            <div className="text-emerald-400">{t("terminalOk2")}</div>
            <div className="text-emerald-400">{t("terminalOk3")}</div>
            <div className="text-emerald-400">{t("terminalOk4")}</div>
            <div className="text-emerald-400">{t("terminalOk5")}</div>
            <div className="text-emerald-400">{t("terminalOk6")}</div>
            <div className="text-emerald-400">{t("terminalOk7")}</div>
            <br/>
            <div className="text-white/50"><span className="text-pink-500">$</span> <span className="text-blue-400">npm</span> run dev</div>
            <div className="text-white/70 mt-2">{t("terminalReady")}</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-10 rounded-2xl border border-white/10 bg-[#0A0A0A] hover:border-white/20 transition-all">
          <Zap className="w-8 h-8 text-yellow-400 mb-6" />
          <h3 className="text-2xl font-bold mb-4">{t("perfTitle")}</h3>
          <p className="text-white/60 leading-relaxed">
            {t("perfDesc")}
          </p>
        </div>
        <div className="p-10 rounded-2xl border border-white/10 bg-[#0A0A0A] hover:border-white/20 transition-all">
          <Server className="w-8 h-8 text-emerald-400 mb-6" />
          <h3 className="text-2xl font-bold mb-4">{t("tenantTitle")}</h3>
          <p className="text-white/60 leading-relaxed">
            {t("tenantDesc")}
          </p>
        </div>
        <div className="p-10 rounded-2xl border border-white/10 bg-[#0A0A0A] hover:border-white/20 transition-all">
          <svg className="w-8 h-8 text-blue-400 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-2xl font-bold mb-4">{t("i18nTitle")}</h3>
          <p className="text-white/60 leading-relaxed">
            {t("i18nDesc")}
          </p>
        </div>
        <div className="p-10 rounded-2xl border border-white/10 bg-[#0A0A0A] hover:border-white/20 transition-all">
          <svg className="w-8 h-8 text-[var(--cw-brand-on-dark)] mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <h3 className="text-2xl font-bold mb-4">{t("cmsTitle")}</h3>
          <p className="text-white/60 leading-relaxed">
            {t("cmsDesc")}
          </p>
        </div>
        <div className="p-10 rounded-2xl border border-white/10 bg-[#0A0A0A] hover:border-white/20 transition-all">
          <svg className="w-8 h-8 text-[var(--cw-brand-on-dark)] mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <h3 className="text-2xl font-bold mb-4">{t("stripeTitle")}</h3>
          <p className="text-white/60 leading-relaxed">
            {t("stripeDesc")}
          </p>
        </div>
        <div className="p-10 rounded-2xl border border-white/10 bg-[#0A0A0A] hover:border-white/20 transition-all">
          <svg className="w-8 h-8 text-pink-400 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="text-2xl font-bold mb-4">{t("vibeTitle")}</h3>
          <p className="text-white/60 leading-relaxed">
            {t("vibeDesc")}
          </p>
        </div>
        <div className="p-10 rounded-2xl border border-white/10 bg-[#0A0A0A] hover:border-white/20 transition-all">
          <Code2 className="w-8 h-8 text-cyan-400 mb-6" />
          <h3 className="text-2xl font-bold mb-4">{t("setupTitle")}</h3>
          <p className="text-white/60 leading-relaxed">
            {t("setupDesc")}
          </p>
        </div>
      </section>
    </div>
  );
}
