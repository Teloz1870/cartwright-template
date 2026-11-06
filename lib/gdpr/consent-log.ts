import "server-only";

import { withAudit } from "@/lib/audit";

/**
 * Server-side logging af consent-beslutninger til AuditLog (ansvarlighed,
 * art. 7(1)). Genbruger withAudit ("system:consent" actor) så requestId +
 * skrivning håndteres ét sted. Fail-soft: en logging-fejl må aldrig fejle
 * brugerens consent-flow.
 *
 * NB: endpointet /api/consent/log er klart til at blive kaldt fra
 * ConsentBanner; selve banner-wiringen er en opfølgning (rører consent-UI).
 */

export type ConsentDecision = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
};

export async function logConsentDecision(
  decision: ConsentDecision,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  try {
    await withAudit(
      {
        actor: "system:consent",
        tool: "consent.record",
        args: decision,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
      async () => decision,
    );
  } catch (err) {
    console.error("[consent-log] kunne ikke logge consent:", err);
  }
}
