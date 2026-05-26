import { brand } from "@/brand.config";

/**
 * Formaterer et beløb i øre/cents til en valutastreng baseret på
 * `brand.policies.currency`. Bevarer funktionsnavnet (formatPriceDkk) for
 * backward-kompat — cartwright-forks med non-DKK currency kan rename
 * senere i en breaking-cleanup-PR.
 *
 * fx 29900 + DKK → "299 kr", 2990 + EUR → "29,90 EUR"
 */
export function formatPriceDkk(oere: number): string {
  const major = oere / 100;
  const hasMinor = oere % 100 !== 0;
  const formatted = new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: hasMinor ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(major);
  const symbol = brand.policies.currency === "DKK" ? "kr" : brand.policies.currency;
  return `${formatted} ${symbol}`;
}
