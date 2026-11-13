"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

export default function UseCases() {
  const t = useTranslations("UseCases");

  const CASES = [
    {
      id: "cartwright",
      title: "Cartwright Engine",
      description: t("cartwrightDesc"),
      tags: ["Next.js 16", "AI Agents", "Multi-tenant"],
      link: "https://cartwright.app",
      color: "from-indigo-500/20 to-purple-500/5",
      accent: "text-indigo-400",
      image: "/cartwright.png"
    },
    {
      id: "hegnsfabrikken",
      title: "Hegnsfabrikken.dk",
      description: t("hegnsDesc"),
      tags: ["3D Configurator", "E-commerce", "Stripe"],
      link: "https://hegnsfabrikken.dk",
      color: "from-emerald-500/20 to-teal-500/5",
      accent: "text-emerald-400",
      image: "/hegnsfabrikken.png"
    }
  ];

  return (
    <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="mb-12">
        <h2 className="text-4xl font-bold tracking-tight mb-4">{t("title")}</h2>
        <p className="text-white/50 text-lg max-w-2xl">
          {t("description")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {CASES.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
          >
            <Link 
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block h-full"
            >
              <div className="h-full rounded-2xl border border-white/10 bg-[#0A0A0A] overflow-hidden hover:border-white/20 transition-all relative flex flex-col">
                {/* Background Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                
                {/* Image Section */}
                <div className="relative w-full aspect-[16/10] border-b border-white/10 overflow-hidden bg-black/50">
                  <Image 
                    src={item.image} 
                    alt={item.title} 
                    fill 
                    className="object-cover object-top opacity-80 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105"
                  />
                </div>

                <div className="p-8 sm:p-10 flex flex-col flex-1 relative z-10">
                  <div className="mb-auto">
                    <h3 className="text-3xl font-bold text-white mb-4">{item.title}</h3>
                    <p className="text-white/60 leading-relaxed mb-8">
                      {item.description}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-8">
                    {item.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-white/70">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className={`flex items-center gap-2 text-sm font-semibold ${item.accent} group-hover:translate-x-2 transition-transform`}>
                    {t("visitBtn")} <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
