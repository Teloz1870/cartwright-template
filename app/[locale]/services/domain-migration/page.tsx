import LeadForm from "@/components/LeadForm";

export const metadata = {
  title: "Domæneflytning & Migration | Cartwright Services",
  description: "Få professionel hjælp til at flytte dit domæne sikkert og hurtigt for kun €199.",
};

export default function DomainMigrationPage() {
  return (
    <div className="min-h-screen bg-sol-cream text-sol-ink relative overflow-hidden">
      {/* Background Decorative Orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28 border-b border-sol-ink/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400 mb-4">
            Cartwright Services
          </p>
          <h1 className="text-4xl sm:text-7xl font-black tracking-tight mb-6 leading-tight">
            Sikker og Problemfri <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Domæneflytning
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-sol-muted max-w-2xl mx-auto font-light leading-relaxed">
            Vi håndterer al teknikken bag din domæneflytning, så du kan fokusere på din forretning uden unødvendig nedetid.
          </p>
        </div>
      </section>

      {/* Info & Form Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-start">
          
          {/* Værditilbud */}
          <div className="lg:col-span-7">
            <h2 className="text-3xl sm:text-4xl font-black text-sol-ink mb-8 tracking-tight">
              Hvad er inkluderet i migrationen?
            </h2>
            
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-lg text-sol-ink">Fuld Migration & Opsætning</h3>
                  <p className="text-sol-muted mt-1 text-sm leading-relaxed">Vi flytter dit domæne fra din nuværende udbyder til vores platform, uden du skal tænke på de tekniske detaljer.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-lg text-sol-ink">Garanti mod nedetid</h3>
                  <p className="text-sol-muted mt-1 text-sm leading-relaxed">Vi sikrer, at dine eksisterende DNS-indstillinger, e-mailadresser og routing overføres fejlfrit og uden afbrydelser.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-lg text-sol-ink">DNS-sikkerhed & Backup</h3>
                  <p className="text-sol-muted mt-1 text-sm leading-relaxed">Dine eksisterende DNS-zoner og records sikkerhedskopieres fuldstændigt, før flytningen sættes i værk.</p>
                </div>
              </div>
            </div>

            <div className="mt-12 p-8 bg-sol-sand border border-sol-ink/10 rounded-2xl relative overflow-hidden group shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />
              <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">Gennemskuelig Fast Pris</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-5xl sm:text-6xl font-black text-sol-ink">€199</span>
                <span className="text-sol-muted/50">/ engangsbeløb</span>
              </div>
              <p className="text-sm text-sol-muted/70 mt-4 leading-relaxed">Der er ingen skjulte gebyrer eller løbende omkostninger. Vi fakturerer først, når flytningen er 100% gennemført og bekræftet.</p>
            </div>
          </div>

          {/* Lead Form */}
          <div className="lg:col-span-5 sticky top-28">
            <LeadForm 
              title="Bestil Domæneflytning" 
              description="Udfyld formularen for at starte processen. Vi kontakter dig typisk indenfor 24 timer for at aftale detaljerne."
              defaultService="Domain Migration"
              services={["Domain Migration", "Ny Hjemmeside", "Andet"]}
            />
          </div>

        </div>
      </section>
    </div>
  );
}
