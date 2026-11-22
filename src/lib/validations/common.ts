import { z } from "zod";
import { roundTo } from "@/lib/number-format";

/** A real calendar day, "YYYY-MM-DD" (rejects 2026-13-45 and 2026-02-30, which a plain regex lets through). */
export const isoDate = z.iso.date("Invalid date format (YYYY-MM-DD)");

/** Whether a text has a character the user can see: zero-width characters and spaces alone do not count. */
export const visible = (text: string) => /[^\s\u200B-\u200D\u2060\uFEFF]/.test(text);

/** Any 8-4-4-4-12 hex id Postgres accepts for a uuid column; stops a malformed id from reaching the driver as a 500. */
export const uuid = z.guid("Invalid id");

/**
 * An add's own id, made on the device (`crypto.randomUUID()`) and optional (D-040). The insert uses it with
 * `on conflict do nothing` and answers success either way, so an add sent twice (a double tap, a retry after a lost
 * reply) is one row. Without it the database makes the id.
 */
export const newId = uuid.optional();

/**
 * Whether a number has at most two decimals (the tables keep two): it lies within float noise of its nearest hundredth
 * (`roundTo`). 78.4 * 100 is 7840.000000000001, so Number.isInteger(value * 100) would refuse 78.4.
 */
export const twoDecimals = (value: number) => Math.abs(value - roundTo(value, 2)) * 100 < 1e-6;
/** What a number with more than two decimals answers, in the forms and on the server. */
export const TWO_DECIMALS = "Maximum two decimal places";

/** What a date or time after now answers (a weigh-in, a logged set, a task's or wish's time). */
export const FUTURE_DATE = "Date cannot be in the future";

/** What an edit that changes nothing answers (it sends only what changed, D-040). */
export const NOTHING_TO_SAVE = "Nothing to save";
