import { describe, expect, it } from "vitest";
import { categorySchema } from "@/lib/validations/categories";
import { addShoppingItemSchema, logMealSchema, shoppingCategorySchema } from "@/lib/validations/food";
import { addCustomExerciseSchema, saveSplitDaySchema } from "@/lib/validations/gym";

// Zero-width characters survive trim(), so a name made only of them would show as an empty row.
const ghost = "​​";

describe("names the user can see", () => {
  it("refuses a name made only of zero-width characters", () => {
    expect(categorySchema.safeParse(ghost).success).toBe(false);
    expect(shoppingCategorySchema.safeParse(ghost).success).toBe(false);
    expect(addShoppingItemSchema.safeParse({ name: ghost }).success).toBe(false);
    expect(logMealSchema.safeParse({ date: "2026-11-15", name: ghost, calories: 1, protein: 0, carbs: 0, fat: 0 }).success).toBe(false);
    expect(addCustomExerciseSchema.safeParse({ name: `${ghost}ab`.slice(0, 2), muscleGroup: "other", equipmentType: "cable" }).success).toBe(false);
    const day = { id: "11111111-1111-4111-8111-111111111111", name: ghost, isRest: true, exercises: [] };
    expect(saveSplitDaySchema.safeParse(day).success).toBe(false);
  });

  it("still takes a normal name", () => {
    expect(categorySchema.parse(" Gifts ")).toBe("gifts");
    expect(addShoppingItemSchema.parse({ name: "Milk" }).name).toBe("Milk");
    expect(saveSplitDaySchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", name: "Push", isRest: true, exercises: [] }).success).toBe(true);
  });
});
