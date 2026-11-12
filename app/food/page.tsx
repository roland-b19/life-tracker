import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  getDailyFoodSummary,
  getNutritionTargets,
  getDailyMetricsHistory,
  getShoppingCategories,
  getShoppingList,
} from "@/lib/food";
import { addDays, toISODate } from "@/lib/format-date";
import { listWeightEntries } from "@/server/weight";
import { FoodClient } from "./food-client";

export default async function FoodPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const today = toISODate();

  const [targets, summary, weights, weekMetrics, shoppingList, shoppingCategories, shoppingUnits] = await Promise.all([
    getNutritionTargets(userId),
    getDailyFoodSummary(userId, today),
    listWeightEntries(userId, addDays(today, -364)), // the page shows a year; the database keeps every weigh-in
    getDailyMetricsHistory(userId, today),
    getShoppingList(userId),
    getShoppingCategories(userId),
    getShoppingCategories(userId, "unit"),
  ]);

  return (
    <FoodClient
      userName={session.user.name ?? "User"}
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
