"use server";

import { requireUser } from "@/server/auth";
import { addCategory, deleteCategory, renameCategory, revertCategory } from "@/lib/categories";
import { categoryNameSchema, renameCategorySchema, revertCategorySchema } from "@/lib/validations/categories";

// No revalidatePath: the clients keep their own state, like the other list actions.

export async function addCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { scope, name } = categoryNameSchema.parse(rawInput);
  return { success: await addCategory(userId, scope, name), name };
}

export async function renameCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { scope, from, to } = renameCategorySchema.parse(rawInput);
  const change = await renameCategory(userId, scope, from, to);
  return { success: change !== null, change };
}

export async function deleteCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { scope, name } = categoryNameSchema.parse(rawInput);
  const change = await deleteCategory(userId, scope, name);
  return { success: change !== null, change };
}

export async function revertCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { scope, ...input } = revertCategorySchema.parse(rawInput);
  await revertCategory(userId, scope, input);
  return { success: true };
}
