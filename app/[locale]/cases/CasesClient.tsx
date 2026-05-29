"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Bot, Server, Zap, Search, ShoppingBag } from "lucide-react";

export default function CasesClient() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white pt-24 pb-20">
      {/* Background Gradients */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute inset-0 opacity-[0.15]" 
          style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-500/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-24 md:w-2/3"
        >
          <div className="mb-6 rounded-full border border-white/10 bg-white/5 w-max px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-white/80 backdrop-blur-md">
            Customer Success
          </div>
          <h1 className="text-6xl sm:text-8xl font-black text-white tracking-tighter mb-6 leading-[1.1]">
            Cases der ændrer <span className="text-indigo-400">branchen</span>
          </h1>
          <p className="text-xl text-white/60 font-light leading-relaxed max-w-2xl">
            Se hvordan vi transformerer e-commerce gennem skræddersyede AI-løsninger, lynhurtig infrastruktur og intelligente workflows.
          </p>
        </motion.div>

        {/* CASE 1: Cartwright */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="mb-32 relative group"
        >
          {/* Subtle glow behind the card */}
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="relative rounded-[2rem] border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl overflow-hidden flex flex-col md:flex-row">
            
            {/* Content Side */}
            <div className="p-10 md:p-16 md:w-1/2 flex flex-col justify-center">
              <div className="mb-6 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                  <img src="/cartwright_logo.png" alt="Cartwright" loading="lazy" decoding="async" className="w-8 h-8 object-contain" />
                </div>
                <span className="text-sm font-semibold tracking-widest text-indigo-400 uppercase">Flagship Platform</span>
              </div>
              <h2 className="text-4xl font-bold mb-6 text-white tracking-tight">Cartwright AI Engine</h2>
              <p className="text-white/60 leading-relaxed mb-8 text-lg">
                En fuldkommen ny e-commerce standard. Cartwright er ikke bare en webshop; det er en sammensmeltning af autonom AI-kundeservice, hyper-personaliseret produktfremvisning og en headless Next.js infrastruktur.
              </p>
              
              <div className="grid grid-cols-2 gap-6 mb-10">
                <div>
                  <div className="text-3xl font-black text-white mb-1">0.8s</div>
                  <div className="text-sm text-white/40">Page Load Time</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-white mb-1">100%</div>
                  <div className="text-sm text-white/40">AI Triage Match</div>
                </div>
              </div>

              <ul className="space-y-3 mb-10">
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Next.js 16 App Router Backend
                </li>
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> AI Assistent integreret via MCP (Model Context Protocol)
                </li>
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Global Edge Caching med Vercel
                </li>
              </ul>
              
              <Link href="/services" className="inline-flex items-center gap-2 text-indigo-400 font-semibold hover:text-indigo-300 transition-colors w-max">
                Udforsk teknologien <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            {/* Visual Side */}
            <div className="md:w-1/2 bg-gradient-to-br from-[#111] to-[#050505] relative overflow-hidden border-l border-white/5 min-h-[400px] md:min-h-auto">
              <div className="absolute inset-0 flex items-center justify-center p-8 lg:p-12">
                <div className="w-full relative rounded-xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md rotate-[-2deg] group-hover:rotate-0 group-hover:scale-105 transition-all duration-700">
                  <img src="/cartwright.png" alt="Cartwright AI Engine Mockup" loading="lazy" decoding="async" className="w-full h-auto object-cover" />
                </div>
              </div>
              <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-indigo-500/30 blur-[80px] rounded-full pointer-events-none" />
            </div>
          </div>
        </motion.div>

        {/* CASE 2: Hegnsfabrikken */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="mb-20 relative group"
        >
          <div className="absolute -inset-1 bg-gradient-to-l from-emerald-500/20 to-teal-500/20 rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="relative rounded-[2rem] border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl overflow-hidden flex flex-col md:flex-row-reverse">
            
            {/* Content Side */}
            <div className="p-10 md:p-16 md:w-1/2 flex flex-col justify-center">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-12 px-4 rounded-full bg-white flex items-center justify-center border border-emerald-500/30">
                  <img src="/HF-2023-Logo-5.svg" alt="Hegnsfabrikken" loading="lazy" decoding="async" className="h-6 object-contain" />
                </div>
                <span className="text-sm font-semibold tracking-widest text-emerald-400 uppercase">Industri Transformation</span>
              </div>
              <h2 className="text-4xl font-bold mb-6 text-white tracking-tight">Hegnsfabrikken</h2>
              <p className="text-white/60 leading-relaxed mb-8 text-lg">
                Hegnsfabrikken havde brug for en digital overhaling, der matchede deres høje produktkvalitet. Vi byggede en lynhurtig B2B og B2C storefront med integreret tilbudsberegner, der sparer salgsteamet for utallige timer hver uge.
              </p>
              
              <div className="grid grid-cols-2 gap-6 mb-10">
                <div>
                  <div className="text-3xl font-black text-white mb-1">+240%</div>
                  <div className="text-sm text-white/40">Konverteringsrate</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-white mb-1">-45%</div>
                  <div className="text-sm text-white/40">Admin tidsforbrug</div>
                </div>
              </div>

              <ul className="space-y-3 mb-10">
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Automatiske fragt-beregninger baseret på postnummer
                </li>
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Skræddersyet panel-hegns bygger
                </li>
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> CRM integration og automatiske tilbud
                </li>
              </ul>
              
              <Link href="/contact" className="inline-flex items-center gap-2 text-emerald-400 font-semibold hover:text-emerald-300 transition-colors w-max">
                Skal vi bygge din platform? <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
                   {/* Visual Side */}
            <div className="md:w-1/2 bg-gradient-to-bl from-[#05100a] to-[#0a0a0a] relative overflow-hidden border-r border-white/5 min-h-[400px] md:min-h-auto">
              <div className="absolute inset-0 flex items-center justify-center p-8 lg:p-12">
                <div className="w-full relative rounded-xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md rotate-[2deg] group-hover:rotate-0 group-hover:scale-105 transition-all duration-700">
                  <video src="/hegnsfabrikken-demo.mp4" autoPlay loop muted playsInline className="w-full h-auto object-cover" />
                </div>
              </div>
              <div className="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-emerald-500/20 blur-[80px] rounded-full pointer-events-none" />
            </div>
          </div>
        </motion.div>

        {/* CASE 3: Northbound Coffee */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="mb-20 relative group"
        >
          {/* Subtle glow behind the card */}
          <div className="absolute -inset-1 bg-gradient-to-r from-amber-600/20 to-orange-500/20 rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="relative rounded-[2rem] border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl overflow-hidden flex flex-col md:flex-row">
            
            {/* Content Side */}
            <div className="p-10 md:p-16 md:w-1/2 flex flex-col justify-center">
              <div className="mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                  <Bot className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-sm font-semibold tracking-widest text-amber-400 uppercase">Cartwright Engine</span>
              </div>
              <h2 className="text-4xl font-bold mb-6 text-white tracking-tight">Northbound Coffee</h2>
              <p className="text-white/60 leading-relaxed mb-8 text-lg">
                For Northbound Coffee Roasters implementerede vi en komplet Cartwright-løsning. Deres kunder får nu en hyper-personaliseret AI-købsoplevelse, hvor de kan blive guidet til den perfekte bønne baseret på deres smagspræferencer.
              </p>
              
              <ul className="space-y-3 mb-10">
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> AI "Brew Guide" shopping assistent
                </li>
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Skræddersyet kaffe-abonnement integration
                </li>
                <li className="flex items-center gap-3 text-white/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Lynhurtig loadtid bygget på Next.js
                </li>
              </ul>
              
              <Link href="/contact" className="inline-flex items-center gap-2 text-amber-400 font-semibold hover:text-amber-300 transition-colors w-max">
                Skal vi opsætte din webshop? <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            {/* Visual Side */}
            <div className="md:w-1/2 bg-gradient-to-br from-[#111] to-[#050505] relative overflow-hidden border-l border-white/5 min-h-[400px] md:min-h-auto">
              <div className="absolute inset-0 flex items-center justify-center p-8 lg:p-12">
                <div className="w-full relative rounded-xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md rotate-[-2deg] group-hover:rotate-0 group-hover:scale-105 transition-all duration-700">
                  <img src="/northbound.png" alt="Northbound Coffee Cartwright" loading="lazy" decoding="async" className="w-full h-auto object-cover" />
                </div>
              </div>
              <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-amber-500/30 blur-[80px] rounded-full pointer-events-none" />
            </div>
          </div>
        </motion.div>

        {/* CTA Section */}
        <div className="text-center mt-32 mb-10">
          <h3 className="text-3xl font-bold mb-6">Klar til at blive den næste case?</h3>
          <p className="text-white/50 max-w-xl mx-auto mb-8">
            Uanset om du skal have bygget en lynhurtig shop fra bunden, eller vil have implementeret AI i dit nuværende setup, står vi klar.
          </p>
          <Link 
            href="/contact" 
            className="inline-flex h-12 px-8 items-center justify-center rounded-md bg-white text-black font-semibold hover:bg-white/90 transition-all focus:ring-4 focus:ring-white/20"
          >
            Start dit projekt
          </Link>
        </div>
      </div>
    </div>
  );
}
