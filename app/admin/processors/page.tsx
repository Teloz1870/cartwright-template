import { brand } from "@/brand.config";
import { getLegalStatus } from "./actions";
import { LegalPagesPanel } from "./LegalPagesPanel";

export const dynamic = "force-dynamic";

export default async function AdminProcessorsPage() {
  const legal = await getLegalStatus();
  const processors = brand.policies.processors;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Databehandlere & GDPR</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Processor-register (GDPR art. 28) + status på juridiske sider. Registret
          redigeres i <code className="rounded bg-sol-ink/5 px-1">brand.config.ts</code>{" "}
          (<code className="rounded bg-sol-ink/5 px-1">policies.processors</code>).
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-black text-sol-ink">
          Processor-register ({processors.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border-2 border-sol-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-sol-sand text-xs uppercase tracking-wide text-sol-muted">
              <tr>
                <th className="px-3 py-2">Processor</th>
                <th className="px-3 py-2">Formål</th>
                <th className="px-3 py-2">Delt data</th>
                <th className="px-3 py-2">DPA</th>
              </tr>
            </thead>
            <tbody>
              {processors.map((p) => (
                <tr key={p.name} className="border-t border-sol-ink/10">
                  <td className="px-3 py-2 font-bold text-sol-ink">{p.name}</td>
                  <td className="px-3 py-2 text-sol-ink">{p.purpose}</td>
                  <td className="px-3 py-2 text-sol-muted">{p.data}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        p.dpa
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {p.dpa ? "ja" : "mangler"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <LegalPagesPanel initial={legal} />
    </div>
  );
}
