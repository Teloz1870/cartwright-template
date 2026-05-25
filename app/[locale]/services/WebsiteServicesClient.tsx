"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/routing";

export default function WebsiteServicesClient() {
  const fullServices = [
    {
      title: "Moderne Webudvikling",
      description: "Vi bygger skræddersyede, lynhurtige websites på Next.js og React. Vores løsninger er født med asymmetriske layouts, lynhurtig load-tid og best-in-class SEO. Vi kalder det The Golden Stack 2026.",
      icon: "⚡️",
      features: ["Next.js 16 & React 19", "Framer Motion Animationer", "Global Edge Delivery (Vercel)"],
      price: "Fra 19.995,-"
    },
    {
      title: "AI Integrationer & Agenter",
      description: "Fremtiden tilhører virksomheder der forstår at udnytte AI. Vi bygger intelligente agenter direkte ind i jeres systemer. Fra automatisk kundeservice til Model Context Protocol (MCP) workflows.",
      icon: "🧠",
      features: ["Custom AI Agenter", "RAG (Retrieval-Augmented Generation)", "Google Gemini Flash Integration"],
      price: "Fra 14.500,-"
    },
    {
      title: "Domæneflytning & Hosting",
      description: "Slip for bøvlet med servere og DNS. Vi overtager ansvaret, flytter dit domæne sikkert, og lægger din nye løsning på vores Enterprise-grade server-infrastruktur.",
      icon: "🌍",
      features: ["Zero-downtime migrering", "SSL Certifikat Inkluderet", "DDoS Beskyttelse"],
      price: "1.495,- pr. år"
    },
    {
      title: "B2B E-commerce (Agentic)",
      description: "Webshops bygget til B2B og B2C, hvor AI tager imod ordrer, forhandler priser (hvis du tillader det) og opdaterer dit PIM system i realtid.",
      icon: "🛍️",
      features: ["Stripe B2B Checkout", "Dynamisk Prissætning", "Cartwright Engine"],
      price: "Fra 34.000,-"
    }
  ];

  return (
    <div className="min-h-screen bg-black pt-32 pb-24">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-white/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mb-20"
        >
          <h1 className="text-6xl sm:text-8xl font-black text-white tracking-tighter mb-6 leading-[1.1]">
            Ydelser der flytter <span className="text-indigo-400">grænser.</span>
          </h1>
          <p className="text-xl text-white/70 font-light leading-relaxed">
            Vi bygger ikke bare hjemmesider. Vi bygger digitale systemer, der engagerer dine kunder og automatiserer din forretning.
          </p>
        </motion.div>

        <div className="space-y-8">
          {fullServices.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative bg-white/5 border border-white/10 rounded-3xl p-8 sm:p-12 backdrop-blur-md overflow-hidden hover:bg-white/10 transition-colors"
            >
              {/* Highlight line */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 transform scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-500" />
              
              <div className="flex flex-col lg:flex-row gap-12 lg:items-center">
                <div className="lg:w-2/3">
                  <div className="text-4xl mb-6">{service.icon}</div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">{service.title}</h2>
                  <p className="text-lg text-white/70 font-light leading-relaxed mb-8">
                     {service.description}
                  </p>
                  <ul className="flex flex-wrap gap-3">
                    {service.features.map((feature, i) => (
                      <li key={i} className="px-4 py-2 rounded-full bg-white/10 text-white/90 text-sm font-semibold tracking-wide">
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="lg:w-1/3 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between lg:justify-center gap-6 border-t lg:border-t-0 lg:border-l border-white/10 pt-8 lg:pt-0 lg:pl-12">
                  <div className="text-left lg:text-right">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 mb-2">Prisindikation</p>
                    <p className="text-2xl font-medium text-white">{service.price}</p>
                  </div>
                  <Link href="/kontakt" className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold tracking-wide bg-white !text-black hover:bg-indigo-500 hover:text-white w-full sm:w-auto transition-colors">
                    Start Dialog
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
