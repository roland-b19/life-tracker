import { requirePageUser } from "@/server/auth";
import {
  getDailyFoodSummary,
  getNutritionTargets,
  getDailyMetricsHistory,
  getShoppingCategories,
  getShoppingList,
  listWeightEntries,
} from "@/lib/food";
import { addDays, toISODate } from "@/lib/format-date";
import { FoodClient } from "./food-client";

export default async function FoodPage() {
  const user = await requirePageUser("/health");

  const today = toISODate();

  const [targets, summary, weights, weekMetrics, shoppingList, shoppingCategories, shoppingUnits] = await Promise.all([
    getNutritionTargets(user.id),
    getDailyFoodSummary(user.id, today),
    listWeightEntries(user.id, addDays(today, -364)), // the page shows a year; the database keeps every weigh-in
    getDailyMetricsHistory(user.id, today),
    getShoppingList(user.id),
    getShoppingCategories(user.id),
    getShoppingCategories(user.id, "unit"),
  ]);

  return (
    <FoodClient
      userName={user.name}
      todayDate={today}
      targets={(({ calories, proteinGrams, carbsGrams, fatGrams, waterMl, steps }) => ({ calories, proteinGrams, carbsGrams, fatGrams, waterMl, steps }))(targets)}
      initialSummary={summary}
      initialWeights={weights}
      weekMetrics={weekMetrics}
      initialShoppingList={shoppingList}
      shoppingCategories={shoppingCategories}
      shoppingUnits={shoppingUnits}
    />
  );
}
