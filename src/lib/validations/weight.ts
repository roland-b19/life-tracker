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
      .refine((value) => Number.isInteger(value * 100), "Maximum two decimal places."),
  })
  .strict();
