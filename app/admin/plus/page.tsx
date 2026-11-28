import { requireAdmin } from "@/lib/admin";
import { getBrand } from "@/lib/brand";
import { getPlusStatus, type PlusStatus } from "@/lib/cartwright-plus";
import {
  AdminPageHeader,
  AdminCard,
  AdminBadge,
  AdminButton,
  type BadgeTone,
} from "@/components/admin/ui";
import { ActivateButton } from "./ActivateButton";

export const dynamic = "force-dynamic";

/**
 * Cartwright Plus — membership activation & status.
 *
 * v1 is env-only (no schema change): the key lives in `CARTWRIGHT_PLUS_KEY`,
 * this page shows verification status and, when the key verifies as active,
 * offers the one-click flip of the `cartwrightPlus` runtime flag (same
 * audited override path as /admin/features). Status is resolved fresh on
 * every page load — no caching layer in v1.
 */

const STATUS_META: Record<PlusStatus, { tone: BadgeTone; label: string; note: string }> = {
  unconfigured: {
    tone: "neutral",
    label: "Not configured",
    note: "No Plus access key found. Set the CARTWRIGHT_PLUS_KEY environment variable to get started.",
  },
  invalid: {
    tone: "critical",
    label: "Invalid key",
    note: "The configured key failed offline verification.",
  },
  active: {
    tone: "success",
    label: "Active",
    note: "Key verified offline and cartwright.app confirms the membership is active.",
  },
  grace: {
    tone: "warning",
    label: "Grace period",
    note: "The membership is in a payment grace period. Plus stays available while the payment retries.",
  },
  inactive: {
    tone: "attention",
    label: "Inactive",
    note: "cartwright.app reports this membership as canceled or unpaid. Your site keeps running — only Plus membership services (support, guidance, private downloads) pause until renewal.",
  },
  offline: {
    tone: "info",
    label: "Offline (key valid)",
    note: "The key is cryptographically valid but cartwright.app could not be reached to confirm subscription status. Nothing is disabled — try again later.",
  },
};

const OFFLINE_REASON_TEXT: Record<string, string> = {
  "no-public-key":
    "This engine build does not have a Plus verification public key yet (placeholder active). Update the engine, or set CARTWRIGHT_PLUS_PUBLIC_KEY.",
  "bad-format": "The key does not look like a cw_plus_v1 key. Check for copy/paste truncation.",
  "bad-payload": "The key's payload could not be parsed. Request a reissued key from support.",
  "bad-signature": "The key's signature does not verify. Request a reissued key from support.",
};

const INCLUDED_TODAY: { title: string; detail: string }[] = [
  {
    title: "Priority email support",
    detail:
      "First response within one business day (weekdays), up to two active tickets per month, for one production repository.",
  },
  {
    title: "Release & security upgrade guidance",
    detail:
      "Upgrade guidance tailored to your recorded engine version (.cartwright/release.json), including security advisories.",
  },
  {
    title: "Cartwright Pro agent playbooks",
    detail:
      "The four industry playbooks plus a production-health checklist, delivered via your activation email.",
  },
  {
    title: "SEO/GEO Lab — beta access",
    detail:
      "Early access to the SEO/GEO experimentation lab (beta — not the full Autopilot yet).",
  },
];

export default async function AdminPlusPage() {
  await requireAdmin();

  const [result, brand] = await Promise.all([getPlusStatus(), getBrand()]);
  const meta = STATUS_META[result.status];
  const plusFlagOn = Boolean(brand.features.cartwrightPlus);
  const portalUrl = process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL?.trim() || null;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Cartwright Plus"
        subtitle="Plus is a membership — support, upgrade guidance and Pro playbooks — not a license. A canceled key never shuts down your site."
      />

      <AdminCard
        title="Membership status"
        actions={<AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-sol-muted">{meta.note}</p>
          {result.status === "invalid" && result.offlineReason && (
            <p className="text-sm text-sol-muted">
              {OFFLINE_REASON_TEXT[result.offlineReason] ?? result.offlineReason}
            </p>
          )}
          {result.keyPreview && (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-sol-muted">
                  Access key
                </dt>
                <dd className="font-mono text-sol-ink">{result.keyPreview}</dd>
              </div>
              {result.payload && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-sol-muted">
                    Issued
                  </dt>
                  <dd className="text-sol-ink">
                    {new Date(result.payload.issuedAt * 1000).toLocaleDateString("en-GB", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · plan {result.payload.plan} · key id {result.payload.kid}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="text-sm text-sol-muted">Plus features flag:</span>
            <AdminBadge tone={plusFlagOn ? "success" : "neutral"}>
              {plusFlagOn ? "On" : "Off"}
            </AdminBadge>
            {(result.status === "active" || result.status === "grace") && !plusFlagOn && <ActivateButton />}
          </div>
          {(result.status === "active" || result.status === "grace") && !plusFlagOn && (
            <p className="text-xs text-sol-muted">
              Your membership is verified. Enabling flips the <code>cartwrightPlus</code>{" "}
              runtime flag via the same audited path as /admin/features — it unlocks the
              Pro surfaces (e.g. SEO/GEO Lab) in this admin.
            </p>
          )}
        </div>
      </AdminCard>

      <AdminCard title="What Plus includes today">
        <ul className="flex flex-col divide-y divide-sol-ink/5">
          {INCLUDED_TODAY.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <div className="text-sm font-bold text-sol-ink">{item.title}</div>
              <p className="mt-0.5 text-xs text-sol-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-sol-muted">
          Cancel anytime — your site and all already-downloaded code keep running.
        </p>
      </AdminCard>

      <AdminCard title="Activate">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-sol-ink">
          <li>
            Purchase Plus at{" "}
            <a
              href="https://cartwright.app/pricing"
              target="_blank"
              rel="noreferrer"
              className="text-sol-accent underline"
            >
              cartwright.app/pricing
            </a>{" "}
            — your access key arrives on the success page and by email.
          </li>
          <li>
            Set the key as the <code className="font-mono text-xs">CARTWRIGHT_PLUS_KEY</code>{" "}
            environment variable in your deployment (e.g. Vercel project settings, or{" "}
            <code className="font-mono text-xs">.env.local</code> for local dev), then
            redeploy/restart.
          </li>
          <li>
            Reload this page — when the key verifies as active, the &ldquo;Enable Plus
            features&rdquo; button appears above.
          </li>
        </ol>
        <p className="mt-3 text-xs text-sol-muted">
          Lost your key? Email support and it will be reissued — keys are proof of
          membership, not copy protection.
        </p>
      </AdminCard>

      <AdminCard title="Billing">
        {portalUrl ? (
          <AdminButton href={portalUrl} variant="secondary" target="_blank" rel="noreferrer">
            Open billing portal
          </AdminButton>
        ) : (
          <p className="text-sm text-sol-muted">
            Manage billing and cancellation via the portal link in your purchase email.
          </p>
        )}
      </AdminCard>
    </div>
  );
}
