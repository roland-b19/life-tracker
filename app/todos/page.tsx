import { requirePageUser } from "@/server/auth";
import { getCategories } from "@/lib/categories";
import { getDailyTodos } from "@/lib/todos";
import { toISODate } from "@/lib/format-date";
import { TodosClient } from "./todos-client";

export default async function TodosPage() {
  const user = await requirePageUser();

  const today = toISODate();

  const [categories, personalData, businessData] = await Promise.all([
    getCategories(user.id, ["personal", "business"]),
    getDailyTodos(user.id, "personal", today),
    getDailyTodos(user.id, "business", today),
  ]);

  return (
    <TodosClient
      userName={user.name}
      todayDate={today}
      initialPersonalTodos={personalData.todos}
      initialBusinessTodos={businessData.todos}
      initialCategories={categories}
    />
  );
}

