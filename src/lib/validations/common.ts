import { z } from "zod";

/** A real calendar day, "YYYY-MM-DD" (rejects 2026-13-45 and 2026-02-30, which a plain regex lets through). */
export const isoDate = z.iso.date("Invalid date format (YYYY-MM-DD)");

/** Whether a text has a character the user can see: zero-width characters and spaces alone do not count. */
export const visible = (text: string) => /[^\s\u200B-\u200D\u2060\uFEFF]/.test(text);

/** Any 8-4-4-4-12 hex id Postgres accepts for a uuid column; stops a malformed id from reaching the driver as a 500. */
export const uuid = z.guid("Invalid id");
