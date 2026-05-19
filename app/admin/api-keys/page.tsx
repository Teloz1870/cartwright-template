import ApiKeyForm from "./ApiKeyForm";
import RevokeButton from "./RevokeButton";
import { listApiKeys } from "./actions";
import { brand } from "@/brand.config";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminApiKeysPage() {
  const keys = await listApiKeys();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">API-keys</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Bearer-keys til ekstern AI-adgang. Hver key bærer en liste af scopes
          der bestemmer hvilke tools den må kalde. Du ser plaintext ÉN gang —
          ved oprettelse. Gem den straks et sikkert sted.
        </p>
      </header>

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-cream p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-black text-sol-ink">Opret ny key</h2>
        <ApiKeyForm />
      </section>

      <section className="sol-card-elevated">
        <div className="border-b border-sol-ink/10 px-5 py-4">
          <h2 className="text-xl font-black text-sol-ink">
            Eksisterende keys ({keys.length})
          </h2>
        </div>

        {keys.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen API-keys oprettet endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Navn</th>
                  <th className="px-5 py-3 font-black">Scopes</th>
                  <th className="px-5 py-3 font-black">Sidst brugt</th>
                  <th className="px-5 py-3 font-black">Oprettet</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3 text-right font-black">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {keys.map((key) => {
                  const scopes = JSON.parse(key.scopes) as string[];
                  const revoked = key.revokedAt !== null;
                  return (
                    <tr key={key.id} className={revoked ? "opacity-50" : ""}>
                      <td className="px-5 py-3 font-bold text-sol-ink">
                        {key.name}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {scopes.map((s) => (
                            <code
                              key={s}
                              className="rounded bg-sol-sand px-1.5 py-0.5 font-mono text-[10px] text-sol-ink"
                            >
                              {s}
                            </code>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-sol-muted">
                        {key.lastUsedAt
                          ? dateFormatter.format(key.lastUsedAt)
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-sol-muted">
                        {dateFormatter.format(key.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        {revoked ? (
                          <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
                            Revokeret
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                            Aktiv
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {!revoked && (
                          <RevokeButton id={key.id} name={key.name} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6">
        <h2 className="mb-3 text-lg font-black text-sol-ink">
          Sådan bruger du en key
        </h2>
        <p className="mb-3 text-sm text-sol-ink">
          Med en aktiv key kan du kalde alle registrerede tools via REST:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-sol-ink px-4 py-3 text-xs leading-relaxed text-white">
          {`curl -X POST ${brand.url}/api/v1/tools/products.search \\
  -H "Authorization: Bearer sb_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"q": "aviator", "inStock": true, "limit": 5}'`}
        </pre>
        <p className="mt-3 text-xs text-sol-muted">
          Tool-katalog tilgængeligt på{" "}
          <code className="rounded bg-white px-1.5 py-0.5">/api/v1/tools</code>{" "}
          (offentligt, ingen auth).
        </p>
      </section>
    </div>
  );
}
