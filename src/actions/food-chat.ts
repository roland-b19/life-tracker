"use server";

import { z } from "zod";
import { toISODate } from "@/lib/format-date";
import { isoDate } from "@/lib/validations/common";
import { Refusal, respond } from "@/lib/validations/result";
import { ONLY_TODAY_AND_YESTERDAY } from "@/lib/validations/food";
import { metricDayEditable } from "@/lib/rules";
import { requireUser } from "@/server/auth";
import { assertClaudeEnabled } from "@/lib/features";
import { sendFoodChatMessage } from "@/lib/food-ai-chat";
import { getDailyFoodSummary } from "@/lib/food";

const chatInputSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20),
  date: isoDate,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export async function sendFoodChatMessageAction(input: z.input<typeof chatInputSchema>) {
  assertClaudeEnabled();
  return respond(async () => {
    const userId = await requireUser();
    const { message, history, date, time } = chatInputSchema.parse(input);
    // Same rule as logging a meal by hand: the Assistant may not write into older days.
    if (!metricDayEditable(date, toISODate())) throw new Refusal(ONLY_TODAY_AND_YESTERDAY);

    // Only the last 10 turns go to the model: enough for follow-ups, bounded in size.
    const result = await sendFoodChatMessage(userId, message, history.slice(-10), { date, time });

    return {
      reply: result.reply,
      meals: result.meals,
      leftOut: result.leftOut,
      freshSummary: result.meals.length ? await getDailyFoodSummary(userId, date) : null,
    };
  });
}
