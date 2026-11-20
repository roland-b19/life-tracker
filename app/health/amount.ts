import { formatNumber } from "@/lib/number-format";

/**
 * A measured amount (grams, kilograms) in the app's number format with at most `decimals` decimals and no trailing
 * zeros: 72.4 shows "72,4", 80 shows "80", 1500.25 shows "1.500,25".
 */
export function formatAmount(value: number | string, decimals: number): string {
  const n = Number(value);
  let shown = decimals;
  while (shown > 0 && Math.round(n * 10 ** shown) % 10 === 0) shown--;
  return formatNumber(n, shown);
}
