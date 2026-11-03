import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { WeightPage } from "./weight-page";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");
  return <WeightPage userName={session.user.name ?? "User"} />;
}
