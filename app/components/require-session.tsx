import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";

/**
 * Layout of every signed-in route: an anonymous visitor gets a real 307 to /signin before any page markup streams.
 * Each page still checks the session itself and reads its own user id.
 */
export default async function RequireSession({ children }: { children: ReactNode }) {
  if (!(await getServerSession(authOptions))?.user?.id) redirect("/signin");
  return children;
}
