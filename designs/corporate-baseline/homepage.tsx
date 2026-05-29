"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/Button";
import { useTranslations } from "next-intl";
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";

/**
 * Corporate Baseline design — generic fallback for website-mode shops der
 * IKKE har picked saas-dark eller studio. Cinematic parallax hero,
 * 3-card service-grid, neutral sol-* palette.
 *
 * v0.7.0 NB: tidligere components/website/WebsiteHomeClient.tsx kaldt med
 * `{settings, brand}`-props. Nu standard DesignHomepageProps + læser brand
 * fra import.
 */
export default function CorporateBaselineHomepage({ settings }: DesignHomepageProps) {
  const t = useTranslations("WebsiteHome");
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Parallax for hero image
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  
  const yParallax = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacityFade = useTransform(scrollYProgress, [0, 0.5], [0.5, 0]);

  const heroImage = settings?.heroImage ?? brand.images.hero;

  const services = [
    {
      title: t("webTitle"),
      description: t("webDesc"),
      icon: "⚡️",
      link: "/info/om-os"
    },
    {
      title: t("aiTitle"),
      description: t("aiDesc"),
      icon: "🧠",
      link: "/info/om-os"
    },
    {
      title: t("hostingTitle"),
      description: t("hostingDesc"),
      icon: "🌍",
      link: "/info/om-os"
    }
  ];

  return (
    <div ref={containerRef} className="min-h-screen bg-sol-cream">
      {/* 1. Cinematic Hero Section */}
      <div className="relative h-[80vh] w-full flex items-end pb-24 sm:pb-32 bg-[#050A19] overflow-hidden">
        <motion.div 
          className="absolute inset-0 z-0" 
          style={{ y: yParallax, opacity: opacityFade }}
        >
          <Image
            src={heroImage}
            alt="Hero"
            fill
            sizes="100vw"
            className="object-cover mix-blend-overlay"
            priority
          />
        </motion.div>
        {/* Liquid dark gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050A19] via-[#050A19]/60 to-transparent z-10" />
        
        <div className="container relative mx-auto px-4 sm:px-8 z-20">
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-[#d4af37] mb-6"
          >
            {settings?.storeName ?? brand.storeName}
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="text-5xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter max-w-4xl leading-[0.95]" 
            style={{ textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
          >
            {settings?.websiteHeadline ? (
              settings.websiteHeadline.split("\n").map((line: string, i: number) => (
                <span key={i}>
                  {line}
                  <br className="hidden md:block" />
                </span>
              ))
            ) : (
              <>
                {t("titleFallback1")} <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50">{t("titleFallback2")}</span>
              </>
            )}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
            className="mt-8 text-xl text-white/80 max-w-2xl font-light leading-relaxed"
          >
            {settings?.tagline ?? brand.uiLabels.heroSubtagline}
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
            className="mt-12 flex gap-4"
          >
            <Button href="/services" variant="primary" className="h-14 px-8 text-lg bg-[#d4af37] text-[#050A19] hover:bg-[#b0902c]">
              {t("servicesBtn")}
            </Button>
            <Button href="/start" variant="ghost" className="border-white/20 text-white hover:bg-white/10 w-full sm:w-auto">
              {t("startBtn")}
            </Button>
          </motion.div>
        </div>
      </div>

      {/* 2. Teloz Service Grid */}
      <section className="bg-sol-cream py-24 sm:py-32">
        <div className="container mx-auto px-4 sm:px-8">
          <div className="mb-16 md:mb-24 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="text-4xl sm:text-5xl font-black text-sol-ink tracking-tight">{t("servicesTitle")}</h2>
              <p className="mt-6 text-xl text-sol-muted leading-relaxed font-light">{t("servicesDesc")}</p>
            </div>
            <Button href="/services" variant="ghost" className="shrink-0 border-2 border-sol-ink text-sol-ink hover:bg-sol-ink hover:text-white">
              {t("allServicesBtn")}
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <motion.a
                key={index}
                href={service.link}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group block p-10 rounded-3xl bg-white border border-sol-ink/5 shadow-sm hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden"
              >
                <div className="text-5xl mb-8 group-hover:scale-110 transition-transform origin-bottom-left duration-300">{service.icon}</div>
                <h3 className="text-2xl font-black text-sol-ink mb-4 group-hover:text-sol-accent transition-colors">{service.title}</h3>
                <p className="text-sol-muted leading-relaxed font-light">{service.description}</p>
                <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                  <span className="text-sol-accent font-black">→</span>
                </div>
              </motion.a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
