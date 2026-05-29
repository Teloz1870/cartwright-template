"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createLead } from "@/app/actions/lead";

type Step = 1 | 2 | 3 | 4;

const OptionCard = ({ title, desc, icon, selected, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`p-6 rounded-2xl cursor-pointer transition-all duration-300 border-2 ${selected ? 'border-[#d4af37] bg-[#d4af37]/10 scale-105' : 'border-white/10 hover:border-white/30 bg-white/5'} backdrop-blur-md`}
  >
    <div className="text-4xl mb-4">{icon}</div>
    <h3 className="text-xl font-black text-white mb-2">{title}</h3>
    <p className="text-white/60 text-sm leading-relaxed">{desc}</p>
  </div>
);

export default function LeadCaptureWizard() {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState({
    projectType: "",
    budget: "",
    name: "",
    company: "",
    email: "",
    phone: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => setStep((s) => (s + 1) as Step);
  const handleBack = () => setStep((s) => (s - 1) as Step);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const fd = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      fd.append(key, value);
    });

    const result = await createLead(fd);
    if (result.ok) {
      setStep(4); // Success step
    } else {
      setError(result.error ?? "Noget gik galt");
    }
    setIsSubmitting(false);
  };



  return (
    <div className="w-full max-w-4xl mx-auto py-12">
      {/* Progress Bar */}
      {step < 4 && (
        <div className="w-full h-1 bg-white/10 rounded-full mb-12 overflow-hidden">
          <motion.div 
            className="h-full bg-[#d4af37]"
            initial={{ width: "33%" }}
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">Hvad kan vi hjælpe med?</h2>
            <p className="text-white/60 text-lg mb-10 font-light">Vælg den kategori der bedst beskriver dit projekt.</p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <OptionCard 
                icon="🚀" title="Webshop" desc="Komplette B2B/B2C e-commerce løsninger med Stripe og AI."
                selected={formData.projectType === "Webshop"}
                onClick={() => { setFormData({...formData, projectType: "Webshop"}); setTimeout(handleNext, 400); }}
              />
              <OptionCard 
                icon="⚡️" title="Website" desc="Lynhurtige websites med The Golden Stack 2026."
                selected={formData.projectType === "Website"}
                onClick={() => { setFormData({...formData, projectType: "Website"}); setTimeout(handleNext, 400); }}
              />
              <OptionCard 
                icon="🧠" title="AI-Integration" desc="Custom AI agenter, Model Context Protocol og automatisering."
                selected={formData.projectType === "AI-Integration"}
                onClick={() => { setFormData({...formData, projectType: "AI-Integration"}); setTimeout(handleNext, 400); }}
              />
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            <button onClick={handleBack} className="text-white/40 hover:text-white mb-6 text-sm uppercase tracking-wider font-bold transition-colors">← Tilbage</button>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">Hvad er budgettet?</h2>
            <p className="text-white/60 text-lg mb-10 font-light">Det hjælper os med at sammensætte det rigtige team og den rigtige arkitektur.</p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <OptionCard 
                icon="🌱" title="Startup" desc="Under 20.000 DKK"
                selected={formData.budget === "<20k"}
                onClick={() => { setFormData({...formData, budget: "<20k"}); setTimeout(handleNext, 400); }}
              />
              <OptionCard 
                icon="💼" title="Growth" desc="20.000 - 50.000 DKK"
                selected={formData.budget === "20k-50k"}
                onClick={() => { setFormData({...formData, budget: "20k-50k"}); setTimeout(handleNext, 400); }}
              />
              <OptionCard 
                icon="🏢" title="Enterprise" desc="Over 50.000 DKK"
                selected={formData.budget === "50k+"}
                onClick={() => { setFormData({...formData, budget: "50k+"}); setTimeout(handleNext, 400); }}
              />
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            <button onClick={handleBack} className="text-white/40 hover:text-white mb-6 text-sm uppercase tracking-wider font-bold transition-colors">← Tilbage</button>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">Lad os tage en snak</h2>
            <p className="text-white/60 text-lg mb-10 font-light">Udfyld dine detaljer, så kontakter vi dig til en uforpligtende snak om dit projekt.</p>
            
            <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md">
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-xs font-black uppercase text-white/50 mb-2">Dit Navn *</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#d4af37]" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-white/50 mb-2">Firma / Projektnavn</label>
                  <input value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#d4af37]" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-white/50 mb-2">Email *</label>
                  <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#d4af37]" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-white/50 mb-2">Telefon</label>
                  <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#d4af37]" />
                </div>
              </div>
              <div className="mb-8">
                <label className="block text-xs font-black uppercase text-white/50 mb-2">Kort om projektet (Valgfrit)</label>
                <textarea rows={4} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#d4af37]" />
              </div>
              
              {error && <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200">{error}</div>}
              
              <button disabled={isSubmitting} type="submit" className="w-full bg-[#d4af37] text-[#050A19] font-black text-lg py-4 rounded-xl hover:bg-[#b0902c] transition-colors disabled:opacity-50">
                {isSubmitting ? "Sender..." : "Send Forespørgsel"}
              </button>
            </form>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center py-20"
          >
            <div className="w-24 h-24 bg-[#d4af37]/20 text-[#d4af37] rounded-full flex items-center justify-center text-4xl mx-auto mb-8 border border-[#d4af37]/50">
              ✓
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-6 tracking-tight">Tak for din interesse!</h2>
            <p className="text-white/60 text-xl font-light max-w-2xl mx-auto">
              Vi har modtaget din forespørgsel, og vores systemer er allerede igang med at analysere dit projekt. En af vores specialister rækker ud til dig inden for 24 timer.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
