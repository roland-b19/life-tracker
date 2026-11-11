import { z } from "zod";
import { isoDate } from "./common";

export const weightInput = z
  .object({
    date: isoDate,
    kilograms: z
      .number()
      .finite()
      .min(20)
      .max(500)
      // 78.4 * 100 is 7840.000000000001, so compare against the nearest hundredth instead of Number.isInteger.
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Maximum two decimal places."),
  })
  .strict();
