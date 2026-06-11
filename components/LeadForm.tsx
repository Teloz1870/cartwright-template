"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  services?: string[];
  defaultService?: string;
  title?: string;
  description?: string;
};

export default function LeadForm({
  services = ["Domain Migration", "Ny Hjemmeside", "Konsulentbistand"],
  defaultService,
  title,
  description,
}: Props) {
  const t = useTranslations("LeadForm");
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Data
  const [projectType, setProjectType] = useState(defaultService || "");
  const [budget, setBudget] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const budgets = ["Under 20.000 kr.", "20.000 - 50.000 kr.", "Over 50.000 kr.", "Ved ikke endnu"];

  const nextStep = () => {
    if (step === 1 && !projectType) return;
    if (step === 2 && !budget) return;
    setStep(step + 1);
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const data = {
      name,
      email,
      phone,
      company,
      projectType,
      budget,
      message: `Projekt: ${projectType}\nBudget: ${budget}`,
    };

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (result.ok) {
        setIsSuccess(true);
      } else {
        setError(result.error || t("errorGeneric"));
      }
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-black/80 backdrop-blur-2xl rounded-3xl p-10 border border-emerald-500/30 text-center relative overflow-hidden shadow-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent z-0" />
        <div className="relative z-10">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            <CheckCircle2 size={40} />
          </div>
          <h3 className="text-3xl font-black text-white mb-3">{t("successTitle")}</h3>
          <p className="text-slate-400 text-lg">{t("successDesc")}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="bg-black/60 backdrop-blur-2xl rounded-3xl p-8 sm:p-10 border border-white/10 shadow-2xl relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />
      
      <div className="relative z-10">
        <div className="mb-8">
          <h2 className="text-3xl font-black text-white mb-2">{title || t("title")}</h2>
          <p className="text-slate-400">{description || t("description")}</p>
          
          {/* Progress Bar */}
          <div className="mt-8 flex gap-2">
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= i ? "bg-blue-500" : "bg-white/10"}`} 
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative min-h-[300px]">
          <AnimatePresence mode="wait">
            
            {/* STEP 1: PROJECT TYPE */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-xl font-bold text-white mb-6">{t("step1Title")}</h3>
                <div className="grid grid-cols-1 gap-3">
                  {services.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setProjectType(s)}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left ${
                        projectType === s 
                          ? "bg-blue-600/20 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]" 
                          : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="font-semibold">{s}</span>
                      {projectType === s && <CheckCircle2 className="text-blue-400" size={20} />}
                    </button>
                  ))}
                </div>
                
                <div className="pt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={!projectType}
                    className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("nextStep")} <ArrowRight size={18} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: BUDGET */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-xl font-bold text-white mb-6">{t("step2Title")}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {budgets.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBudget(b)}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left ${
                        budget === b 
                          ? "bg-purple-600/20 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]" 
                          : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="font-semibold">{b}</span>
                      {budget === b && <CheckCircle2 className="text-purple-400" size={20} />}
                    </button>
                  ))}
                </div>

                <div className="pt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex items-center gap-2 text-slate-400 px-4 py-3 hover:text-white transition-colors"
                  >
                    <ArrowLeft size={18} /> {t("prevStep")}
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={!budget}
                    className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("nextStep")} <ArrowRight size={18} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: CONTACT INFO */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-xl font-bold text-white mb-6">{t("step3Title")}</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">{t("nameLabel")}</label>
                      <input
                        required
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">{t("emailLabel")}</label>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">{t("phoneLabel")}</label>
                      <input
                        required
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                        placeholder="+45 12 34 56 78"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">{t("companyLabel")}</label>
                      <input
                        required
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                        placeholder="Acme Corp"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex items-center gap-2 text-slate-400 px-4 py-3 hover:text-white transition-colors"
                  >
                    <ArrowLeft size={18} /> {t("prevStep")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !name || !email || !phone || !company}
                    className="flex items-center gap-2 bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t("submitting")}
                      </span>
                    ) : (
                      <>
                        {t("submitBtn")} <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </form>
      </div>
    </div>
  );
}
