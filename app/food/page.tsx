import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  getDailyFoodSummary,
  getNutritionTargets,
  getPastFoods,
  getShoppingCategories,
  getShoppingList,
  getWeightAnalytics,
} from "@/lib/food";
import { toISODate } from "@/lib/format-date";
import { FoodClient } from "./food-client";

export default async function FoodPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const today = toISODate();

  const [targets, summary, weightAnalytics, shoppingList, shoppingCategories, pastFoods] = await Promise.all([
    getNutritionTargets(userId),
    getDailyFoodSummary(userId, today),
    getWeightAnalytics(userId, today),
    getShoppingList(userId),
    getShoppingCategories(userId),
    getPastFoods(userId),
  ]);

  return (
    <FoodClient
      userName={session.user.name ?? "User"}
      todayDate={today}
      targets={(({ calories, proteinGrams, carbsGrams, fatGrams, waterMl, steps }) => ({ calories, proteinGrams, carbsGrams, fatGrams, waterMl, steps }))(targets)}
      initialSummary={summary}
      weightAnalytics={weightAnalytics}
      initialShoppingList={shoppingList}
      shoppingCategories={shoppingCategories}
      pastFoods={pastFoods.map(({ name, calories, protein, carbs, fat, isEstimated }) => ({ name, calories, protein, carbs, fat, isEstimated }))}
    />
  );
}
