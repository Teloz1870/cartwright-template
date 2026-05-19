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
  if (!record) return { ok: false, reason: "Ukendt rabatkode" };
  if (!record.active) return { ok: false, reason: "Rabatkoden er ikke aktiv" };
  if (record.validUntil && record.validUntil < now) {
    return { ok: false, reason: "Rabatkoden er udløbet" };
  }
  if (record.usageLimit !== null && record.usageCount >= record.usageLimit) {
    return { ok: false, reason: "Rabatkoden er opbrugt" };
  }
  return { ok: true, type: record.type, value: record.value };
}
