/**
 * Security-regression-test for plan-først chat-checkout.
 *
 * Verificerer at ALLE veje AI kan forsøge at omgå plan-først er blokeret:
 *  1. AI sender confirm:true direkte i args → blokeret af stripConfirm
 *  2. AI gætter et fake confirmation-token → blokeret af random UUID + Map-lookup
 *  3. Klient sender token fra session A i request fra session B → blokeret af ownerId
 *  4. Klient ændrer args efter token-udstedelse (fx ændrer email til offer) → argsHash mismatch
 *  5. Klient bruger samme token 2x (replay) → blokeret af one-time-delete
 *  6. AI spammer 100 fake-confirmations for at fylde Map → blokeret af per-owner-loft
 *
 * Hvis nogen af disse tests bryder, er der en åben sikkerhedsdør i
 * chat-checkout. Disse er FAIL-CLOSED tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createPendingConfirmation,
  consumeConfirmation,
  stripConfirm,
  hashArgs,
  ConfirmationLimitExceeded,
  _resetPendingConfirmations,
} from "@/lib/confirmation-tokens";

describe("chat-checkout security regression", () => {
  beforeEach(() => {
    _resetPendingConfirmations();
  });

  it("[1] stripConfirm fjerner top-level confirm:true før hash", () => {
    const aiCheatedArgs = { email: "x@y.dk", confirm: true };
    const stripped = stripConfirm(aiCheatedArgs);
    expect(stripped).not.toHaveProperty("confirm");

    // Server hasher de cleaned args; AI's confirm:true påvirker IKKE hash
    const cleanArgs = { email: "x@y.dk" };
    expect(hashArgs("orders.create", stripped)).toBe(
      hashArgs("orders.create", cleanArgs),
    );
  });

  it("[2] fake token AI kan gætte returnerer reason: ukendt", () => {
    const result = consumeConfirmation({
      token: "00000000-0000-0000-0000-000000000000",
      tool: "orders.create",
      toolArgs: { email: "x@y.dk" },
      ownerId: "sid-A",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Ukendt|udløbet/i);
  });

  it("[3] cross-session attack — token fra session A i session B blokeres", () => {
    const token = createPendingConfirmation({
      tool: "orders.create",
      toolArgs: { email: "victim@x.dk" },
      ownerId: "sid-A",
    });

    const attack = consumeConfirmation({
      token,
      tool: "orders.create",
      toolArgs: { email: "victim@x.dk" },
      ownerId: "sid-B-attacker",
    });

    expect(attack.ok).toBe(false);
    if (!attack.ok) expect(attack.reason).toMatch(/anden session/i);
  });

  it("[4] args-tampering efter token-udstedelse blokeres", () => {
    const token = createPendingConfirmation({
      tool: "orders.create",
      toolArgs: { email: "owner@x.dk", shippingAddress: "Mit hus" },
      ownerId: "sid-A",
    });

    const tampered = consumeConfirmation({
      token,
      tool: "orders.create",
      // Email ændret efter token-udstedelse — angriber prøver at få varer
      // sendt til sig selv via stjålet token
      toolArgs: { email: "attacker@x.dk", shippingAddress: "Mit hus" },
      ownerId: "sid-A",
    });

    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.reason).toMatch(/Args er ændret/i);
  });

  it("[5] replay-attack — samme token 2x blokeres (one-time-use)", () => {
    const token = createPendingConfirmation({
      tool: "orders.create",
      toolArgs: { email: "x@y.dk" },
      ownerId: "sid-A",
    });

    const first = consumeConfirmation({
      token,
      tool: "orders.create",
      toolArgs: { email: "x@y.dk" },
      ownerId: "sid-A",
    });
    expect(first.ok).toBe(true);

    const replay = consumeConfirmation({
      token,
      tool: "orders.create",
      toolArgs: { email: "x@y.dk" },
      ownerId: "sid-A",
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toMatch(/Ukendt|udløbet/i);
  });

  it("[6] per-owner-loft — 6 tokens i samme session blokeres", () => {
    // 5 første tokens kan oprettes
    for (let i = 0; i < 5; i++) {
      const t = createPendingConfirmation({
        tool: "orders.create",
        toolArgs: { email: `t${i}@x.dk` },
        ownerId: "spammer-sid",
      });
      expect(t).toBeTruthy();
    }

    // 6. forsøg → ConfirmationLimitExceeded
    expect(() =>
      createPendingConfirmation({
        tool: "orders.create",
        toolArgs: { email: "t6@x.dk" },
        ownerId: "spammer-sid",
      }),
    ).toThrow(ConfirmationLimitExceeded);
  });

  it("[7] cross-tool attack — token udstedt til orders.create kan ikke consume'es som andet tool", () => {
    const token = createPendingConfirmation({
      tool: "orders.create",
      toolArgs: { email: "x@y.dk" },
      ownerId: "sid-A",
    });

    const wrongTool = consumeConfirmation({
      token,
      tool: "discounts.create",
      toolArgs: { email: "x@y.dk" },
      ownerId: "sid-A",
    });

    expect(wrongTool.ok).toBe(false);
    if (!wrongTool.ok) expect(wrongTool.reason).toMatch(/andet tool/i);
  });
});
