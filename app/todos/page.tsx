import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getDailyTodos, getPlannedDays, getTodoHistory } from "@/lib/todos";
import { addDays, toISODate } from "@/lib/format-date";
import { TodosClient } from "./todos-client";

export default async function TodosPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const today = toISODate();

  const [personalData, businessData, personalHistory, businessHistory, personalPlanned, businessPlanned] = await Promise.all([
    getDailyTodos(userId, "personal", today),
    getDailyTodos(userId, "business", today),
    getTodoHistory(userId, "personal"),
    getTodoHistory(userId, "business"),
    getPlannedDays(userId, "personal", addDays(today, -1)),
    getPlannedDays(userId, "business", addDays(today, -1)),
  ]);

  return (
    <TodosClient
      userName={session.user.name ?? "User"}
      todayDate={today}
      initialPersonalTodos={personalData.todos}
      initialBusinessTodos={businessData.todos}
      initialHistory={{ personal: personalHistory, business: businessHistory }}
      initialPlanned={{ personal: personalPlanned, business: businessPlanned }}
    />
  );
}

