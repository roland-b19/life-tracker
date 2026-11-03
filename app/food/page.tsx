import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  getDailyFoodSummary,
  getNutritionTargets,
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

  const targets = await getNutritionTargets(userId);
  const summary = await getDailyFoodSummary(userId, today);
  const weightAnalytics = await getWeightAnalytics(userId);
  const shoppingList = await getShoppingList(userId);

  return (
    <FoodClient
      userName={session.user.name ?? "User"}
      todayDate={today}
      targets={targets}
      initialSummary={summary}
      weightAnalytics={weightAnalytics}
      initialShoppingList={shoppingList}
    />
  );
}
