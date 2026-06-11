import ApiKeyForm from "./ApiKeyForm";
import RevokeButton from "./RevokeButton";
import { listApiKeys } from "./actions";
import { brand } from "@/brand.config";
import {
  AdminPageHeader,
  AdminCard,
  AdminBadge,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminApiKeysPage() {
  const keys = await listApiKeys();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="API-keys"
        subtitle="Bearer keys for external AI access. Each key carries a list of scopes that determine which tools it may call. You see the plaintext ONCE - ved oprettelse. Gem den straks et sikkert sted."
      />

      <AdminCard title="Opret ny key">
        <ApiKeyForm />
      </AdminCard>

      <AdminCard title={`Eksisterende keys (${keys.length})`} padding="none">
        {keys.length === 0 ? (
          <EmptyState title="Ingen API-keys oprettet endnu." />
        ) : (
          <AdminTable>
            <AdminThead>
              <AdminTr>
                <AdminTh>Navn</AdminTh>
                <AdminTh>Scopes</AdminTh>
                <AdminTh>Sidst brugt</AdminTh>
                <AdminTh>Oprettet</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh align="right">Handling</AdminTh>
              </AdminTr>
            </AdminThead>
            <AdminTbody>
              {keys.map((key) => {
                const scopes = JSON.parse(key.scopes) as string[];
                const revoked = key.revokedAt !== null;
                return (
                  <AdminTr key={key.id} className={revoked ? "opacity-50" : ""}>
                    <AdminTd>{key.name}</AdminTd>
                    <AdminTd>
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
                    </AdminTd>
                    <AdminTd>
                      {key.lastUsedAt
                        ? dateFormatter.format(key.lastUsedAt)
                        : "—"}
                    </AdminTd>
                    <AdminTd>{dateFormatter.format(key.createdAt)}</AdminTd>
                    <AdminTd>
                      {revoked ? (
                        <AdminBadge tone="critical">Revokeret</AdminBadge>
                      ) : (
                        <AdminBadge tone="success">Aktiv</AdminBadge>
                      )}
                    </AdminTd>
                    <AdminTd align="right">
                      {!revoked && <RevokeButton id={key.id} name={key.name} />}
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </AdminTbody>
          </AdminTable>
        )}
      </AdminCard>

      <AdminCard title="How to use a key">
        <p className="mb-3 text-sm text-sol-ink">
          Med en aktiv key kan du kalde alle registrerede tools via REST:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-sol-ink px-4 py-3 text-xs leading-relaxed text-sol-cream">
          {`curl -X POST ${brand.url}/api/v1/tools/products.search \\
  -H "Authorization: Bearer sb_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"q": "aviator", "inStock": true, "limit": 5}'`}
        </pre>
        <p className="mt-3 text-xs text-sol-muted">
          Tool catalog available at{" "}
          <code className="rounded bg-sol-sand px-1.5 py-0.5">/api/v1/tools</code>{" "}
          (offentligt, ingen auth).
        </p>
      </AdminCard>
    </div>
  );
}
