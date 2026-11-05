import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getDailyTodos } from "@/lib/todos";
import { TodosClient } from "./todos-client";

function getTodayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default async function TodosPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const today = getTodayString();

  const [personalData, businessData] = await Promise.all([
    getDailyTodos(userId, "personal", today),
    getDailyTodos(userId, "business", today),
  ]);

  return (
    <TodosClient
      userName={session.user.name ?? "User"}
      todayDate={today}
      initialPersonalTodos={personalData.todos}
      initialBusinessTodos={businessData.todos}
    />
  );
}

