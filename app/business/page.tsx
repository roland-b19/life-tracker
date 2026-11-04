import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getBusinessDashboard } from "@/lib/business";
import { getExpenseCategories } from "@/lib/money";
import { BusinessClient } from "./business-client";

interface PageProps {
  searchParams?: Promise<{
    month?: string;
  }>;
}

export default async function BusinessPage(props: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const searchParams = props.searchParams ? await props.searchParams : undefined;

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  if (searchParams?.month && /^\d{4}-\d{2}$/.test(searchParams.month)) {
    const [y, m] = searchParams.month.split("-").map(Number);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  const [dashboard, businessCategories] = await Promise.all([
    getBusinessDashboard(userId, year, month),
    getExpenseCategories(userId, "business"),
  ]);

  return (
    <BusinessClient
      userName={session.user.name ?? "User"}
      initialDashboard={dashboard}
      businessCategories={Array.from(new Set(businessCategories.map((c) => c.name)))}
    />
  );
}
