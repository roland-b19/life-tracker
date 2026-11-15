/** What a number field keeps from typed text: digits, one decimal separator (a comma counts as a dot), and for decimals a leading minus. */
export function cleanNumberInput(text: string, integer: boolean): string {
  if (integer) return text.replace(/[^0-9]/g, "");
  const t = text.replace(",", ".").replace(/[^0-9.-]/g, "");
  const dot = t.indexOf(".");
  const unsigned = (dot < 0 ? t : t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "")).replace(/(?!^)-/g, "");
  return unsigned;
}

/** The text a number field shows: the user types and reads a decimal comma, the value stays a dot. */
export const showDecimal = (value: string) => value.replace(".", ",");
