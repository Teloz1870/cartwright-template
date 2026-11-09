import "server-only";

/**
 * B3 static seam variant of lib/orders/paid-hooks.ts — the paid-order hooks
 * WITHOUT the shipmondo plugin. The materializer copies this file over
 * `lib/orders/paid-hooks.ts` when the plugin is not in the profile; NOTHING
 * imports it in the shipped engine. No optional module listens, so there is
 * nothing to schedule.
 */
export function schedulePaidOrderHooks(orderId: string): void {
  void orderId;
}
