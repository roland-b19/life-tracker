import {
  addShoppingItem,
  getDailyFoodSummary,
  getNutritionTargets,
  getUserRecipes,
  logMeal,
} from "./food";
import {
  createShoppingItemSchema,
  logMealSchema,
} from "./validations/food";
import { z } from "zod";

export const FOOD_MCP_TOOLS = [
  {
    name: "log_meal",
    description:
      "Log a meal with estimated macronutrients and calories into the user's food journal. Values are flagged as estimated.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        mealType: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack"],
          description: "Type of meal",
        },
        name: {
          type: "string",
          description:
            "Meal title or description (e.g. '200g grilled chicken with 150g rice')",
        },
        calories: {
          type: "number",
          description: "Estimated total calories (kcal, 0-10000)",
        },
        protein: {
          type: "number",
          description: "Estimated protein in grams (0-1000)",
        },
        carbs: {
          type: "number",
          description: "Estimated carbohydrates in grams (0-1000)",
        },
        fat: {
          type: "number",
          description: "Estimated fat in grams (0-1000)",
        },
      },
      required: [
        "date",
        "mealType",
        "name",
        "calories",
        "protein",
        "carbs",
        "fat",
      ],
    },
  },
  {
    name: "get_daily_food_summary",
    description:
      "Get the user's nutrition totals, calorie/macro targets, water intake, and logged meals for a given date. (Note: body weight and steps are strictly excluded).",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_recipes",
    description:
      "Get the list of user's saved recipes with nutritional breakdown.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "add_shopping_item",
    description:
      "Add a grocery item or ingredient to the user's organized shopping list.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name (e.g. 'Greek Yogurt 10%')" },
        amount: { type: "number", description: "Quantity needed (e.g. 2)" },
        unit: { type: "string", description: "Unit of measurement (e.g. 'pcs', 'g', 'kg', 'l')" },
        category: {
          type: "string",
          enum: ["meat", "produce", "dairy", "bakery", "pantry", "other"],
          description: "Store section/category",
        },
      },
      required: ["name"],
    },
  },
];

export const FOOD_GEMINI_TOOLS = {
  functionDeclarations: FOOD_MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  })),
};

const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
});

export async function executeFoodAiTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  switch (toolName) {
    case "log_meal": {
      const parsed = logMealSchema.parse(args);
      const meal = await logMeal(userId, {
        ...parsed,
        isEstimated: true,
      });

      return {
        success: true,
        message: `Logged ${meal.name} (${meal.calories} kcal, ${meal.protein}g protein) for ${meal.date}. Marked as AI estimated.`,
        meal: {
          id: meal.id,
          date: meal.date,
          mealType: meal.mealType,
          name: meal.name,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          isEstimated: true,
        },
      };
    }

    case "get_daily_food_summary": {
      const { date } = dateParamSchema.parse(args);
      const [summary, targets] = await Promise.all([
        getDailyFoodSummary(userId, date),
        getNutritionTargets(userId),
      ]);

      // Strict quarantine: only return food & water metrics, NEVER weight or steps
      return {
        success: true,
        date,
        targets: {
          calories: targets.calories,
          proteinGrams: targets.proteinGrams,
          carbsGrams: targets.carbsGrams,
          fatGrams: targets.fatGrams,
          waterMl: targets.waterMl,
        },
        consumed: {
          calories: summary.totals.calories,
          proteinGrams: summary.totals.protein,
          carbsGrams: summary.totals.carbs,
          fatGrams: summary.totals.fat,
          waterMl: summary.metrics.waterMl,
        },
        remaining: {
          calories: Math.max(0, targets.calories - summary.totals.calories),
          proteinGrams: Math.max(0, targets.proteinGrams - summary.totals.protein),
          carbsGrams: Math.max(0, targets.carbsGrams - summary.totals.carbs),
          fatGrams: Math.max(0, targets.fatGrams - summary.totals.fat),
          waterMl: Math.max(0, targets.waterMl - summary.metrics.waterMl),
        },
        mealsCount: summary.meals.length,
        meals: summary.meals.map((m) => ({
          id: m.id,
          mealType: m.mealType,
          name: m.name,
          calories: m.calories,
          protein: m.protein,
          carbs: m.carbs,
          fat: m.fat,
        })),
      };
    }

    case "get_recipes": {
      const recipesList = await getUserRecipes(userId);
      return {
        success: true,
        recipes: recipesList,
      };
    }

    case "add_shopping_item": {
      const parsed = createShoppingItemSchema.parse(args);
      const item = await addShoppingItem(userId, parsed);
      return {
        success: true,
        message: `Added ${item.name} (${item.amount} ${item.unit}) to ${item.category} shopping list.`,
        item,
      };
    }

    default:
      throw new Error(
        `Tool '${toolName}' is not permitted or does not exist. The AI connector only has access to food tools.`,
      );
  }
}
