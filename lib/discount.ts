export type DiscountCodeRecord = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  validUntil: Date | null;
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
};
export type DiscountValidation =
  | { ok: true; type: "percent" | "fixed"; value: number }
  | { ok: false; reason: string };

/** Validerer en rabatkode-record mod reglerne. `now` injiceres for testbarhed. */
export function validateDiscountCode(
  record: DiscountCodeRecord | null,
  now: Date,
): DiscountValidation {
  if (!record) return { ok: false, reason: "Unknown discount code" };
  if (!record.active) return { ok: false, reason: "The discount code is not active" };
  if (record.validUntil && record.validUntil < now) {
    return { ok: false, reason: "The discount code has expired" };
  }
  if (record.usageLimit !== null && record.usageCount >= record.usageLimit) {
    return { ok: false, reason: "The discount code has been fully used" };
  }
  return { ok: true, type: record.type, value: record.value };
}
