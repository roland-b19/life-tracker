"use server";

import { requireUser } from "@/server/auth";
import { addCategory, deleteCategory, renameCategory } from "@/lib/categories";
import { categoryNameSchema, renameCategorySchema } from "@/lib/validations/categories";

// No revalidatePath: the clients keep their own state, like the other list actions.

export async function addCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { scope, name } = categoryNameSchema.parse(rawInput);
  return { success: await addCategory(userId, scope, name), name };
}

export async function renameCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { scope, from, to } = renameCategorySchema.parse(rawInput);
  return { success: await renameCategory(userId, scope, from, to) };
}

export async function deleteCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { scope, name } = categoryNameSchema.parse(rawInput);
  return { success: await deleteCategory(userId, scope, name) };
}
