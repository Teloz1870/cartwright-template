import SmartContactForm from "@/components/SmartContactForm";

export const metadata = {
  title: "Kontakt & Kundeservice",
};

export default function KontaktPage() {
  return (
    <div className="min-h-screen bg-black pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-16">
        <div>
          <h1 className="text-6xl sm:text-8xl font-black text-white tracking-tighter mb-6 leading-[1.1]">
            Kontakt <span className="text-indigo-400">Os</span>
          </h1>
          <p className="text-xl text-white/60 font-light leading-relaxed mb-10 max-w-2xl">
            Har du spørgsmål til Cartwright eller brug for hjælp til din butik? 
            Vores AI-assistent og menneskelige eksperter sidder klar til at hjælpe dig.
          </p>

          <div className="bg-[#111] p-6 rounded-2xl border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4">Virksomhedsoplysninger</h2>
            <address className="not-italic text-sm text-white/60 space-y-2">
              <p>
                <strong className="text-white block mb-1">Ejet og drevet af:</strong>
                Teloz ApS<br />
                Danmark
              </p>
              <p className="pt-2">
                <a href="https://teloz.net" target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-400 hover:text-indigo-300 hover:underline">
                  Læs mere på teloz.net
                </a>
              </p>
            </address>
          </div>
        </div>
        
        <div>
          <SmartContactForm />
        </div>
      </div>
    </div>
  );
}
