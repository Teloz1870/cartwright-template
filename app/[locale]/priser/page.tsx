import Link from "next/link";
import { Button } from "@/components/Button";
import { Check, Zap, Server, Code, Bot } from "lucide-react";

export const metadata = {
  title: "Priser & Ydelser | Teloz",
  description: "Fra strategisk AI-rådgivning til lynhurtige custom platforme.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white pt-32 pb-24 relative overflow-hidden">
      
      {/* Background Gradients */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-[0.10]" 
          style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-500/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="mb-32 md:w-2/3">
          <div className="mb-8 rounded-full border border-white/10 bg-white/5 w-max px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-white/80 backdrop-blur-md">
            Investering i fremtiden
          </div>
          <h1 className="text-6xl sm:text-8xl font-black text-white tracking-tighter mb-6 leading-[1.1]">
            Tech der <span className="text-indigo-400">skalerer.</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/60 font-light leading-relaxed max-w-2xl">
            Uanset om du har brug for strategisk AI-rådgivning til at optimere interne processer, eller skal have bygget en lynhurtig enterprise-platform fra bunden.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-start mb-32">
          
          {/* Consulting Package */}
          <div className="rounded-[2rem] p-10 lg:p-14 border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl relative transition-all hover:border-white/20 group">
            <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-50 transition-opacity">
              <Bot className="w-12 h-12 text-indigo-400" />
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-4">AI & Forretningsudvikling</h3>
            <p className="text-white/50 text-sm md:text-base mb-12 max-w-sm leading-relaxed">Strategisk konsulentarbejde og implementering af AI i jeres eksisterende workflows.</p>
            
            <div className="mb-12">
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-3 block">Fra</span>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-white">1.200</span>
                <span className="text-white/60 font-medium text-lg">DKK / time</span>
              </div>
            </div>
            
            <ul className="space-y-5 mb-14">
              <li className="flex items-start gap-4">
                <CheckIcon color="text-indigo-400" />
                <span className="text-white/80 text-sm">Identificering af AI use-cases i jeres forretning</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-indigo-400" />
                <span className="text-white/80 text-sm">Automatisering af manuelle processer & workflows</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-indigo-400" />
                <span className="text-white/80 text-sm">Rådgivning om tech-stack og systemarkitektur</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-indigo-400" />
                <span className="text-white/80 text-sm">Løbende sparring og teknisk ledelse</span>
              </li>
            </ul>
            
            <Link 
              href="/kontakt" 
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 bg-transparent text-white text-sm font-semibold hover:bg-white hover:text-black transition-all"
            >
              Book et uforpligtende møde
            </Link>
          </div>

          {/* Platform Package */}
          <div className="rounded-[2rem] p-10 lg:p-14 border border-emerald-500/30 bg-gradient-to-b from-[#0A1510] to-[#050A08] backdrop-blur-xl relative transition-all hover:border-emerald-500/50 group overflow-hidden mt-8 md:mt-0">
            {/* Highlight glow */}
            <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-emerald-500/20 blur-[80px] rounded-full pointer-events-none"></div>
            
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-full absolute top-8 right-8">
              <Zap className="w-3 h-3" /> Core Product
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-4 mt-2">Custom Platform</h3>
            <p className="text-white/50 text-sm md:text-base mb-12 max-w-sm leading-relaxed">Vi bygger din næste e-commerce eller SaaS platform fra bunden på Cartwright Engine.</p>
            
            <div className="mb-12">
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3 block">Enterprise Setup</span>
              <div className="flex items-baseline gap-2">
                <span className="text-white/60 font-medium text-lg">Projektbaseret estimat</span>
              </div>
            </div>
            
            <ul className="space-y-5 mb-14">
              <li className="flex items-start gap-4">
                <CheckIcon color="text-emerald-400" />
                <span className="text-white/90 text-sm">Skræddersyet design der bryder med standard skabeloner</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-emerald-400" />
                <span className="text-white/90 text-sm">Lynhurtig Next.js 16 & React 19 Frontend</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-emerald-400" />
                <span className="text-white/90 text-sm">Flersproget (i18nexus) setup inkl. AI auto-oversættelse</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-emerald-400" />
                <span className="text-white/90 text-sm">AI-genereret logo & brand identitet via Setup Wizard</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-emerald-400" />
                <span className="text-white/90 text-sm">Custom API integrationer (ERP, CRM, PIM)</span>
              </li>
              <li className="flex items-start gap-4">
                <CheckIcon color="text-emerald-400" />
                <span className="text-white/90 text-sm">Drift, vedligehold og cloud-hosting på Vercel</span>
              </li>
            </ul>
            
            <Link 
              href="/cases" 
              className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-all focus:ring-4 focus:ring-emerald-500/20"
            >
              Se hvordan vi byggede Hegnsfabrikken
            </Link>
          </div>

        </div>

        {/* Cartwright Product Showcase */}
        <div className="mb-32 rounded-[2.5rem] p-10 lg:p-16 border border-indigo-500/30 bg-gradient-to-r from-[#050510] via-[#0A0A1A] to-[#050510] backdrop-blur-xl relative overflow-hidden group shadow-2xl shadow-indigo-500/5">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none transition-opacity group-hover:bg-indigo-500/20" />
          
          <div className="relative z-10 flex flex-col md:flex-row gap-16 items-center">
            <div className="md:w-1/2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-full mb-8">
                <Code className="w-3 h-3" /> Vores eget produkt
              </div>
              <h3 className="text-3xl font-bold text-white mb-6">Cartwright Commerce</h3>
              <p className="text-white/60 text-base mb-10 leading-relaxed">
                Udover konsulentarbejde har vi bygget vores eget lynhurtige e-commerce og SaaS system. Cartwright er en komplet Next.js 16 platform med indbygget AI-assistent, i18nexus lokalisering, Stripe Billing og AI Auto-Oversættelse — og platformen er 100% gratis at bruge i sin grundform.
              </p>
              
              <ul className="space-y-5 mb-10">
                <li className="flex items-center gap-4">
                  <CheckIcon color="text-indigo-400" />
                  <span className="text-white/90 text-sm">Gratis licens (Open Source) uden skjulte gebyrer</span>
                </li>
                <li className="flex items-center gap-4">
                  <CheckIcon color="text-indigo-400" />
                  <span className="text-white/90 text-sm">Autonom AI-assistent & Headless CMS med Gemini Flash</span>
                </li>
                <li className="flex items-center gap-4">
                  <CheckIcon color="text-indigo-400" />
                  <span className="text-white/90 text-sm">Native i18nexus cloud sync & ✨ Auto-Oversæt knap</span>
                </li>
                <li className="flex items-center gap-4">
                  <CheckIcon color="text-indigo-400" />
                  <span className="text-white/90 text-sm">Dark Mode SaaS & Light Mode Webshop fra én kodebase</span>
                </li>
              </ul>
              
              <Link 
                href="/cases" 
                className="inline-flex h-12 px-8 items-center justify-center rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-all focus:ring-4 focus:ring-white/20"
              >
                Læs mere om Cartwright
              </Link>
            </div>
            
            <div className="md:w-1/2 w-full flex justify-center">
               <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/50 shadow-2xl overflow-hidden backdrop-blur-md relative">
                 <div className="h-10 border-b border-white/10 bg-white/5 flex items-center px-4 gap-2">
                   <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                   <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                   <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                 </div>
                 <div className="p-8 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-6 border border-indigo-500/30">
                      <Bot className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div className="h-4 w-2/3 bg-white/20 rounded mb-4" />
                    <div className="h-3 w-1/2 bg-white/10 rounded mb-10" />
                    
                    <div className="w-full bg-black/80 rounded-lg border border-white/10 p-4 font-mono text-sm text-left flex items-center justify-between group/code cursor-pointer hover:border-indigo-500/50 transition-colors">
                       <span className="text-white/70"><span className="text-pink-500">npx</span> create-cartwright</span>
                       <Zap className="w-4 h-4 text-indigo-400 opacity-0 group-hover/code:opacity-100 transition-opacity" />
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Bottom Tech Stack Note */}
        <div className="border-t border-white/10 pt-20 flex flex-col items-center text-center">
          <p className="text-white/40 mb-10 uppercase tracking-widest text-xs font-semibold">Vi arbejder primært med</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500 items-center">
            <div className="flex items-center gap-3 font-bold text-lg">
              <img src="https://cdn.simpleicons.org/nextdotjs/white" alt="Next.js Logo" className="h-6 w-6" /> 
              Next.js
            </div>
            <div className="flex items-center gap-3 font-bold text-lg">
              <img src="https://cdn.simpleicons.org/react/61DAFB" alt="React Logo" className="h-6 w-6" /> 
              React
            </div>
            <div className="flex items-center gap-3 font-bold text-lg">
              <img src="https://cdn.simpleicons.org/googlegemini/8B5CF6" alt="Google Gemini Logo" className="h-6 w-6" /> 
              Google Gemini
            </div>
            <div className="flex items-center gap-3 font-bold text-lg">
              <img src="https://cdn.simpleicons.org/vercel/white" alt="Vercel Logo" className="h-6 w-6" /> 
              Vercel
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center ${color}`}>
      <Check className="w-3 h-3" strokeWidth={3} />
    </div>
  );
}
