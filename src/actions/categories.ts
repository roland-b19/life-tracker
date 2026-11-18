"use server";

import { requireUser } from "@/server/auth";
import { addCategory, deleteCategory, renameCategory, reorderCategories, revertCategory } from "@/lib/categories";
import { categoryNameSchema, renameCategorySchema, reorderCategoriesSchema, revertCategorySchema } from "@/lib/validations/categories";
import { Refusal, respond } from "@/lib/validations/result";

export async function addCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const { scope, name } = categoryNameSchema.parse(rawInput);
    if (!(await addCategory(userId, scope, name))) throw new Refusal(`"${name}" already exists.`);
    return { name };
  });
}

export async function renameCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const { scope, from, to } = renameCategorySchema.parse(rawInput);
    const change = await renameCategory(userId, scope, from, to);
    if (!change) throw new Refusal("Category not found.");
    return { change };
  });
}

export async function deleteCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const { scope, name } = categoryNameSchema.parse(rawInput);
    const change = await deleteCategory(userId, scope, name);
    if (!change) throw new Refusal("Category not found.");
    return { change };
  });
}

export async function revertCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const { scope, ...input } = revertCategorySchema.parse(rawInput);
    await revertCategory(userId, scope, input);
    return {};
  });
}

export async function reorderCategoriesAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const { scope, names } = reorderCategoriesSchema.parse(rawInput);
    await reorderCategories(userId, scope, names);
    return {};
  });
}
