import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  getDailyFoodSummary,
  getNutritionTargets,
  getPastFoods,
  getShoppingHistory,
  getShoppingList,
  getWeightAnalytics,
} from "@/lib/food";
import { FoodClient } from "./food-client";

function getTodayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default async function FoodPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const today = getTodayString();

  const [targets, summary, weightAnalytics, shoppingList, shoppingHistory, pastFoods] = await Promise.all([
    getNutritionTargets(userId),
    getDailyFoodSummary(userId, today),
    getWeightAnalytics(userId),
    getShoppingList(userId),
    getShoppingHistory(userId),
    getPastFoods(userId),
  ]);

  return (
    <FoodClient
      userName={session.user.name ?? "User"}
      todayDate={today}
      targets={targets}
      initialSummary={summary}
      weightAnalytics={weightAnalytics}
      initialShoppingList={shoppingList}
      pastFoods={pastFoods.map(({ name, calories, protein, carbs, fat, isEstimated }) => ({ name, calories, protein, carbs, fat, isEstimated }))}
      shoppingHistory={shoppingHistory.map(({ name, amount, unit, category }) => ({ name, amount, unit, category }))}
    />
  );
}
