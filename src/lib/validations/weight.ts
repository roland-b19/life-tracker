import { z } from "zod";

export const weightInput = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kilograms: z
      .number()
      .finite()
      .min(20)
      .max(500)
      .refine((value) => Number.isInteger(value * 100), "Maximum two decimal places."),
  })
  .strict();
