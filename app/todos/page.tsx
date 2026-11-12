import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getCategories } from "@/lib/categories";
import { getDailyTodos } from "@/lib/todos";
import { toISODate } from "@/lib/format-date";
import { TodosClient } from "./todos-client";

export default async function TodosPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const today = toISODate();

  const [categories, personalData, businessData] = await Promise.all([
    getCategories(userId, ["personal", "business"]),
    getDailyTodos(userId, "personal", today),
    getDailyTodos(userId, "business", today),
  ]);

  return (
    <TodosClient
      userName={session.user.name ?? "User"}
      todayDate={today}
      initialPersonalTodos={personalData.todos}
      initialBusinessTodos={businessData.todos}
      initialCategories={categories}
    />
  );
}

