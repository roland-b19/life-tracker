"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { addBusinessIncome, deleteBusinessIncome } from "@/lib/business";
import { CreateBusinessIncomeInput, createBusinessIncomeSchema } from "@/lib/validations/business";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op in test runner
  }
}

export async function addBusinessIncomeAction(rawInput: CreateBusinessIncomeInput) {
  const userId = await requireUser();
  const validated = createBusinessIncomeSchema.parse(rawInput);
  const income = await addBusinessIncome(userId, validated);
  safeRevalidate("/business");
  return { success: true, income };
}

export async function deleteBusinessIncomeAction(incomeId: string) {
  const userId = await requireUser();
  if (!incomeId || typeof incomeId !== "string") {
    throw new Error("Invalid income ID");
  }
  const deleted = await deleteBusinessIncome(userId, incomeId);
  safeRevalidate("/business");
  return { success: true, deleted };
}
