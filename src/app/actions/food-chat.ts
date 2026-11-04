"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { sendFoodChatMessage, ChatMessage } from "@/lib/food-ai-chat";
import { getDailyFoodSummary, getShoppingList } from "@/lib/food";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op in test runner
  }
}

export async function sendFoodChatMessageAction(
  message: string,
  history: ChatMessage[] = [],
  currentDate?: string,
) {
  const userId = await requireUser();
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Message cannot be empty");
  }

  const result = await sendFoodChatMessage(userId, message.trim(), history);

  let freshSummary = null;
  let freshShoppingList = null;

  if (result.toolExecuted?.name === "log_meal") {
    const today = currentDate || new Date().toISOString().slice(0, 10);
    freshSummary = await getDailyFoodSummary(userId, today);
    safeRevalidate("/food");
  } else if (result.toolExecuted?.name === "add_shopping_item") {
    freshShoppingList = await getShoppingList(userId);
    safeRevalidate("/food");
  }

  return {
    success: true,
    reply: result.reply,
    toolExecuted: result.toolExecuted,
    freshSummary,
    freshShoppingList,
  };
}
