"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Server, Bot, Layers, ArrowRight, Globe, Wand2 } from "lucide-react";
import UseCases from "./UseCases";
import { useTranslations } from "next-intl";
import { brand } from "@/brand.config";
import { ThreeHero } from "@/components/ThreeHero";
import { editAttr } from "@/components/annotate/editAttr";
import type { DesignHomepageProps } from "../types";

/**
 * SaaS dark design — Antigravity-built bg-black + indigo accent + futurist-
 * cyber feel. Originally Teloz' marketing site (designs/saas-dark/design.md).
 *
 * v0.7.0 NB: filen var tidligere components/website/SaaSHomeClient.tsx med
 * hardcoded prop-shape (heroHeadline/heroTagline/heroCta/storeName). Nu
 * tager den standard DesignHomepageProps og resolver felter fra
 * settings (DB BrandingSettings) → brand.config.ts (fallback).
 */
export default function SaaSDarkHomepage({ settings, threeD, editEnabled = false }: DesignHomepageProps) {
  const t = useTranslations("SaaSHome");

  const heroHeadline = settings?.websiteHeadline || brand.metadata.title;
  const heroTagline = settings?.tagline || brand.tagline;
  const storeName = settings?.storeName || brand.storeName;

  // Overstyr "Demo Store" teksten så templaten ser mere passende ud som default.
  const displayHeadline = heroHeadline === "Cartwright Demo Store" ? "Cartwright AI Agency" : heroHeadline;

  return (
    <div className="relative min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white">
      {/* Background Gradient & Grid */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.15]"
          style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
        {/* Cartwright Live Canvas — sits above the gradient/grid, below the
            z-10 hero content. Self-gates (WebGL2/reduced-motion/saveData); the
            gradient above remains the guaranteed fallback. */}
        {threeD?.enabled && (
          <ThreeHero
            scene={threeD.scene}
            intensity={threeD.intensity}
            className="pointer-events-none absolute left-0 top-0 h-screen w-full opacity-80"
          />
        )}
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-40 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <div className="mb-6 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-white/80 backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {t("badge")}
          </div>
          
          <h1
            className="text-6xl sm:text-8xl font-black text-white tracking-tighter mb-8 max-w-5xl leading-[1.1]"
            {...editAttr({ kind: "setting", field: "websiteHeadline" }, editEnabled)}
          >
            {displayHeadline.split(" ").slice(0, -1).join(" ")}{" "}
            <span className="text-indigo-400">{displayHeadline.split(" ").slice(-1)}</span>
          </h1>

          <p
            className="text-xl sm:text-2xl text-white/60 mb-12 max-w-2xl font-light leading-relaxed"
            {...editAttr({ kind: "setting", field: "tagline" }, editEnabled)}
          >
            {heroTagline}
          </p>

          <form action="/contact" className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto max-w-lg mx-auto sm:mx-0 bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-sm">
            <input 
              type="email" 
              name="email"
              placeholder={t("emailPlaceholder")}
              className="h-12 px-4 bg-transparent text-white placeholder-white/40 focus:outline-none w-full sm:w-64"
            />
            <button 
              type="submit"
              className="h-12 px-8 flex items-center justify-center rounded-lg bg-white !text-black font-bold text-sm hover:bg-gray-200 transition-all focus:ring-4 focus:ring-white/20 whitespace-nowrap"
            >
              {t("submitBtn")}
            </button>
          </form>

          <p className="mt-10 text-sm text-white/40">
            {t("wantSimilar")}{" "}
            <Link href="/cases" className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline transition-colors">
              {t("readMore")}
            </Link>
          </p>
        </motion.div>
      </section>

      {/* Terminal / Code Snippet Section */}
      <section className="relative z-10 py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto rounded-xl border border-white/10 bg-[#0A0A0A] overflow-hidden shadow-2xl shadow-indigo-500/10"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <div className="ml-2 text-xs font-mono text-white/40">{t("terminalTitle")}</div>
          </div>
          <div className="p-6 font-mono text-sm leading-loose">
            <div className="text-white/50"><span className="text-pink-500">const</span> <span className="text-blue-400">agent</span> = <span className="text-pink-500">new</span> <span className="text-yellow-200">CartwrightAgent</span>({'{'}</div>
            <div className="pl-4 text-white/80">
              <span className="text-white/50">{t("terminalMode")}</span> <span className="text-green-300">&quot;autonomous&quot;</span>,<br/>
              <span className="text-white/50">{t("terminalBrand")}</span> <span className="text-green-300">&quot;{storeName}&quot;</span>,<br/>
              <span className="text-white/50">{t("terminalPlugins")}</span> [<span className="text-green-300">&quot;i18nexus&quot;</span>, <span className="text-green-300">&quot;vibe-engine&quot;</span>, <span className="text-green-300">&quot;stripe&quot;</span>],<br/>
              <span className="text-white/50">{t("terminalCapabilities")}</span> [<span className="text-green-300">&quot;commerce&quot;</span>, <span className="text-green-300">&quot;triage&quot;</span>, <span className="text-green-300">&quot;in-house-designer&quot;</span>]
            </div>
            <div className="text-white/50">{`});`}</div>
            <br/>
            <div className="text-white/50"><span className="text-blue-400">await</span> agent.<span className="text-yellow-200">deploy</span>(); <span className="text-green-500/70">{`// 🚀 Systems online in 1.2s`}</span></div>
          </div>
        </motion.div>
      </section>

      {/* Bento Grid Features */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-4">{t("bentoTitle")}</h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            {t("bentoSubtitle")}
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-10 flex flex-col justify-end min-h-[300px] group overflow-hidden relative hover:border-white/20 transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="mb-auto">
              <Server className="w-10 h-10 text-indigo-400 mb-6" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 relative z-10">{t("edgeTitle")}</h3>
            <p className="text-white/50 relative z-10 max-w-md">{t("edgeDesc")}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 flex flex-col justify-end min-h-[300px] group hover:border-white/20 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="mb-auto">
              <Bot className="w-10 h-10 text-emerald-400 mb-6" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 relative z-10">{t("autonomousTitle")}</h3>
            <p className="text-white/50 relative z-10">{t("autonomousDesc")}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 flex flex-col justify-end min-h-[300px] group hover:border-white/20 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="mb-auto">
              <Globe className="w-10 h-10 text-blue-400 mb-6" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 relative z-10">{t("i18nTitle")}</h3>
            <p className="text-white/50 relative z-10">{t("i18nDesc")}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 flex flex-col justify-end min-h-[300px] group hover:border-white/20 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="mb-auto">
              <Wand2 className="w-10 h-10 text-purple-400 mb-6" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 relative z-10">{t("vibeTitle")}</h3>
            <p className="text-white/50 relative z-10">{t("vibeDesc")}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-10 flex flex-col justify-end min-h-[300px] group hover:border-white/20 transition-all relative overflow-hidden"
          >
            <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
            <div className="mb-auto">
              <Layers className="w-10 h-10 text-pink-400 mb-6" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 relative z-10">{t("stackTitle")}</h3>
            <p className="text-white/50 relative z-10 max-w-md">{t("stackDesc")}</p>
          </motion.div>

        </div>
      </section>

      {/* Cartwright Product Section */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-[#0A0A0A] to-emerald-500/10 p-10 sm:p-16 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none translate-x-1/2 -translate-y-1/2" />
          
          <div className="relative z-10 max-w-3xl">
            <div className="mb-6 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-indigo-300 w-fit">
              {t("cartwrightBadge")}
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">{t("cartwrightTitle")}</h2>
            <p className="text-xl text-white/70 mb-8 leading-relaxed">
              {t("cartwrightDesc1")}
            </p>
            <p className="text-white/60 mb-10 leading-relaxed max-w-2xl">
              {t("cartwrightDesc2")}
            </p>
            <Link 
              href="/cartwright" 
              className="inline-flex h-12 items-center justify-center rounded-md bg-white !text-black px-8 font-semibold text-sm hover:bg-white/90 transition-all focus:ring-4 focus:ring-white/20 gap-2"
            >
              {t("cartwrightBtn")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <UseCases />

    </div>
  );
}
