/*
 * The one number format of the app (D-037): a dot between thousands and a comma before the decimals ("1.234,5").
 * Values stay machine numbers or machine text ("1234.5"); only what people read and type uses this format.
 */

export const NOT_A_NUMBER = "Must be a number";
export const NOT_WHOLE = "Must be a whole number";

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** A number as people read it, with exactly `decimals` decimals: `formatNumber(1234.5, 2)` is "1.234,50". */
export function formatNumber(value: number | string, decimals = 0): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "";
  const [whole, fraction] = Math.abs(n).toFixed(decimals).split(".");
  const sign = n < 0 && /[1-9]/.test(whole + (fraction ?? "")) ? "-" : "";
  return sign + group(whole) + (fraction ? `,${fraction}` : "");
}

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

/**
 * The text a number field shows for a value the page gave it ("72.40" shows "72,40", "1500" shows "1.500"). Text that
 * is not a machine number (a wrong entry the field kept) is shown as it is.
 */
export function showNumberInput(value: string): string {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value);
  if (!m) return value;
  return m[1] + group(m[2]) + (m[3] === undefined ? "" : `,${m[3]}`);
}

export type ParsedNumber = { ok: true; value: string; display: string } | { ok: false; error: string };

/**
 * Reads what someone typed in a number field. A comma, or a dot that is not a thousand dot, is the decimal separator;
 * thousand dots are allowed where they belong and are put back for the display. Anything else is an error, never
 * silently dropped. `value` is the machine text ("1234.5", "" for an empty field), `display` the text to show
 * ("1.234,5"). `integer`: a whole-number field, where a decimal separator is an error too.
 */
export function parseNumberInput(text: string, { integer = false }: { integer?: boolean } = {}): ParsedNumber {
  const t = text.trim();
  const sign = t.startsWith("-") ? "-" : "";
  const rest = t.slice(sign.length);
  let whole: string;
  let fraction: string | undefined;
  if (rest.includes(",")) {
    const parts = rest.split(",");
    if (parts.length > 2) return { ok: false, error: NOT_A_NUMBER };
    [whole, fraction] = parts;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(rest)) {
    // "1.500" is fifteen hundred: the field itself shows thousand dots
    whole = rest;
  } else if (rest.includes(".")) {
    const dot = rest.lastIndexOf(".");
    whole = rest.slice(0, dot);
    fraction = rest.slice(dot + 1);
  } else {
    whole = rest;
  }
  if (!/^(\d*|\d{1,3}(\.\d{3})+)$/.test(whole) || (fraction !== undefined && !/^\d*$/.test(fraction))) {
    return { ok: false, error: NOT_A_NUMBER };
  }
  if (integer && fraction !== undefined) return { ok: false, error: NOT_WHOLE };
  const digits = whole.replace(/\./g, "");
  const value = digits === "" && !fraction ? "" : sign + (digits || "0") + (fraction ? `.${fraction}` : "");
  return { ok: true, value, display: sign + group(digits) + (fraction === undefined ? "" : `,${fraction}`) };
}

/**
 * The text of a number field after an edit, ready for `parseNumberInput`, with the caret's place in it. The dots the
 * field showed are its own thousand dots, so they go; a dot just typed is the decimal and becomes a comma. `inserted`:
 * the text the edit put just before `caret` (null for a deletion). When it is the whole text (pasted or filled in),
 * the text is read as it is.
 */
export function editedNumberText(text: string, inserted: string | null, caret: number): { text: string; caret: number } {
  if (inserted !== null && inserted === text) return { text, caret: text.length };
  const start = inserted === null ? caret : Math.max(0, caret - inserted.length);
  const before = text.slice(0, start).replace(/\./g, "");
  const typed = text.slice(start, caret).replace(/\./g, ",");
  return { text: before + typed + text.slice(caret).replace(/\./g, ""), caret: before.length + typed.length };
}

/** Where the caret goes in `display` so that `kept` characters other than thousand dots come before it. */
export function caretInDisplay(display: string, kept: number): number {
  let i = 0;
  for (let seen = 0; i < display.length && seen < kept; i++) if (display[i] !== ".") seen++;
  return i;
}
