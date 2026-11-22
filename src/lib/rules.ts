import { addDays } from "./format-date";

// Plain rules the browser needs as well as the server. They live here, away from the zod schemas, so client code
// that imports them does not pull the whole validation library into the page's JavaScript.

/** Meals (by hand or from the assistant's chat) can be added or changed for today and yesterday only; older days are history. */
export const metricDayEditable = (date: string, today: string) => date <= today && date >= addDays(today, -1);

export type Priority = "low" | "medium" | "high";

/** Priority is derived from the price: under 250 low, under 750 medium, otherwise high. */
export function priorityForPrice(price: number): Priority {
  return price < 250 ? "low" : price < 750 ? "medium" : "high";
}
